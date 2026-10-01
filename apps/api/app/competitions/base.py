"""What a competition is to the API: its schedule, clubs, stadiums, round structure and the
providers that report its teamsheets, live scores and season results, and its past seasons' results.

Rugby itself is fixed (shirts 1 to 15 start, the scoring timeline, the weather lookup), so
that stays shared code in app/matchcentre. A second rugby competition is one new folder
next to urc_2026_27 that builds a `Competition` and is listed in app/competitions/__init__.py.
"""

from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from threading import Lock
from typing import Any, Mapping, Protocol

import httpx
from fastapi import HTTPException

from app.config import Settings
from app.matchcentre.cache import Fetched
from app.matchcentre.history import History, load_history
from app.matchcentre.schedule import Fixture, Schedule, load_schedule


@dataclass(frozen=True)
class Club:
    id: str
    source_id: int
    name: str
    short_name: str
    country: str


@dataclass(frozen=True)
class Stadium:
    """Coordinates are approximate pitch locations used only for weather forecasts. The
    country is the rugby union (Belfast is Ireland), used to classify travel."""

    name: str
    city: str
    country: str
    latitude: float
    longitude: float


class ScoresProvider(Protocol):
    """Live scores for a round's started fixtures, keyed by fixture id in `payload.matches`."""

    source: str

    def fetch_scores(self, client: httpx.Client, settings: Settings, fixtures: list[Fixture], now: datetime) -> Fetched: ...


class FallbackScoresProvider(Protocol):
    """Scores used while the primary provider fails. Its payload names its own `source`."""

    def fetch_scores(self, client: httpx.Client, settings: Settings, fixtures: list[Fixture], now: datetime) -> Fetched: ...


class TeamsheetsProvider(Protocol):
    """Both published teamsheets of one fixture."""

    source: str

    def fetch_teamsheets(self, client: httpx.Client, settings: Settings, fixture: Fixture) -> Fetched: ...


class ResultsProvider(Protocol):
    """Every played match of the competition's current feed season, in feed team ids.
    The payload is `{"seasonId", "results": [{fixtureId, homeSourceId, awaySourceId, homeScore,
    awayScore, kickoffUtc, venue}]}`."""

    source: str

    def fetch_results(
        self, client: httpx.Client, settings: Settings, season_id: str, now: datetime
    ) -> Fetched: ...


@dataclass(frozen=True, eq=False)
class Competition:
    id: str
    name: str
    short_name: str
    # Only a default for display; leagues carry their own time zone.
    timezone: str
    regular_rounds: int
    last_round: int
    # Labels of the rounds after the regular season, e.g. {19: "QF"}.
    playoff_labels: Mapping[int, str]
    schedule_file: Path
    clubs: tuple[Club, ...]
    stadiums: tuple[Stadium, ...]
    scores: ScoresProvider
    teamsheets: TeamsheetsProvider
    fallback_scores: FallbackScoresProvider | None = None
    # The feed's id for this season (the URC's `202601`), and the provider that reads its results.
    feed_season_id: str | None = None
    season_results: ResultsProvider | None = None
    # Results of past seasons (app/competitions/<id>/history.json). None: no history.
    history_file: Path | None = None
    _loaded: dict[str, Any] = field(default_factory=dict, init=False, repr=False)
    _lock: Lock = field(default_factory=Lock, init=False, repr=False)

    def schedule(self) -> Schedule:
        """The bundled schedule, read once per competition."""
        with self._lock:
            if "schedule" not in self._loaded:
                self._loaded["schedule"] = load_schedule(self.schedule_file)
            return self._loaded["schedule"]

    def history(self) -> History:
        """The bundled results of past seasons, read once per competition. Empty without a file."""
        with self._lock:
            if "history" not in self._loaded:
                self._loaded["history"] = load_history(self.history_file)
            return self._loaded["history"]

    def club_by_source_id(self, source_id: int | None) -> Club | None:
        return next((club for club in self.clubs if club.source_id == source_id), None)

    def club(self, club_id: str | None) -> Club | None:
        return next((club for club in self.clubs if club.id == club_id), None)

    def stadium(self, venue: str | None) -> Stadium | None:
        name = (venue or "").lower()
        return next((stadium for stadium in self.stadiums if stadium.name.lower() == name), None)

    def round_label(self, round_number: int) -> str:
        if round_number <= self.regular_rounds:
            return f"Round {round_number:02d}"
        return f"Round {self.playoff_labels.get(round_number, round_number)}"

    def first_kickoff(self, round_number: int) -> datetime | None:
        kickoffs = [f.kickoff_utc for f in self.schedule().round(round_number) if f.kickoff_utc]
        return min(kickoffs) if kickoffs else None

    def validate_round(self, round_number: int) -> int:
        """The round number, or a 422 problem when the competition has no such round."""
        if not 1 <= round_number <= self.last_round:
            raise HTTPException(
                status_code=422,
                detail={"code": "unknown_round", "message": f"Rounds run from 1 to {self.last_round}."},
            )
        return round_number
