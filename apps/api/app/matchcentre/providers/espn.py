"""Fallback live scores from ESPN's public URC scoreboard, used when the URC feed fails.

`GET {scoreboard}?dates=YYYYMMDD` lists a day's URC matches (checked 25 September 2026).
Each event has `status.type { name state }` (`STATUS_SCHEDULED`/`pre`, `STATUS_FIRST_HALF`/`in`,
`STATUS_FINAL`/`post`) and competitors with `homeAway`, `team.id` and `score`. ESPN's clock
(`displayClock`) stayed at `1'` through a live match and its per-half line scores are
inconsistent, so only the state and score are used: no minute, half-time score or timeline.
Matches are paired with fixtures by ESPN team id.
"""

from datetime import datetime
from typing import Any

import httpx

from app.matchcentre.cache import Fetched
from app.matchcentre.providers import scores
from app.matchcentre.schedule import Fixture

SOURCE = "ESPN"

# ESPN team ids to club catalogue ids.
TEAMS = {
    "25927": "benetton-rugby",
    "25953": "vodacom-bulls",
    "25965": "cardiff-rugby",
    "25923": "connacht-rugby",
    "25967": "dragons-rfc",
    "25951": "edinburgh-rugby",
    "25952": "glasgow-warriors",
    "25924": "leinster-rugby",
    "25958": "10bet-lions",
    "25925": "munster-rugby",
    "25968": "ospreys",
    "25966": "scarlets",
    "25961": "hollywoodbets-sharks",
    "25962": "dhl-stormers",
    "25926": "ulster-rugby",
    "167124": "zebre-parma",
}


def fetch_scores(client: httpx.Client, url: str, fixtures: list[Fixture], now: datetime) -> Fetched:
    """Scores for the round's started fixtures, one request per kickoff date."""
    wanted = {
        (f.home_id, f.away_id): f.id
        for f in fixtures
        if scores.started(f, now) and f.home_id and f.away_id
    }
    dates = sorted({f.kickoff_utc.strftime("%Y%m%d") for f in fixtures if scores.started(f, now)})
    matches: dict[str, dict[str, Any]] = {}
    for day in dates:
        response = client.get(url, params={"dates": day}, headers={"Accept": "application/json"})
        response.raise_for_status()
        for event in response.json().get("events") or []:
            parsed = parse_event(event)
            if parsed is None:
                continue
            pair, match = parsed
            if pair in wanted:
                matches[wanted[pair]] = match
    payload = {"matches": matches, "source": SOURCE, "timeline": False}
    return Fetched("ok", payload, scores.snapshot_ttl(fixtures, matches, now))


def parse_event(event: dict[str, Any]) -> tuple[tuple[str, str], dict[str, Any]] | None:
    competitions = event.get("competitions") or []
    competitors = (competitions[0].get("competitors") if competitions else None) or []
    sides = {c.get("homeAway"): c for c in competitors if isinstance(c, dict)}
    home, away = sides.get("home"), sides.get("away")
    if not home or not away:
        return None
    home_id = TEAMS.get(str((home.get("team") or {}).get("id")))
    away_id = TEAMS.get(str((away.get("team") or {}).get("id")))
    if not home_id or not away_id:
        return None
    kind = ((event.get("status") or {}).get("type")) or {}
    state = event_state(str(kind.get("name") or ""), str(kind.get("state") or ""))
    scored = state in ("live", "half_time", "full_time")
    return (home_id, away_id), {
        "state": state,
        "period": None,
        "minute": None,
        "clockRunning": False,
        "home": {"score": _int(home.get("score")) if scored else None, "halfTime": None},
        "away": {"score": _int(away.get("score")) if scored else None, "halfTime": None},
        "events": [],
    }


def event_state(name: str, state: str) -> str:
    name = name.upper()
    if "POSTPONED" in name:
        return "postponed"
    if "CANCEL" in name or "ABANDON" in name:
        return "cancelled"
    if "HALFTIME" in name or "HALF_TIME" in name:
        return "half_time"
    if state == "in":
        return "live"
    if state == "post":
        return "full_time"
    return "scheduled"


def _int(value: Any) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None
