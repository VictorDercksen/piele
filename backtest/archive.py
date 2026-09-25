"""Past seasons from backtest/data as a StateSource for the API's build_state.

The source holds a whole season, results included; build_state wraps it in BeforeKickoff,
so a replayed fixture only sees fixtures, teamsheets and results from before its kickoff,
plus its own teamsheets and kickoff forecast.
"""

import json
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from functools import lru_cache
from pathlib import Path
from typing import Any, Sequence

import common

from app.agent.state import Result
from app.matchcentre.catalogue import CLUBS, stadium
from app.matchcentre.providers.weather import forecast_at
from app.matchcentre.schedule import Fixture

CLUB_BY_SOURCE_ID = {club.source_id: club.id for club in CLUBS}
TEAMSHEETS_SOURCE = "URC match centre"
WEATHER_SOURCE = "Open-Meteo Historical Forecast"


@dataclass(frozen=True)
class Match:
    season: str
    fixture: Fixture
    home_score: int
    away_score: int
    home_tries: int | None
    away_tries: int | None
    playoff: bool

    @property
    def kickoff(self) -> datetime:
        assert self.fixture.kickoff_utc is not None
        return self.fixture.kickoff_utc

    def result(self) -> Result:
        f = self.fixture
        assert f.kickoff_utc and f.home_id and f.away_id
        return Result(f.id, f.kickoff_utc, f.home_id, f.away_id, self.home_score, self.away_score,
                      self.home_tries, self.away_tries, table=not self.playoff)


def load_season(season: str, data: Path = common.DATA) -> list[Match]:
    """The season's played matches in kickoff order."""
    raw = json.loads((data / "seasons" / f"{season}.json").read_text(encoding="utf-8"))
    matches = [parse_match(season, row) for row in raw["matches"]]
    return sorted((m for m in matches if m is not None), key=lambda m: (m.kickoff, m.fixture.id))


def parse_match(season: str, row: dict[str, Any]) -> Match | None:
    stats = row.get("stats_data") or {}
    if row.get("home_score") is None or row.get("away_score") is None or row.get("match_status") != "result":
        return None
    home_source, away_source = row["home_team_id"], row["away_team_id"]
    tries = {home_source: 0, away_source: 0}
    for event in stats.get("events") or []:
        team = (event.get("team") or {}).get("id")
        if (event.get("type") or {}).get("name") == "try" and team in tries:
            tries[team] += 1
    kickoff = datetime.fromisoformat(row["match_datetime"]).replace(tzinfo=timezone.utc)
    fixture = Fixture(
        id=str(row["match_id"]),
        round=int(stats["round"]),
        home_id=CLUB_BY_SOURCE_ID[home_source],
        away_id=CLUB_BY_SOURCE_ID[away_source],
        kickoff_utc=kickoff,
        venue=row.get("venue"),
    )
    known = bool(stats.get("events"))
    return Match(season, fixture, int(row["home_score"]), int(row["away_score"]),
                 tries[home_source] if known else None, tries[away_source] if known else None,
                 playoff=stats.get("roundTypeId") != 1)


class ArchiveSource:
    """One season's downloaded fixtures, line-ups, forecasts and results."""

    def __init__(self, season: str, matches: Sequence[Match], data: Path = common.DATA) -> None:
        self._season, self._matches, self._data = season, list(matches), data

    def fixtures(self) -> Sequence[Fixture]:
        return [m.fixture for m in self._matches]

    def teamsheets(self, fixture: Fixture) -> dict[str, Any]:
        path = self._data / "lineups" / f"{fixture.id}.json"
        if not path.exists():
            return {"status": "unavailable", "source": TEAMSHEETS_SOURCE, "fetchedAt": None, "reason": "not collected"}
        record = _json(path)
        return {"status": record["status"], "source": TEAMSHEETS_SOURCE, "fetchedAt": None, **record["payload"]}

    def weather(self, fixture: Fixture) -> dict[str, Any]:
        place = stadium(fixture.venue)
        path = self._data / "weather" / self._season / f"{venue_slug(fixture.venue or '')}.json"
        if place is None or fixture.kickoff_utc is None or not path.exists():
            return {"status": "unavailable", "source": WEATHER_SOURCE, "fetchedAt": None, "reason": "not collected"}
        fetched = forecast_at(_json(path)["hourly"], place, fixture.kickoff_utc)
        return {"status": fetched.status, "source": WEATHER_SOURCE, "fetchedAt": None, **fetched.payload}

    def results(self, before: datetime) -> Sequence[Result] | None:
        return [m.result() for m in self._matches if m.kickoff < before]

    def player_names(self) -> set[str]:
        names: set[str] = set()
        for match in self._matches:
            section = self.teamsheets(match.fixture)
            for side in ("home", "away"):
                for player in (section.get(side) or {}).get("starters", []) + (section.get(side) or {}).get("replacements", []):
                    names.add(player["name"])
        return names


def venue_slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


@lru_cache(maxsize=4096)
def _json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))
