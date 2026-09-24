"""Teamsheets from the public URC GraphQL feed used by stats.unitedrugby.com.

The lineup selection matches the feed's introspected schema (checked 23 September 2026):
`stats_data.homeTeam.players { id name knownName firstName lastName position { name
shirtNumber onFieldName } }`. The feed has no captain flag. Starters are shirts 1 to 15.

Date and country of birth come from a second query, `players(id: [...]) { id player_data
{ dob countryOfBirth { name } } }`, keyed by the lineup's player ids (checked 24 September
2026). The feed's `nationalTeam` field fails server-side, so country of birth stands in for
nationality. A failed lookup leaves both fields null and never fails the teamsheet.

Teamsheets are usually published about 48 hours before kickoff, so the feed is queried
only from three days out; earlier requests return `not_published` without a call.
"""

import logging
from datetime import date, datetime, timedelta
from typing import Any

import httpx

from app.matchcentre.cache import Fetched

PUBLISH_WINDOW = timedelta(days=3)
TTL_PUBLISHED = timedelta(hours=6)
TTL_PENDING = timedelta(minutes=20)
TTL_FAILED = timedelta(minutes=10)
STARTERS = 15

PLAYER_FIELDS = "players { id name knownName firstName lastName position { id name shirtNumber onFieldId onFieldName } }"

QUERY = """
query Teamsheets($ids: [Int]) {
  matchstats(match_id: $ids) {
    match_id
    match_status
    stats_data {
      id
      matchStatus
      homeTeam { team { id name } %s }
      awayTeam { team { id name } %s }
    }
  }
}
""" % (PLAYER_FIELDS, PLAYER_FIELDS)

BIOS_QUERY = """
query Bios($ids: [Int], $limit: Int) {
  players(id: $ids, limit: $limit) { id player_data { dob countryOfBirth { name } } }
}
"""

logger = logging.getLogger(__name__)

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
        payload: dict[str, Any] = {
            "reason": "feed rejected the teamsheet query",
            "feedErrors": [str(e.get("message", ""))[:300] for e in body["errors"][:5]],
        }
        payload.update(discover_fields(client, url))
        return Fetched("unavailable", payload, TTL_FAILED)
    rows = (body.get("data") or {}).get("matchstats") or []
    row = next((r for r in rows if str(r.get("match_id")) == str(fixture_id)), None)
    if row is None:
        return Fetched("unavailable", {"reason": "fixture not in feed"}, TTL_FAILED)
    stats = row.get("stats_data") or {}
    home = parse_side(stats.get("homeTeam") or {})
    away = parse_side(stats.get("awayTeam") or {})
    status = stats.get("matchStatus") or row.get("match_status")
    if not home["starters"] and not away["starters"]:
        return Fetched("not_published", {"matchStatus": status}, TTL_PENDING)
    bios = fetch_bios(client, url, [p["id"] for p in _players(home) + _players(away)])
    payload = {"matchStatus": status, "home": with_bios(home, bios), "away": with_bios(away, bios)}
    return Fetched("ok", payload, TTL_PUBLISHED)


def fetch_bios(client: httpx.Client, url: str, ids: list[int | None]) -> dict[int, dict[str, Any]]:
    """Date and country of birth by feed player id. Any failure yields an empty mapping."""
    wanted = sorted({i for i in ids if isinstance(i, int)})
    if not wanted:
        return {}
    try:
        response = client.post(
            url,
            json={"query": BIOS_QUERY, "variables": {"ids": wanted, "limit": len(wanted)}},
            headers={"Accept": "application/json"},
        )
        response.raise_for_status()
        rows = (response.json().get("data") or {}).get("players") or []
    except (httpx.HTTPError, ValueError) as error:
        logger.warning("player bio lookup failed: %s", type(error).__name__)
        return {}
    bios: dict[int, dict[str, Any]] = {}
    for row in rows:
        if not isinstance(row, dict) or not isinstance(row.get("id"), int):
            continue
        data = row.get("player_data") if isinstance(row.get("player_data"), dict) else {}
        birth = data.get("countryOfBirth") if isinstance(data.get("countryOfBirth"), dict) else {}
        bios[row["id"]] = {
            "dateOfBirth": _iso_date(data.get("dob")),
            "birthCountry": birth.get("name") or None,
        }
    return bios


def with_bios(side: dict[str, Any], bios: dict[int, dict[str, Any]]) -> dict[str, Any]:
    """The side with each player's bio fields added and the internal feed id removed."""

    def merge(player: dict[str, Any]) -> dict[str, Any]:
        rest = {k: v for k, v in player.items() if k != "id"}
        bio = bios.get(player["id"]) or {}
        return {**rest, "dateOfBirth": bio.get("dateOfBirth"), "birthCountry": bio.get("birthCountry")}

    return {key: [merge(p) for p in players] for key, players in side.items()}


def _players(side: dict[str, Any]) -> list[dict[str, Any]]:
    return side["starters"] + side["replacements"]


def _iso_date(value: Any) -> str | None:
    """`1998-04-19T12:00:00.000Z` as `1998-04-19`, or None when it is not a date."""
    if not isinstance(value, str):
        return None
    try:
        return date.fromisoformat(value[:10]).isoformat()
    except ValueError:
        return None


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
    position = raw.get("position") if isinstance(raw.get("position"), dict) else {}
    name = person.get("knownName") or person.get("name") or person.get("fullName")
    if not name:
        name = " ".join(
            part for part in (person.get("firstName"), person.get("lastName")) if part
        )
    number = _first_int(position, NUMBER_KEYS)
    if number is None:
        number = _first_int(raw, NUMBER_KEYS)
    feed_id = person.get("id")
    return {
        "id": feed_id if isinstance(feed_id, int) else None,
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


INTROSPECT_FIELDS = "fields { name type { name kind ofType { name kind ofType { name kind ofType { name } } } } }"


def discover_fields(client: httpx.Client, url: str) -> dict[str, Any]:
    """Field names of the feed's match object, so a rejected query can be corrected.

    Walks query -> matchstats -> stats_data -> homeTeam through introspection. Any failure
    (introspection disabled, unexpected shape) yields an empty result.
    """
    try:
        root = _introspect(client, url, "{ __schema { queryType { %s } } }" % INTROSPECT_FIELDS)
        match_type = _field_type(root.get("__schema", {}).get("queryType", {}), "matchstats")
        match_fields = _type_fields(client, url, match_type)
        stats_type = _field_type({"fields": match_fields}, "stats_data")
        stats_fields = _type_fields(client, url, stats_type)
        team_type = _field_type({"fields": stats_fields}, "homeTeam")
        team_fields = _type_fields(client, url, team_type)
        player_type = _field_type({"fields": team_fields}, "players")
        player_fields = _type_fields(client, url, player_type)
        nested = {}
        for field in player_fields[:12]:
            kind = _kind(field.get("type"))
            if kind == "OBJECT":
                nested[field["name"]] = [
                    _describe(f) for f in _type_fields(client, url, _named(field.get("type")))
                ][:30]
    except Exception:  # noqa: BLE001 - diagnostics only
        return {}
    return {
        "feedFields": {
            "stats_data": [_describe(f) for f in stats_fields][:60],
            "homeTeam": [_describe(f) for f in team_fields][:60],
            "players": [_describe(f) for f in player_fields][:60],
            **{f"players.{name}": fields for name, fields in nested.items()},
        }
    }


def _introspect(client: httpx.Client, url: str, query: str) -> dict[str, Any]:
    response = client.post(url, json={"query": query}, headers={"Accept": "application/json"})
    response.raise_for_status()
    return response.json().get("data") or {}


def _type_fields(client: httpx.Client, url: str, type_name: str | None) -> list[dict[str, Any]]:
    if not type_name:
        return []
    data = _introspect(
        client, url, '{ __type(name: "%s") { %s } }' % (type_name, INTROSPECT_FIELDS)
    )
    return (data.get("__type") or {}).get("fields") or []


def _field_type(holder: dict[str, Any], name: str) -> str | None:
    for field in holder.get("fields") or []:
        if field.get("name") == name:
            return _named(field.get("type"))
    return None


def _named(type_ref: dict[str, Any] | None) -> str | None:
    while isinstance(type_ref, dict):
        if type_ref.get("name"):
            return str(type_ref["name"])
        type_ref = type_ref.get("ofType")
    return None


def _kind(type_ref: dict[str, Any] | None) -> str | None:
    """The innermost kind (OBJECT, SCALAR, ENUM) of a possibly wrapped type."""
    kind = None
    while isinstance(type_ref, dict):
        kind = type_ref.get("kind") or kind
        if type_ref.get("name"):
            return str(type_ref.get("kind") or kind)
        type_ref = type_ref.get("ofType")
    return kind


def _describe(field: dict[str, Any]) -> str:
    return f"{field.get('name')}: {_named(field.get('type')) or '?'}"
