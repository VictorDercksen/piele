"""Create external_snapshots, the cache for match centre provider responses.

Revision ID: 0001_external_snapshots
Revises:
Create Date: 2026-09-23
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0001_external_snapshots"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "external_snapshots",
        sa.Column("key", sa.String(length=200), primary_key=True),
        sa.Column("status", sa.String(length=40), nullable=False),
        sa.Column("payload", postgresql.JSONB(), nullable=False),
        sa.Column("fetched_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_external_snapshots_expires_at", "external_snapshots", ["expires_at"])


def downgrade() -> None:
    op.drop_index("ix_external_snapshots_expires_at", table_name="external_snapshots")
    op.drop_table("external_snapshots")
