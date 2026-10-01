"""Players' international (Test) records: storage, name matching and the upsert.

Mirrors supabase/migrations/20261001150000_player_internationals.sql. Competition data shared
by every league: one row per club and player, found by the team researcher on a cited page
and stored by POST /v1/agent/previews when the player is in the side's current teamsheet.
The URC feed's nationalTeam field does not work and birth country is not the test team, so
this table is the only source of a player's test union. A row with origin 'operator' was
entered by hand and is never overwritten here.

`player_key` must give the same result as `playerKey` in apps/agent/agent/lib/internationals.ts
(the agent matches the known records to the selected players with it).
"""

import re
import unicodedata
from datetime import datetime
from typing import Any, Iterable, Mapping, Sequence

from sqlalchemy import (
    Column,
    Date,
    DateTime,
    Integer,
    MetaData,
    String,
    Table,
    Text,
    and_,
    case,
    func,
    literal,
    or_,
    select,
    update,
)
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.engine import Connection

metadata = MetaData()

player_internationals = Table(
    "player_internationals",
    metadata,
    Column("club_id", Text, primary_key=True),
    Column("player_key", Text, primary_key=True),
    Column("name", Text, nullable=False),
    Column("union_name", Text, nullable=False),
    Column("caps", Integer),
    Column("caps_as_of", Date),
    Column("last_test_on", Date),
    Column("source_url", Text, nullable=False),
    Column("source_title", Text, nullable=False),
    Column("source_publisher", Text),
    Column("origin", String, nullable=False, server_default="researcher"),
    Column("checked_at", DateTime(timezone=True), nullable=False, server_default=func.now()),
    schema="piele",
)

RESEARCHER = "researcher"
OPERATOR = "operator"
# JavaScript's \s, so the key of a name with an odd space is the agent's key too.
_SPACE = re.compile(r"[\t\n\v\f\r    -     　﻿]+")


def player_key(name: str) -> str:
    """The normalised name records are keyed and matched by: NFKD with the accents stripped,
    lower case, whitespace collapsed to single spaces. Apostrophes and hyphens stay as written."""
    decomposed = unicodedata.normalize("NFKD", name)
    unaccented = "".join(c for c in decomposed if not unicodedata.category(c).startswith("M"))
    return _SPACE.sub(" ", unaccented.lower()).strip(" ")


def selected_players(sheet: Mapping[str, Any] | None) -> list[Mapping[str, Any]]:
    """The starters and then the replacements of one side's published teamsheet."""
    if not isinstance(sheet, Mapping):
        return []
    return [p for p in (sheet.get("starters") or []) + (sheet.get("replacements") or []) if isinstance(p, Mapping)]


def matched(rows: Iterable[Mapping[str, Any]], sheet: Mapping[str, Any] | None) -> list[Mapping[str, Any]]:
    """The rows (anything with a `name`) whose key is that of a player in the teamsheet side,
    each player once (the first row wins). Nothing matches without a teamsheet."""
    keys = {player_key(str(p.get("name") or "")) for p in selected_players(sheet)} - {""}
    seen: set[str] = set()
    kept = []
    for row in rows:
        key = player_key(str(row.get("name") or ""))
        if key in keys and key not in seen:
            seen.add(key)
            kept.append(row)
    return kept


def upsert(connection: Connection, club_id: str, rows: Sequence[Mapping[str, Any]], now: datetime) -> int:
    """Store the researcher's records for a club's players; returns the rows written.

    Rows are `International` dumps (name, union, caps, capsAsOf, lastTestOn, url, title,
    publisher). A name whose key is empty is skipped, and a name given twice is stored once
    (the first). Two statements, because `piele_api` can only see researcher rows: an INSERT
    ... ON CONFLICT DO NOTHING, then an UPDATE of the researcher rows that were not inserted
    (an operator row matches neither, so it is left untouched and costs no error).

    The update never regresses a record: `last_test_on` is the later of the two dates, and
    `caps` with `caps_as_of` are replaced only when the new record has caps and its date is
    not older than the stored one (a new record without a date keeps a dated stored one).
    The union and the source are the newer run's.
    """
    values: dict[str, dict[str, Any]] = {}
    for row in rows:
        key = player_key(row["name"])
        if key and key not in values:
            values[key] = {
                "club_id": club_id,
                "player_key": key,
                "name": row["name"],
                "union_name": row["union"],
                "caps": row.get("caps"),
                "caps_as_of": row.get("capsAsOf"),
                "last_test_on": row.get("lastTestOn"),
                "source_url": row["url"],
                "source_title": row["title"],
                "source_publisher": row.get("publisher"),
                "origin": RESEARCHER,
                "checked_at": now,
            }
    if not values:
        return 0
    stored = player_internationals.c
    inserted = {
        key
        for (key,) in connection.execute(
            insert(player_internationals)
            .values(list(values.values()))
            .on_conflict_do_nothing(index_elements=[stored.club_id, stored.player_key])
            .returning(stored.player_key)
        )
    }
    written = len(inserted)
    for key, value in values.items():
        if key in inserted:
            continue
        caps, as_of = literal(value["caps"], Integer), literal(value["caps_as_of"], Date)
        replace_caps = and_(
            caps.is_not(None),
            or_(stored.caps.is_(None), stored.caps_as_of.is_(None), and_(as_of.is_not(None), as_of >= stored.caps_as_of)),
        )
        result = connection.execute(
            update(player_internationals)
            .where(stored.club_id == club_id, stored.player_key == key, stored.origin == RESEARCHER)
            .values(
                name=value["name"],
                union_name=value["union_name"],
                caps=case((replace_caps, caps), else_=stored.caps),
                caps_as_of=case((replace_caps, as_of), else_=stored.caps_as_of),
                last_test_on=func.greatest(literal(value["last_test_on"], Date), stored.last_test_on),
                source_url=value["source_url"],
                source_title=value["source_title"],
                source_publisher=value["source_publisher"],
                checked_at=value["checked_at"],
            )
        )
        written += result.rowcount
    return written


def for_clubs(connection: Connection, club_ids: Iterable[str | None]) -> dict[str, list[dict[str, Any]]]:
    """Every record of these clubs' players as plain dicts, by club id, ordered by name."""
    ids = sorted({c for c in club_ids if c})
    if not ids:
        return {}
    table = player_internationals.c
    found = connection.execute(
        select(player_internationals).where(table.club_id.in_(ids)).order_by(table.club_id, table.player_key)
    ).all()
    by_club: dict[str, list[dict[str, Any]]] = {club: [] for club in ids}
    for row in found:
        by_club[row.club_id].append(
            {
                "name": row.name,
                "union": row.union_name,
                "caps": row.caps,
                "capsAsOf": row.caps_as_of,
                "lastTestOn": row.last_test_on,
                "checkedAt": row.checked_at,
                "origin": row.origin,
                "url": row.source_url,
                "title": row.source_title,
                "publisher": row.source_publisher,
            }
        )
    return by_club


def state_view(rows: Iterable[Mapping[str, Any]]) -> list[dict[str, Any]]:
    """A record as the agent's fixture state carries it, with its source so the writer can
    cite it (url, title, publisher)."""
    keys = ("name", "union", "caps", "capsAsOf", "lastTestOn", "checkedAt", "origin", "url", "title", "publisher")
    return [{key: row[key] for key in keys} for row in rows]
