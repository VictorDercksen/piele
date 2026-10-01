"""Season results from the public URC GraphQL feed used by stats.unitedrugby.com.

One `matchstats(season_id: [...], limit: 400)` query returns every fixture of a season (151
for 2026/27, checked 1 October 2026), played or not. Finished matches have `match_status:
"result"`. `match_datetime` is a UTC wall-clock string (`2026-09-25 18:45:00`). Team ids are
the catalogue's `Club.source_id`. Unplayed play-off rows carry team id 0 and the name `TBD`.

This module keeps only played matches with both teams known, in feed ids. The match centre
service maps them to catalogue club ids and the history import script (scripts/
import_urc_history.py) reuses the query and parser for past seasons.

The snapshot is refreshed every 30 minutes while a match kicked off in the last four hours,
and otherwise when the next kickoff arrives, between 10 minutes and 6 hours from now.
"""

from datetime import datetime, timedelta, timezone
from typing import Any

import httpx

from app.matchcentre.cache import Fetched, ProviderError

QUERY = """
query SeasonResults($season: [Int], $limit: Int) {
  matchstats(season_id: $season, limit: $limit) {
    match_id
    home_team_id
    home_team_name
    away_team_id
    away_team_name
    home_score
    away_score
    match_status
    match_datetime
    venue
  }
}
"""

# A season has 151 fixtures; the feed's own default limit is lower.
LIMIT = 400
TTL_RECENT = timedelta(minutes=30)
TTL_MAX = timedelta(hours=6)
TTL_MIN = timedelta(minutes=10)
TTL_FAILED = timedelta(minutes=10)
RECENT_WINDOW = timedelta(hours=4)


def fetch_rows(client: httpx.Client, url: str, season_id: str | int) -> list[dict[str, Any]]:
    """Every fixture row of one season, as the feed returns them."""
    response = client.post(
        url,
        json={"query": QUERY, "variables": {"season": [int(season_id)], "limit": LIMIT}},
        headers={"Accept": "application/json"},
    )
    response.raise_for_status()
    body = response.json()
    if body.get("errors"):
        raise ProviderError(str(body["errors"][0].get("message", ""))[:200])
    rows = (body.get("data") or {}).get("matchstats")
    if not isinstance(rows, list):
        raise ProviderError("no matchstats in the season response")
    return [row for row in rows if isinstance(row, dict)]


def fetch_season_results(
    client: httpx.Client, url: str, season_id: str | int, now: datetime | None = None
) -> Fetched:
    rows = fetch_rows(client, url, season_id)
    moment = now or datetime.now(timezone.utc)
    results = parse_results(rows)
    return Fetched("ok", {"seasonId": str(season_id), "results": results}, snapshot_ttl(rows, moment))


def parse_results(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Played matches with both teams known, oldest first. Anything else is skipped."""
    parsed = [result for row in rows if (result := parse_row(row)) is not None]
    return sorted(parsed, key=lambda r: (r["kickoffUtc"], r["fixtureId"]))


def parse_row(row: dict[str, Any]) -> dict[str, Any] | None:
    if str(row.get("match_status") or "").lower() != "result":
        return None
    home, away = _int(row.get("home_team_id")), _int(row.get("away_team_id"))
    home_score, away_score = _int(row.get("home_score")), _int(row.get("away_score"))
    kickoff = parse_datetime(row.get("match_datetime"))
    if not home or not away or home_score is None or away_score is None or kickoff is None or row.get("match_id") is None:
        return None
    return {
        "fixtureId": str(row["match_id"]),
        "homeSourceId": home,
        "awaySourceId": away,
        "homeScore": home_score,
        "awayScore": away_score,
        "kickoffUtc": kickoff.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "venue": row.get("venue") or None,
    }


def snapshot_ttl(rows: list[dict[str, Any]], now: datetime) -> timedelta:
    kickoffs = [k for k in (parse_datetime(row.get("match_datetime")) for row in rows) if k is not None]
    if any(now - RECENT_WINDOW <= kickoff <= now for kickoff in kickoffs):
        return TTL_RECENT
    upcoming = [kickoff for kickoff in kickoffs if kickoff > now]
    if upcoming:
        return max(TTL_MIN, min(TTL_MAX, min(upcoming) - now))
    return TTL_MAX


def parse_datetime(value: Any) -> datetime | None:
    """The feed's UTC wall-clock `2026-09-25 18:45:00` as an aware datetime."""
    if not isinstance(value, str) or not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed.replace(tzinfo=timezone.utc) if parsed.tzinfo is None else parsed.astimezone(timezone.utc)


def _int(value: Any) -> int | None:
    try:
        return int(value) if value is not None else None
    except (TypeError, ValueError):
        return None
