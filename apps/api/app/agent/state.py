"""Fixture state for the preview agent: the structured inputs a preview is written from.

Everything here is deterministic. For each side: the published teamsheet, changes from
the side's previous teamsheet, regular starters who are missing, player ages, the bench
split, rest days and travel. Plus the kickoff forecast. Teamsheets of earlier fixtures
come through the same snapshot cache as the match centre. Form from recorded results
needs piele.fixture_results (plan Phase A) and is reported as unavailable until then.
"""

import hashlib
import json
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime
from typing import Any, Literal

from app.matchcentre.catalogue import club, stadium
from app.matchcentre.schedule import Fixture, Schedule
from app.matchcentre.service import MatchCentreService

RECENT_FIXTURES = 3
# A player who started at least this many of the recent fixtures counts as a regular.
REGULAR_STARTS = 2
FORWARD_SHIRTS = range(1, 9)

Side = Literal["home", "away"]
Travel = Literal["home", "domestic", "cross_border", "intercontinental"]

# Checked before the back words, so "back row" is a forward.
FORWARD_WORDS = ("prop", "hooker", "lock", "second row", "flanker", "back row", "number 8", "no. 8", "no 8", "eight")
BACK_WORDS = ("half", "centre", "center", "wing", "full", "back")


def build_state(fixture: Fixture, schedule: Schedule, centre: MatchCentreService, now: datetime) -> dict[str, Any]:
    """The state for one fixture with known teams and kickoff."""
    assert fixture.kickoff_utc and fixture.home_id and fixture.away_id
    recent = {
        side: previous_fixtures(schedule, team, fixture.kickoff_utc)
        for side, team in (("home", fixture.home_id), ("away", fixture.away_id))
    }
    earlier = {f.id: f for fixtures in recent.values() for f in fixtures}
    with ThreadPoolExecutor(max_workers=4) as pool:
        current = pool.submit(centre.teamsheets, fixture, now)
        forecast = pool.submit(centre.weather, fixture, now)
        past = {fid: pool.submit(centre.teamsheets, f, now) for fid, f in earlier.items()}
        sheets = current.result()
        weather = forecast.result()
        past_sections = {fid: future.result() for fid, future in past.items()}

    venue = stadium(fixture.venue)
    sides = {}
    for side in ("home", "away"):
        team_id = fixture.home_id if side == "home" else fixture.away_id
        sheet = sheets.get(side) if sheets.get("status") == "ok" else None
        previous = [(f, side_sheet(past_sections[f.id], f, team_id)) for f in recent[side]]
        sides[side] = side_state(fixture, side, team_id, sheet, previous, venue.country if venue else None)

    state = {
        "fixtureId": fixture.id,
        "round": fixture.round,
        "kickoffUtc": fixture.kickoff_utc,
        "venue": fixture.venue,
        "city": venue.city if venue else None,
        "country": venue.country if venue else None,
        "teamsheetStatus": sheets.get("status"),
        "home": sides["home"],
        "away": sides["away"],
        "weather": weather,
        "form": {"status": "unavailable", "reason": "Match results are not recorded yet."},
        "teamsheetHash": teamsheet_hash(sheets),
    }
    return {**state, "stateHash": digest(state), "generatedAt": now}


def previous_fixtures(schedule: Schedule, team_id: str, before: datetime, limit: int = RECENT_FIXTURES) -> list[Fixture]:
    """The team's fixtures that kicked off before `before`, most recent first."""
    played = [
        f
        for f in schedule.fixtures
        if f.kickoff_utc is not None and f.kickoff_utc < before and team_id in (f.home_id, f.away_id)
    ]
    return sorted(played, key=lambda f: f.kickoff_utc, reverse=True)[:limit]  # type: ignore[arg-type, return-value]


def side_sheet(section: dict[str, Any], fixture: Fixture, team_id: str) -> dict[str, Any] | None:
    """The team's teamsheet from a fixture's teamsheets section, if it was published."""
    if section.get("status") != "ok":
        return None
    return section.get("home" if fixture.home_id == team_id else "away")


def side_state(
    fixture: Fixture,
    side: Side,
    team_id: str,
    sheet: dict[str, Any] | None,
    previous: list[tuple[Fixture, dict[str, Any] | None]],
    venue_country: str | None,
) -> dict[str, Any]:
    team = club(team_id)
    last = previous[0][0] if previous else None
    rest = (fixture.kickoff_utc - last.kickoff_utc).days if last and fixture.kickoff_utc and last.kickoff_utc else None
    earlier_sheets = [s for _, s in previous if s is not None]
    last_sheet = previous[0][1] if previous else None
    return {
        "club": {"id": team_id, "name": team.name, "shortName": team.short_name} if team else {"id": team_id},
        "clubCountry": team.country if team else None,
        "teamsheet": sheet,
        "recentFixtures": [
            {
                "fixtureId": f.id,
                "kickoffUtc": f.kickoff_utc,
                "atHome": f.home_id == team_id,
                "opponentId": f.away_id if f.home_id == team_id else f.home_id,
                "venue": f.venue,
                "teamsheetKnown": s is not None,
            }
            for f, s in previous
        ],
        "features": {
            "restDays": rest,
            "travel": travel(side, team.country if team else None, venue_country),
            "changesFromPrevious": changes(sheet, last_sheet, last.id) if sheet and last and last_sheet else None,
            "regularStartersMissing": regulars_missing(sheet, earlier_sheets) if sheet else None,
            "ages": ages(sheet, fixture.kickoff_utc.date()) if sheet and fixture.kickoff_utc else None,
            "bench": bench_split(sheet) if sheet else None,
        },
    }


def travel(side: Side, club_country: str | None, venue_country: str | None) -> Travel | None:
    if side == "home":
        return "home"
    if not club_country or not venue_country:
        return None
    if club_country == venue_country:
        return "domestic"
    if "South Africa" in (club_country, venue_country):
        return "intercontinental"
    return "cross_border"


def changes(sheet: dict[str, Any], before: dict[str, Any], compared_with: str) -> dict[str, Any]:
    """Starters in and out against the previous teamsheet, and starters who changed shirt."""
    now_numbers = {p["name"]: p["number"] for p in sheet["starters"]}
    then_numbers = {p["name"]: p["number"] for p in before["starters"]}
    return {
        "comparedWith": compared_with,
        "startersIn": [name for name in now_numbers if name not in then_numbers],
        "startersOut": [name for name in then_numbers if name not in now_numbers],
        "shirtChanges": [
            {"name": name, "from": then_numbers[name], "to": number}
            for name, number in now_numbers.items()
            if name in then_numbers and then_numbers[name] != number
        ],
    }


def regulars_missing(sheet: dict[str, Any], earlier: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Players who started at least REGULAR_STARTS recent fixtures but do not start this one."""
    starts: dict[str, int] = {}
    for previous in earlier:
        for player in previous["starters"]:
            starts[player["name"]] = starts.get(player["name"], 0) + 1
    starting = {p["name"] for p in sheet["starters"]}
    bench = {p["name"] for p in sheet["replacements"]}
    return [
        {"name": name, "starts": count, "of": len(earlier), "onBench": name in bench}
        for name, count in sorted(starts.items(), key=lambda item: (-item[1], item[0]))
        if count >= REGULAR_STARTS and name not in starting
    ]


def ages(sheet: dict[str, Any], on: date) -> dict[str, Any]:
    """Average ages at kickoff, in years to one decimal, over players with a known birth date."""

    def average(players: list[dict[str, Any]]) -> float | None:
        known = [age for age in (_age(p.get("dateOfBirth"), on) for p in players) if age is not None]
        return round(sum(known) / len(known), 1) if known else None

    starters = sheet["starters"]
    return {
        "starters": average(starters),
        "forwards": average([p for p in starters if p["number"] in FORWARD_SHIRTS]),
        "backs": average([p for p in starters if p["number"] not in FORWARD_SHIRTS]),
        "replacements": average(sheet["replacements"]),
        "known": sum(1 for p in starters + sheet["replacements"] if _age(p.get("dateOfBirth"), on) is not None),
    }


def bench_split(sheet: dict[str, Any]) -> dict[str, int]:
    split = {"forwards": 0, "backs": 0, "unknown": 0}
    for player in sheet["replacements"]:
        group = position_group(player.get("position"))
        split[f"{group}s" if group else "unknown"] += 1
    return split


def position_group(position: str | None) -> Literal["forward", "back"] | None:
    name = (position or "").lower()
    if any(word in name for word in FORWARD_WORDS):
        return "forward"
    if any(word in name for word in BACK_WORDS):
        return "back"
    return None


def teamsheet_hash(section: dict[str, Any]) -> str | None:
    """sha256 of both published line-ups (shirt, name, position), or None before publication."""
    if section.get("status") != "ok" or not section.get("home") or not section.get("away"):
        return None
    lineup = {
        side: [
            [p["number"], p["name"], p.get("position")]
            for p in section[side]["starters"] + section[side]["replacements"]
        ]
        for side in ("home", "away")
    }
    return digest(lineup)


def digest(value: Any) -> str:
    encoded = json.dumps(value, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(encoded.encode()).hexdigest()


def _age(date_of_birth: str | None, on: date) -> float | None:
    try:
        born = date.fromisoformat(date_of_birth or "")
    except ValueError:
        return None
    return (on - born).days / 365.25
