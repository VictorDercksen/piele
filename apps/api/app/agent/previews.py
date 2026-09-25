"""Stored match previews and the rule for when a fixture needs a new one.

Mirrors supabase/migrations/20260925120000_match_previews.sql. Previews are global
competition data: append-only revisions per fixture, written only through the API.
"""

from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import (
    CHAR,
    Column,
    DateTime,
    Integer,
    MetaData,
    String,
    Table,
    Text,
    func,
    insert,
    select,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.engine import Connection, Row
from sqlalchemy.exc import IntegrityError

from app.agent.state import teamsheet_hash
from app.matchcentre.providers.teamsheets import PUBLISH_WINDOW
from app.matchcentre.schedule import Fixture, Schedule
from app.matchcentre.service import MatchCentreService

metadata = MetaData()

match_previews = Table(
    "match_previews",
    metadata,
    Column("id", UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()),
    Column("fixture_id", String(40), nullable=False),
    Column("revision", Integer, nullable=False),
    Column("generated_at", DateTime(timezone=True), nullable=False, server_default=func.now()),
    Column("inputs_hash", CHAR(64), nullable=False),
    Column("teamsheet_hash", CHAR(64), nullable=False),
    Column("summary", Text, nullable=False),
    Column("key_factors", JSONB, nullable=False),
    Column("sentiment", JSONB, nullable=False),
    Column("sources", JSONB, nullable=False),
    Column("models", JSONB, nullable=False),
    Column("usage", JSONB),
    Column("run_id", String(200)),
    schema="piele",
)

# Before kickoff, a preview older than FINAL_REFRESH_AGE is rewritten once inside this window.
FINAL_REFRESH_WINDOW = timedelta(hours=2)
FINAL_REFRESH_AGE = timedelta(hours=6)
SAVE_ATTEMPTS = 3


class PreviewConflict(RuntimeError):
    """Concurrent submissions kept taking the next revision number."""


def open_for_preview(fixture: Fixture, now: datetime) -> bool:
    """Teams and kickoff known, kickoff ahead and inside the teamsheet publication window."""
    return (
        fixture.home_id is not None
        and fixture.away_id is not None
        and fixture.kickoff_utc is not None
        and now < fixture.kickoff_utc <= now + PUBLISH_WINDOW
    )


def due_reason(kickoff: datetime, now: datetime, current_hash: str | None, latest: Row | None) -> str | None:
    """Why the fixture needs a preview now, or None. Never after kickoff or before teamsheets."""
    if current_hash is None or now >= kickoff:
        return None
    if latest is None:
        return "first_preview"
    if latest.teamsheet_hash != current_hash:
        return "teamsheet_changed"
    if kickoff - now <= FINAL_REFRESH_WINDOW and now - latest.generated_at > FINAL_REFRESH_AGE:
        return "final_refresh"
    return None


def teamsheet_hashes(schedule: Schedule, centre: MatchCentreService, now: datetime) -> dict[Fixture, str | None]:
    """Current teamsheet hashes of the fixtures open for a preview. Calls providers; no database."""
    candidates = [f for f in schedule.fixtures if open_for_preview(f, now)]
    with ThreadPoolExecutor(max_workers=4) as pool:
        sections = list(pool.map(lambda f: centre.teamsheets(f, now), candidates))
    return {fixture: teamsheet_hash(section) for fixture, section in zip(candidates, sections)}


def due_fixtures(connection: Connection, hashes: dict[Fixture, str | None], now: datetime) -> list[dict[str, Any]]:
    latest = latest_by_fixture(connection, [f.id for f in hashes])
    due = []
    for fixture, current in sorted(hashes.items(), key=lambda item: (item[0].kickoff_utc, item[0].id)):
        assert fixture.kickoff_utc is not None
        previous = latest.get(fixture.id)
        reason = due_reason(fixture.kickoff_utc, now, current, previous)
        if reason:
            due.append(
                {
                    "fixtureId": fixture.id,
                    "round": fixture.round,
                    "kickoffUtc": fixture.kickoff_utc,
                    "homeId": fixture.home_id,
                    "awayId": fixture.away_id,
                    "reason": reason,
                    "teamsheetHash": current,
                    "latestRevision": previous.revision if previous else None,
                }
            )
    return due


def latest(connection: Connection, fixture_id: str) -> Row | None:
    return connection.execute(
        select(match_previews)
        .where(match_previews.c.fixture_id == fixture_id)
        .order_by(match_previews.c.revision.desc())
        .limit(1)
    ).first()


def latest_by_fixture(connection: Connection, fixture_ids: list[str]) -> dict[str, Row]:
    if not fixture_ids:
        return {}
    rows = connection.execute(
        select(match_previews)
        .where(match_previews.c.fixture_id.in_(fixture_ids))
        .distinct(match_previews.c.fixture_id)
        .order_by(match_previews.c.fixture_id, match_previews.c.revision.desc())
    ).all()
    return {row.fixture_id: row for row in rows}


def save(connection: Connection, values: dict[str, Any]) -> tuple[Row, bool]:
    """Insert the next revision. Returns the row and whether it was created.

    A run that was already stored (same fixture and run id) returns its preview unchanged,
    so the agent can retry a submission safely.
    """
    fixture_id, run_id = values["fixture_id"], values.get("run_id")
    for _ in range(SAVE_ATTEMPTS):
        if run_id:
            existing = _by_run(connection, fixture_id, run_id)
            if existing is not None:
                return existing, False
        revision = connection.execute(
            select(func.coalesce(func.max(match_previews.c.revision), 0) + 1).where(
                match_previews.c.fixture_id == fixture_id
            )
        ).scalar_one()
        try:
            with connection.begin_nested():
                row = connection.execute(
                    insert(match_previews).values(**values, revision=revision).returning(match_previews)
                ).one()
            return row, True
        except IntegrityError:
            continue  # another submission took this revision or run id; look again
    raise PreviewConflict(f"Could not store a preview for fixture {fixture_id}.")


def _by_run(connection: Connection, fixture_id: str, run_id: str) -> Row | None:
    return connection.execute(
        select(match_previews).where(match_previews.c.fixture_id == fixture_id, match_previews.c.run_id == run_id)
    ).first()
