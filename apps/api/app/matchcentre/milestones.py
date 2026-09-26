"""First observations of fixture milestones, mirroring
supabase/migrations/20260926130000_notifications.sql.

Provider snapshots expire and are fetched again, so their times move. The notifications
panel counts unread against a high-water mark, which needs a time that stays put once a
milestone has been seen. Rows are competition data shared by every league, keyed by the
competition id (20260926150000_competitions.sql), written once and never updated.
"""

from dataclasses import dataclass
from datetime import datetime
from typing import Any, Sequence

from sqlalchemy import Column, DateTime, MetaData, String, Table, func, select
from sqlalchemy.dialects.postgresql import JSONB, insert
from sqlalchemy.engine import Connection

metadata = MetaData()

fixture_milestones = Table(
    "fixture_milestones",
    metadata,
    Column("competition_id", String(40), primary_key=True),
    Column("fixture_id", String(40), primary_key=True),
    Column("kind", String(40), primary_key=True),
    Column("observed_at", DateTime(timezone=True), nullable=False, server_default=func.now()),
    Column("detail", JSONB, nullable=False, server_default="{}"),
    schema="piele",
)

TEAMSHEETS_PUBLISHED = "teamsheets_published"
FULL_TIME = "full_time"


@dataclass(frozen=True)
class Milestone:
    fixture_id: str
    kind: str
    observed_at: datetime
    detail: dict[str, Any]


MilestoneKey = tuple[str, str]


def by_fixture(
    connection: Connection, competition_id: str, fixture_ids: Sequence[str]
) -> dict[MilestoneKey, Milestone]:
    """The competition's known milestones of these fixtures, keyed by (fixture id, kind)."""
    if not fixture_ids:
        return {}
    rows = connection.execute(
        select(fixture_milestones).where(
            fixture_milestones.c.competition_id == competition_id,
            fixture_milestones.c.fixture_id.in_(list(fixture_ids)),
        )
    ).all()
    return {(row.fixture_id, row.kind): Milestone(row.fixture_id, row.kind, row.observed_at, dict(row.detail or {})) for row in rows}


def record(
    connection: Connection,
    competition_id: str,
    fixture_id: str,
    kind: str,
    observed_at: datetime,
    detail: dict[str, Any],
) -> Milestone:
    """Insert the milestone unless it is already known; either way return the stored row."""
    table = fixture_milestones
    connection.execute(
        insert(table)
        .values(competition_id=competition_id, fixture_id=fixture_id, kind=kind, observed_at=observed_at, detail=detail)
        .on_conflict_do_nothing(index_elements=[table.c.competition_id, table.c.fixture_id, table.c.kind])
    )
    row = connection.execute(
        select(table).where(
            table.c.competition_id == competition_id, table.c.fixture_id == fixture_id, table.c.kind == kind
        )
    ).one()
    return Milestone(row.fixture_id, row.kind, row.observed_at, dict(row.detail or {}))
