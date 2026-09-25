"""Stored match previews and the rule for when a fixture needs one.

Mirrors supabase/migrations/20260925120000_match_previews.sql and
20260925180000_preview_dispatches.sql. Previews are global competition data: append-only
revisions per fixture, written only through the API. A fixture gets one preview, written
once both teamsheets are published; the agent's schedule claims it first (a dispatch), so
overlapping ticks never start two sessions for the same fixture.
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

preview_dispatches = Table(
    "preview_dispatches",
    metadata,
    Column("fixture_id", String(40), primary_key=True),
    Column("attempt", Integer, primary_key=True),
    Column("dispatched_at", DateTime(timezone=True), nullable=False, server_default=func.now()),
    Column("teamsheet_hash", CHAR(64), nullable=False),
    schema="piele",
)

# A claimed fixture is not claimed again while its session may still be writing.
DISPATCH_LEASE = timedelta(minutes=45)
# Sessions that saved nothing are retried after the lease, up to this many claims in all.
MAX_DISPATCHES = 3
# Claims per schedule tick; the rest wait for the next tick.
DISPATCH_LIMIT = 8
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


def due_reason(
    kickoff: datetime,
    now: datetime,
    current_hash: str | None,
    preview: Row | None,
    dispatch: Row | None,
    force: bool = False,
) -> str | None:
    """Why the fixture needs its preview now, or None.

    Only a fixture with both teamsheets published and no preview yet, before kickoff, and
    not claimed within the lease. A claim whose session saved nothing is retried a limited
    number of times. A forced run (asked for by hand) skips the preview, lease and attempt
    checks but still needs published teamsheets and a kickoff ahead.
    """
    if current_hash is None or now >= kickoff:
        return None
    if force:
        return "forced"
    if preview is not None:
        return None
    if dispatch is None:
        return "first_preview"
    if dispatch.attempt >= MAX_DISPATCHES or now - dispatch.dispatched_at < DISPATCH_LEASE:
        return None
    return "retry"


def teamsheet_hashes(
    schedule: Schedule, centre: MatchCentreService, now: datetime, fixture_id: str | None = None
) -> dict[Fixture, str | None]:
    """Current teamsheet hashes of the fixtures open for a preview (or of one of them).
    Calls providers; no database."""
    candidates = [
        f for f in schedule.fixtures if open_for_preview(f, now) and fixture_id in (None, f.id)
    ]
    with ThreadPoolExecutor(max_workers=4) as pool:
        sections = list(pool.map(lambda f: centre.teamsheets(f, now), candidates))
    return {fixture: teamsheet_hash(section) for fixture, section in zip(candidates, sections)}


def due_fixtures(
    connection: Connection, hashes: dict[Fixture, str | None], now: datetime, force: bool = False
) -> list[dict[str, Any]]:
    ids = [f.id for f in hashes]
    previews, dispatches = latest_by_fixture(connection, ids), latest_dispatches(connection, ids)
    due = []
    for fixture, current in sorted(hashes.items(), key=lambda item: (item[0].kickoff_utc, item[0].id)):
        assert fixture.kickoff_utc is not None
        dispatch = dispatches.get(fixture.id)
        reason = due_reason(fixture.kickoff_utc, now, current, previews.get(fixture.id), dispatch, force)
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
                    "attempt": dispatch.attempt + 1 if dispatch else 1,
                }
            )
    return due


def claim(connection: Connection, due: dict[str, Any], now: datetime) -> dict[str, Any] | None:
    """Record the dispatch of a due fixture, or None when a concurrent claim took it first."""
    try:
        with connection.begin_nested():
            row = connection.execute(
                insert(preview_dispatches)
                .values(
                    fixture_id=due["fixtureId"],
                    attempt=due["attempt"],
                    dispatched_at=now,
                    teamsheet_hash=due["teamsheetHash"],
                )
                .returning(preview_dispatches.c.dispatched_at)
            ).one()
    except IntegrityError:
        return None
    return {**due, "dispatchedAt": row.dispatched_at}


def latest_dispatches(connection: Connection, fixture_ids: list[str]) -> dict[str, Row]:
    if not fixture_ids:
        return {}
    rows = connection.execute(
        select(preview_dispatches)
        .where(preview_dispatches.c.fixture_id.in_(fixture_ids))
        .distinct(preview_dispatches.c.fixture_id)
        .order_by(preview_dispatches.c.fixture_id, preview_dispatches.c.attempt.desc())
    ).all()
    return {row.fixture_id: row for row in rows}


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
