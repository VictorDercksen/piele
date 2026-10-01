"""Form for one fixture: each side's recent results, its record this season and the two
clubs' past meetings.

Pure over plain values: the competition (club names, the current season's label), the
fixture, the current season's results section from `MatchCentreService.season_results` and
the bundled `History`. Only matches that kicked off before the fixture count, so the same
call stays correct for a fixture in the past. If the current season's snapshot is
unavailable the form still uses history and says so with `"currentSeason": "unavailable"`
(the season records are then None).

Shape:

    {"status": "ok",
     "home": {"recent": [Result...], "season": {played, won, drawn, lost, pointsFor, pointsAgainst} | None},
     "away": {...},
     "headToHead": [Meeting...]}

`Result` is {kickoffUtc, season, opponentId, opponent, atHome, for, against, outcome, venue},
most recent first, current season then history. `Meeting` is {kickoffUtc, season, homeId, home,
awayId, away, homeScore, awayScore, venue}, the last five between the two clubs in any season.
"""

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Mapping

from app.competitions.base import Competition
from app.matchcentre.history import History, parse_kickoff
from app.matchcentre.schedule import Fixture

RESULT_LIMIT = 5
MEETING_LIMIT = 5


@dataclass(frozen=True)
class Played:
    kickoff: datetime
    season: str
    home_id: str
    away_id: str
    home_score: int
    away_score: int
    venue: str | None
    current: bool


def build_form(
    competition: Competition,
    fixture: Fixture,
    current: Mapping[str, Any] | None,
    history: History,
    limit: int = RESULT_LIMIT,
) -> dict[str, Any]:
    """The form section for a fixture with known teams and kickoff."""
    assert fixture.kickoff_utc and fixture.home_id and fixture.away_id
    kickoff = fixture.kickoff_utc
    season_ok = current is not None and current.get("status") == "ok"
    matches = _current_matches(competition, current if season_ok else None) + _past_matches(history)
    matches = sorted((m for m in matches if m.kickoff < kickoff), key=lambda m: m.kickoff, reverse=True)
    if not matches and not season_ok:
        return {"status": "unavailable", "reason": "No results are available."}

    form: dict[str, Any] = {
        "status": "ok",
        "home": _side(competition, matches, fixture.home_id, limit, season_ok),
        "away": _side(competition, matches, fixture.away_id, limit, season_ok),
        "headToHead": [
            _meeting(competition, m)
            for m in matches
            if {m.home_id, m.away_id} == {fixture.home_id, fixture.away_id}
        ][:MEETING_LIMIT],
    }
    if not season_ok:
        form["currentSeason"] = "unavailable"
    return form


def _current_matches(competition: Competition, section: Mapping[str, Any] | None) -> list[Played]:
    label = competition.schedule().season
    rows = (section or {}).get("results") or []
    played = [
        Played(
            kickoff=kickoff,
            season=label,
            home_id=row["homeId"],
            away_id=row["awayId"],
            home_score=int(row["homeScore"]),
            away_score=int(row["awayScore"]),
            venue=row.get("venue"),
            current=True,
        )
        for row in rows
        if (kickoff := _instant(row.get("kickoffUtc"))) is not None
    ]
    return played


def _past_matches(history: History) -> list[Played]:
    return [
        Played(r.kickoff_utc, season.label, r.home_id, r.away_id, r.home_score, r.away_score, r.venue, False)
        for season in history.seasons
        for r in season.results
    ]


def _side(competition: Competition, matches: list[Played], team_id: str, limit: int, season_ok: bool) -> dict[str, Any]:
    own = [m for m in matches if team_id in (m.home_id, m.away_id)]
    return {
        "recent": [_result(competition, m, team_id) for m in own[:limit]],
        "season": _record([m for m in own if m.current], team_id) if season_ok else None,
    }


def _result(competition: Competition, match: Played, team_id: str) -> dict[str, Any]:
    at_home = match.home_id == team_id
    scored, conceded = (match.home_score, match.away_score) if at_home else (match.away_score, match.home_score)
    opponent_id = match.away_id if at_home else match.home_id
    return {
        "kickoffUtc": match.kickoff,
        "season": match.season,
        "opponentId": opponent_id,
        "opponent": _name(competition, opponent_id),
        "atHome": at_home,
        "for": scored,
        "against": conceded,
        "outcome": "won" if scored > conceded else "lost" if scored < conceded else "drawn",
        "venue": match.venue,
    }


def _record(matches: list[Played], team_id: str) -> dict[str, int]:
    record = {"played": 0, "won": 0, "drawn": 0, "lost": 0, "pointsFor": 0, "pointsAgainst": 0}
    for match in matches:
        at_home = match.home_id == team_id
        scored, conceded = (match.home_score, match.away_score) if at_home else (match.away_score, match.home_score)
        record["played"] += 1
        record["won" if scored > conceded else "lost" if scored < conceded else "drawn"] += 1
        record["pointsFor"] += scored
        record["pointsAgainst"] += conceded
    return record


def _meeting(competition: Competition, match: Played) -> dict[str, Any]:
    return {
        "kickoffUtc": match.kickoff,
        "season": match.season,
        "homeId": match.home_id,
        "home": _name(competition, match.home_id),
        "awayId": match.away_id,
        "away": _name(competition, match.away_id),
        "homeScore": match.home_score,
        "awayScore": match.away_score,
        "venue": match.venue,
    }


def _name(competition: Competition, club_id: str) -> str:
    club = competition.club(club_id)
    return club.name if club else club_id


def _instant(value: Any) -> datetime | None:
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    if isinstance(value, str) and value:
        try:
            return parse_kickoff(value)
        except ValueError:
            return None
    return None
