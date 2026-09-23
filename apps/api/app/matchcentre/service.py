"""Assembles the match centre for one fixture from cached provider snapshots."""

import logging
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from typing import Any, Callable

import httpx

from app.config import Settings
from app.matchcentre.cache import Fetched, Snapshot, SnapshotCache, cached, now_utc
from app.matchcentre.catalogue import Club, Stadium, club, stadium
from app.matchcentre.providers import odds, teamsheets, weather
from app.matchcentre.schedule import Fixture

logger = logging.getLogger(__name__)

HttpFactory = Callable[[], httpx.Client]

TEAMSHEETS_SOURCE = "URC match centre"
ODDS_SOURCE = "API-Sports Rugby"
WEATHER_SOURCE = "Open-Meteo"


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
                "teamsheets": pool.submit(self._teamsheets, fixture, moment),
                "odds": pool.submit(self._odds, fixture, home, away, moment),
                "weather": pool.submit(self._weather, fixture, moment),
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

    def _teamsheets(self, fixture: Fixture, now: datetime) -> dict[str, Any]:
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

    def _odds(
        self, fixture: Fixture, home: Club | None, away: Club | None, now: datetime
    ) -> dict[str, Any]:
        key = self._settings.rugby_api_key
        if key is None or not key.get_secret_value():
            return _section("unavailable", ODDS_SOURCE, reason="no API key configured")
        if fixture.kickoff_utc is None or home is None or away is None:
            return _section("too_early", ODDS_SOURCE)
        timing = odds.timing_status(fixture.kickoff_utc, now)
        if timing:
            return _section(timing, ODDS_SOURCE)
        api_key = key.get_secret_value()
        url = self._settings.rugby_api_url.rstrip("/")
        league = cached(
            self._cache,
            "odds:league",
            lambda: self._with_client(lambda c: odds.fetch_league(c, url, api_key)),
            now=now,
        )
        if league.status != "ok":
            return _from_snapshot(league, ODDS_SOURCE)
        league_id = league.payload["leagueId"]
        season = league.payload.get("season")
        day = fixture.kickoff_utc.date().isoformat()
        kickoff = fixture.kickoff_utc
        listing = cached(
            self._cache,
            f"odds:{league_id}:{season}:{day}",
            lambda: self._with_client(
                lambda c: odds.fetch_day(c, url, api_key, league_id, season, day)
            ),
            now=now,
        )
        if listing.status != "ok":
            return _from_snapshot(listing, ODDS_SOURCE)
        games = listing.payload.get("games") or []
        game = odds.select_game(games, home, away, kickoff)
        if game is None:
            return _section(
                "not_covered",
                ODDS_SOURCE,
                fetched_at=listing.fetched_at,
                reason="no game matched this fixture",
                league=league.payload.get("name"),
                season=season,
                games=[{"home": g.get("home"), "away": g.get("away"), "date": g.get("date")} for g in games][:20],
            )
        bookmakers = next(
            (o.get("bookmakers") or [] for o in listing.payload.get("odds") or [] if o.get("gameId") == game.get("id")),
            [],
        )
        summary = odds.summarise(bookmakers)
        if summary is None:
            return _section(
                "not_covered",
                ODDS_SOURCE,
                fetched_at=listing.fetched_at,
                reason="no prices for this game yet" if not bookmakers else "no winner market recognised",
                gameId=game.get("id"),
                bets=odds.bet_names(bookmakers),
            )
        return _section("ok", ODDS_SOURCE, fetched_at=listing.fetched_at, **summary)

    def _weather(self, fixture: Fixture, now: datetime) -> dict[str, Any]:
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


def _section(status: str, source: str, fetched_at: datetime | None = None, **payload: Any) -> dict[str, Any]:
    return {"status": status, "source": source, "fetchedAt": fetched_at, **payload}


def _from_snapshot(snapshot: Snapshot, source: str) -> dict[str, Any]:
    payload = dict(snapshot.payload)
    for bulky in ("events", "sports", "games", "odds"):
        payload.pop(bulky, None)
    return _section(snapshot.status, source, fetched_at=snapshot.fetched_at, **payload)


def default_http_factory(settings: Settings) -> HttpFactory:
    timeout = httpx.Timeout(settings.external_timeout_seconds)
    return lambda: httpx.Client(timeout=timeout, headers={"User-Agent": "Piele/0.1 match centre"})


__all__ = ["MatchCentreService", "default_http_factory"]
