"""Assembles the match centre (teamsheets, kickoff forecast, live score) from cached snapshots."""

import logging
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from typing import Any, Callable

import httpx

from app.config import Settings
from app.matchcentre.cache import Fetched, Snapshot, SnapshotCache, cached, now_utc
from app.matchcentre.catalogue import Club, Stadium, club, stadium
from app.matchcentre.providers import espn, scores, teamsheets, weather
from app.matchcentre.schedule import Fixture, load_schedule

logger = logging.getLogger(__name__)

HttpFactory = Callable[[], httpx.Client]

TEAMSHEETS_SOURCE = "URC match centre"
WEATHER_SOURCE = "Open-Meteo"
SCORES_SOURCE = "URC match centre"


class MatchCentreService:
    def __init__(self, settings: Settings, cache: SnapshotCache, http: HttpFactory) -> None:
        self._settings = settings
        self._cache = cache
        self._http = http

    def build(self, fixture: Fixture, now: datetime | None = None) -> dict[str, Any]:
        moment = now or now_utc()
        home = club(fixture.home_id)
        away = club(fixture.away_id)
        with ThreadPoolExecutor(max_workers=3) as pool:
            sections = {
                "teamsheets": pool.submit(self.teamsheets, fixture, moment),
                "weather": pool.submit(self.weather, fixture, moment),
                "score": pool.submit(self._score, fixture, moment),
            }
            results = {name: future.result() for name, future in sections.items()}
        return {
            "fixtureId": fixture.id,
            "round": fixture.round,
            "kickoffUtc": fixture.kickoff_utc,
            "venue": fixture.venue,
            "home": _club_view(home),
            "away": _club_view(away),
            "generatedAt": moment,
            **results,
        }

    def round_scores(self, round_number: int, now: datetime | None = None) -> dict[str, Any]:
        """Every fixture of a round with its state and score, without the event timelines."""
        moment = now or now_utc()
        fixtures = load_schedule().round(round_number)
        section = self._round_section(round_number, fixtures, moment)
        found = section.pop("matches", {})
        return {
            "round": round_number,
            "generatedAt": moment,
            **section,
            "matches": [
                {"fixtureId": f.id, **_without_events(found.get(f.id) or _scheduled())}
                for f in fixtures
            ],
        }

    def _score(self, fixture: Fixture, now: datetime) -> dict[str, Any]:
        if not scores.started(fixture, now):
            return _section("too_early", SCORES_SOURCE, **_scheduled())
        fixtures = load_schedule().round(fixture.round)
        section = self._round_section(fixture.round, fixtures, now)
        match = section.pop("matches", {}).get(fixture.id)
        if section["status"] == "ok" and match is None:
            return {**section, "status": "unavailable", "reason": "fixture not in feed"}
        return {**section, **(match or {})}

    def _round_section(self, round_number: int, fixtures: list[Fixture], now: datetime) -> dict[str, Any]:
        """The round's score snapshot. No feed call until a kickoff is near."""
        live = [f for f in fixtures if scores.started(f, now)]
        if not live:
            return _section("too_early", SCORES_SOURCE)
        key = f"scores:round:{round_number}"
        snapshot = cached(self._cache, key, lambda: self._fetch_round(key, fixtures, now), now=now)
        section = _from_snapshot(snapshot, SCORES_SOURCE)
        section.pop("urcRetryAt", None)
        return section

    def _fetch_round(self, key: str, fixtures: list[Fixture], now: datetime) -> Fetched:
        """The URC feed first; ESPN when it fails or is backing off after a failure."""
        retry_at = self._urc_retry_at(key)
        urc_error: Exception | None = None
        if retry_at is None or now >= retry_at:
            try:
                return self._with_client(
                    lambda c: scores.fetch_scores(c, self._settings.urc_graphql_url, fixtures, now)
                )
            except Exception as exc:  # noqa: BLE001 - the fallback decides what is reported
                logger.warning("URC scores failed for %s: %s", key, type(exc).__name__)
                urc_error = exc
                retry_at = now + scores.URC_BACKOFF
        try:
            fetched = self._with_client(
                lambda c: espn.fetch_scores(c, self._settings.espn_scoreboard_url, fixtures, now)
            )
        except Exception:
            if urc_error is not None:
                raise urc_error from None
            raise
        payload = {**fetched.payload, "urcRetryAt": retry_at.isoformat() if retry_at else None}
        return Fetched(fetched.status, payload, fetched.ttl)

    def _urc_retry_at(self, key: str) -> datetime | None:
        """When the URC feed may be tried again, from the round's last snapshot."""
        try:
            previous = self._cache.get(key)
        except Exception:  # noqa: BLE001 - no back-off without a readable cache
            return None
        value = previous.payload.get("urcRetryAt") if previous else None
        try:
            return datetime.fromisoformat(value) if isinstance(value, str) else None
        except ValueError:
            return None

    def teamsheets(self, fixture: Fixture, now: datetime) -> dict[str, Any]:
        """The teamsheets section, fetched through the snapshot cache."""
        if fixture.kickoff_utc is None or fixture.home_id is None or fixture.away_id is None:
            return _section("not_published", TEAMSHEETS_SOURCE)
        timing = teamsheets.timing_status(fixture.kickoff_utc, now)
        if timing:
            return _section(timing, TEAMSHEETS_SOURCE)
        snapshot = cached(
            self._cache,
            f"teamsheets:{fixture.id}",
            lambda: self._with_client(
                lambda c: teamsheets.fetch_teamsheets(
                    c, self._settings.urc_graphql_url, fixture.id
                )
            ),
            now=now,
        )
        return _from_snapshot(snapshot, TEAMSHEETS_SOURCE)

    def weather(self, fixture: Fixture, now: datetime) -> dict[str, Any]:
        """The kickoff forecast section, fetched through the snapshot cache."""
        place: Stadium | None = stadium(fixture.venue)
        if fixture.kickoff_utc is None or place is None:
            return _section("unavailable", WEATHER_SOURCE, reason="venue or kickoff unknown")
        timing = weather.timing_status(fixture.kickoff_utc, now)
        if timing:
            return _section(timing, WEATHER_SOURCE)
        kickoff = fixture.kickoff_utc
        snapshot = cached(
            self._cache,
            f"weather:{fixture.id}",
            lambda: self._with_client(
                lambda c: weather.fetch_forecast(c, self._settings.weather_api_url, place, kickoff)
            ),
            now=now,
        )
        return _from_snapshot(snapshot, WEATHER_SOURCE)

    def _with_client(self, call: Callable[[httpx.Client], Fetched]) -> Fetched:
        with self._http() as client:
            return call(client)


def _club_view(item: Club | None) -> dict[str, Any] | None:
    if item is None:
        return None
    return {"id": item.id, "name": item.name, "shortName": item.short_name}


def _scheduled() -> dict[str, Any]:
    return {
        "state": "scheduled",
        "period": None,
        "minute": None,
        "clockRunning": False,
        "home": {"score": None, "halfTime": None},
        "away": {"score": None, "halfTime": None},
        "events": [],
    }


def _without_events(match: dict[str, Any]) -> dict[str, Any]:
    return {k: v for k, v in match.items() if k != "events"}


def _section(status: str, source: str, fetched_at: datetime | None = None, **payload: Any) -> dict[str, Any]:
    return {"status": status, "source": source, "fetchedAt": fetched_at, **payload}


def _from_snapshot(snapshot: Snapshot, source: str) -> dict[str, Any]:
    """The snapshot as a section. A payload may name its own source (the ESPN fallback)."""
    payload = dict(snapshot.payload)
    source = payload.pop("source", source)
    return _section(snapshot.status, source, fetched_at=snapshot.fetched_at, **payload)


def default_http_factory(settings: Settings) -> HttpFactory:
    timeout = httpx.Timeout(settings.external_timeout_seconds)
    return lambda: httpx.Client(timeout=timeout, headers={"User-Agent": "Piele/0.1 match centre"})


__all__ = ["MatchCentreService", "default_http_factory"]
