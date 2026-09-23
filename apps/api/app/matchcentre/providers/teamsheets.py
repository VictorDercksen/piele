"""Teamsheets from the public URC GraphQL feed used by stats.unitedrugby.com.

Only the schedule fields of this feed are verified (see fixtures/README.md). The lineup
selection below is the expected shape of the same `stats_data` object and must be
confirmed with an introspection query from a network that can reach the feed. Until
then a rejected query is reported as `unavailable`, never as an empty teamsheet.

Teamsheets are usually published about 48 hours before kickoff, so the feed is queried
only from three days out; earlier requests return `not_published` without a call.
"""

from datetime import datetime, timedelta
from typing import Any

import httpx

from app.matchcentre.cache import Fetched

PUBLISH_WINDOW = timedelta(days=3)
TTL_PUBLISHED = timedelta(hours=6)
TTL_PENDING = timedelta(minutes=20)
TTL_FAILED = timedelta(minutes=10)
STARTERS = 15

QUERY = """
query Teamsheets($ids: [Int]) {
  matchstats(match_id: $ids) {
    match_id
    match_status
    stats_data {
      id
      homeTeam {
        team { id name }
        players { shirtNumber position isCaptain isStarter player { id name firstName lastName } }
      }
      awayTeam {
        team { id name }
        players { shirtNumber position isCaptain isStarter player { id name firstName lastName } }
      }
    }
  }
}
"""

PLAYER_LIST_KEYS = ("players", "teamSheet", "teamsheet", "lineup", "squad")
NUMBER_KEYS = ("shirtNumber", "number", "jerseyNumber", "shirt")
POSITION_KEYS = ("position", "positionName", "role")
CAPTAIN_KEYS = ("isCaptain", "captain")


def timing_status(kickoff: datetime, now: datetime) -> str | None:
    return "not_published" if now < kickoff - PUBLISH_WINDOW else None


def fetch_teamsheets(client: httpx.Client, url: str, fixture_id: str) -> Fetched:
    response = client.post(
        url,
        json={"query": QUERY, "variables": {"ids": [int(fixture_id)]}},
        headers={"Accept": "application/json"},
    )
    response.raise_for_status()
    body = response.json()
    if body.get("errors"):
        return Fetched("unavailable", {"reason": "feed rejected the teamsheet query"}, TTL_FAILED)
    rows = (body.get("data") or {}).get("matchstats") or []
    row = next((r for r in rows if str(r.get("match_id")) == str(fixture_id)), None)
    if row is None:
        return Fetched("unavailable", {"reason": "fixture not in feed"}, TTL_FAILED)
    stats = row.get("stats_data") or {}
    home = parse_side(stats.get("homeTeam") or {})
    away = parse_side(stats.get("awayTeam") or {})
    if not home["starters"] and not away["starters"]:
        return Fetched("not_published", {"matchStatus": row.get("match_status")}, TTL_PENDING)
    payload = {"matchStatus": row.get("match_status"), "home": home, "away": away}
    return Fetched("ok", payload, TTL_PUBLISHED)


def parse_side(side: dict[str, Any]) -> dict[str, Any]:
    players: list[dict[str, Any]] = []
    for key in PLAYER_LIST_KEYS:
        raw = side.get(key)
        if isinstance(raw, list) and raw:
            players = [parse_player(p, index) for index, p in enumerate(raw) if isinstance(p, dict)]
            break
    players.sort(key=lambda p: p["number"] or 99)
    starters = [p for p in players if _is_starter(p)]
    replacements = [p for p in players if not _is_starter(p)]
    return {"starters": starters, "replacements": replacements}


def parse_player(raw: dict[str, Any], index: int) -> dict[str, Any]:
    person = raw.get("player") if isinstance(raw.get("player"), dict) else raw
    name = person.get("name") or person.get("fullName") or person.get("displayName")
    if not name:
        name = " ".join(
            part for part in (person.get("firstName"), person.get("lastName")) if part
        )
    number = _first_int(raw, NUMBER_KEYS)
    return {
        "number": number if number is not None else index + 1,
        "name": name or "Unnamed player",
        "position": _first_str(raw, POSITION_KEYS),
        "captain": any(bool(raw.get(k)) for k in CAPTAIN_KEYS),
        "starter": raw.get("isStarter"),
    }


def _is_starter(player: dict[str, Any]) -> bool:
    if player["starter"] is not None:
        return bool(player["starter"])
    return player["number"] <= STARTERS


def _first_int(raw: dict[str, Any], keys: tuple[str, ...]) -> int | None:
    for key in keys:
        value = raw.get(key)
        if value is None or value == "":
            continue
        try:
            return int(value)
        except (TypeError, ValueError):
            continue
    return None


def _first_str(raw: dict[str, Any], keys: tuple[str, ...]) -> str | None:
    for key in keys:
        value = raw.get(key)
        if isinstance(value, dict):
            value = value.get("name")
        if value:
            return str(value)
    return None
