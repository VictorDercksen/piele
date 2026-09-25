"""Live scores from the public URC GraphQL feed used by stats.unitedrugby.com.

One `matchstats(match_id: [...])` query returns every fixture of a round with its score,
clock and event list (fields introspected 25 September 2026). Before a match the feed
reports `match_status: "fixture"` and `period: "pre match"`; afterwards `"result"`,
`"post match"` and `finalised: 1`. Period events (`first half end`, `second half start`)
mark half time. Only scoring events and cards are kept for the match centre timeline.

The snapshot's lifetime follows the round: a minute while a match is live or about to start,
long once every started match is finalised. The feed stopped answering five minutes before
kickoff on 25 September 2026 and Cloudflare then blocked the polling address, so the service
falls back to ESPN (providers/espn.py) and backs off the URC feed for a few minutes.
"""

from datetime import datetime, timedelta
from typing import Any

import httpx

from app.matchcentre.cache import Fetched, ProviderError
from app.matchcentre.schedule import Fixture

# Queries start this long before a kickoff so a delayed or early start is picked up.
PRE_KICKOFF = timedelta(minutes=15)
# A match not finalised this long after kickoff no longer keeps the round polling.
MATCH_WINDOW = timedelta(hours=3)
TTL_LIVE = timedelta(minutes=1)
TTL_IDLE_MAX = timedelta(hours=6)
TTL_IDLE_MIN = timedelta(minutes=1)
TTL_FAILED = timedelta(minutes=1)
# After a failed URC request, the next attempt waits this long; ESPN serves meanwhile.
URC_BACKOFF = timedelta(minutes=5)

QUERY = """
query RoundScores($ids: [Int]) {
  matchstats(match_id: $ids) {
    match_id
    match_status
    match_period
    home_score
    away_score
    stats_data {
      matchStatus
      period
      minute
      timerRunning
      finalised
      homeTeam { id score { currentScore htScore } }
      awayTeam { id score { currentScore htScore } }
      events {
        id
        minute
        second
        time
        display
        type { name }
        period { name }
        team { id }
        player { name }
      }
    }
  }
}
"""

# Event display text to timeline kind and points.
SCORING = {
    "try": ("try", 5),
    "penalty try": ("penalty_try", 7),
    "conversion": ("conversion", 2),
    "penalty goal": ("penalty_goal", 3),
    "drop goal": ("drop_goal", 3),
}
CARDS = {"yellow": "yellow_card", "red": "red_card"}
FINISHED = {"full_time", "postponed", "cancelled"}


def in_play_window(fixture: Fixture, now: datetime) -> bool:
    """True from shortly before kickoff until the match window closes."""
    if fixture.kickoff_utc is None:
        return False
    return fixture.kickoff_utc - PRE_KICKOFF <= now <= fixture.kickoff_utc + MATCH_WINDOW


def started(fixture: Fixture, now: datetime) -> bool:
    return fixture.kickoff_utc is not None and fixture.kickoff_utc - PRE_KICKOFF <= now


def fetch_scores(
    client: httpx.Client, url: str, fixtures: list[Fixture], now: datetime
) -> Fetched:
    response = client.post(
        url,
        json={"query": QUERY, "variables": {"ids": [int(f.id) for f in fixtures]}},
        headers={"Accept": "application/json"},
    )
    response.raise_for_status()
    body = response.json()
    if body.get("errors"):
        raise ProviderError(str(body["errors"][0].get("message", ""))[:200])
    rows = (body.get("data") or {}).get("matchstats") or []
    matches = {
        str(row.get("match_id")): parse_match(row) for row in rows if isinstance(row, dict)
    }
    return Fetched("ok", {"matches": matches}, snapshot_ttl(fixtures, matches, now))


def snapshot_ttl(
    fixtures: list[Fixture], matches: dict[str, dict[str, Any]], now: datetime
) -> timedelta:
    """Short while any match is in play or due; otherwise until the next kickoff window."""
    upcoming: list[datetime] = []
    for fixture in fixtures:
        state = (matches.get(fixture.id) or {}).get("state", "scheduled")
        if state in FINISHED or fixture.kickoff_utc is None:
            continue
        if in_play_window(fixture, now):
            return TTL_LIVE
        if fixture.kickoff_utc - PRE_KICKOFF > now:
            upcoming.append(fixture.kickoff_utc - PRE_KICKOFF)
    if upcoming:
        return max(TTL_IDLE_MIN, min(TTL_IDLE_MAX, min(upcoming) - now))
    return TTL_IDLE_MAX


def parse_match(row: dict[str, Any]) -> dict[str, Any]:
    stats = row.get("stats_data") if isinstance(row.get("stats_data"), dict) else {}
    home = stats.get("homeTeam") if isinstance(stats.get("homeTeam"), dict) else {}
    away = stats.get("awayTeam") if isinstance(stats.get("awayTeam"), dict) else {}
    raw_events = [e for e in stats.get("events") or [] if isinstance(e, dict)]
    raw_events.sort(key=lambda e: (_int(e.get("minute")) or 0, _int(e.get("second")) or 0, e.get("id") or 0))
    status = str(stats.get("matchStatus") or row.get("match_status") or "").lower()
    period = str(stats.get("period") or row.get("match_period") or "").lower()
    finalised = bool(stats.get("finalised"))
    state = match_state(status, period, finalised, raw_events)
    home_score = _score(home, "currentScore", row.get("home_score"))
    away_score = _score(away, "currentScore", row.get("away_score"))
    scored = state != "scheduled"
    return {
        "state": state,
        "period": period or None,
        "minute": _int(stats.get("minute")) if state in ("live", "half_time") else None,
        "clockRunning": bool(stats.get("timerRunning")),
        "home": {
            "score": home_score if scored else None,
            "halfTime": _score(home, "htScore", None) if scored else None,
        },
        "away": {
            "score": away_score if scored else None,
            "halfTime": _score(away, "htScore", None) if scored else None,
        },
        "events": timeline(raw_events, _int(home.get("id")), _int(away.get("id"))),
    }


def match_state(status: str, period: str, finalised: bool, events: list[dict[str, Any]]) -> str:
    if "postpon" in status:
        return "postponed"
    if "cancel" in status or "abandon" in status:
        return "cancelled"
    if finalised or status == "result" or period == "post match":
        return "full_time"
    if "half time" in period or "half-time" in period:
        return "half_time"
    if period in ("", "pre match") and status in ("", "fixture"):
        return "scheduled"
    markers = [str(e.get("display") or "") for e in events if _type(e) == "period"]
    if markers and markers[-1] == "first half end":
        return "half_time"
    return "live"


def timeline(events: list[dict[str, Any]], home_id: int | None, away_id: int | None) -> list[dict[str, Any]]:
    """Scoring events and cards in match order, with the running score after each."""
    items: list[dict[str, Any]] = []
    running = {"home": 0, "away": 0}
    for event in events:
        display = str(event.get("display") or "").lower()
        kind, points = SCORING.get(display, (None, 0)) if _type(event) in ("try", "goal kick") else (None, 0)
        if kind is None and _type(event) == "card":
            kind = CARDS.get(display)
        if kind is None:
            continue
        team_id = _int((event.get("team") or {}).get("id"))
        side = "home" if team_id == home_id else "away" if team_id == away_id else None
        if side and points:
            running[side] += points
        player = event.get("player") if isinstance(event.get("player"), dict) else {}
        period = event.get("period") if isinstance(event.get("period"), dict) else {}
        items.append(
            {
                "id": event.get("id"),
                "minute": _int(event.get("minute")),
                "time": str(event.get("time") or event.get("minute") or ""),
                "period": period.get("name"),
                "side": side,
                "kind": kind,
                "points": points,
                "player": player.get("name"),
                "score": [running["home"], running["away"]] if points else None,
            }
        )
    return items


def _type(event: dict[str, Any]) -> str:
    kind = event.get("type")
    return str(kind.get("name") or "").lower() if isinstance(kind, dict) else ""


def _score(side: dict[str, Any], key: str, fallback: Any) -> int | None:
    score = side.get("score") if isinstance(side.get("score"), dict) else {}
    value = _int(score.get(key))
    return value if value is not None else _int(fallback)


def _int(value: Any) -> int | None:
    if isinstance(value, bool) or value is None or value == "":
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None
