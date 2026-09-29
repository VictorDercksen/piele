"""SQLAlchemy Core tables mirroring supabase/migrations/20260929090000_push_notifications.sql."""

from sqlalchemy import Column, DateTime, MetaData, SmallInteger, String, Table, text
from sqlalchemy.dialects.postgresql import UUID

metadata = MetaData(schema="piele")


def _ts(name: str, nullable: bool = True) -> Column:
    return Column(name, DateTime(timezone=True), nullable=nullable)


push_subscriptions = Table(
    "push_subscriptions",
    metadata,
    Column("id", UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")),
    Column("user_id", UUID(as_uuid=True), nullable=False),
    Column("endpoint", String(1000), nullable=False),
    Column("p256dh", String(200), nullable=False),
    Column("auth", String(100), nullable=False),
    _ts("created_at", nullable=False),
    _ts("updated_at", nullable=False),
    _ts("last_success_at"),
)

push_outbox = Table(
    "push_outbox",
    metadata,
    Column("id", UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")),
    Column("user_id", UUID(as_uuid=True), nullable=False),
    Column("league_id", UUID(as_uuid=True)),
    Column("kind", String(40), nullable=False),
    Column("dedup_key", String(200), nullable=False),
    Column("title", String(120), nullable=False),
    Column("body", String(400), nullable=False),
    Column("url", String(300), nullable=False),
    Column("tag", String(120), nullable=False),
    _ts("created_at", nullable=False),
    _ts("expires_at", nullable=False),
    # pending, sent, dropped (nothing to send to, expired, or no longer a member) or failed.
    Column("status", String(20), nullable=False),
    Column("attempts", SmallInteger, nullable=False),
    _ts("lease_until"),
    _ts("sent_at"),
    Column("last_error", String(300)),
)

push_announcements = Table(
    "push_announcements",
    metadata,
    Column("competition_id", String(40), primary_key=True),
    Column("fixture_id", String(40), primary_key=True),
    Column("kind", String(40), primary_key=True),
    _ts("announced_at", nullable=False),
)

push_reminders = Table(
    "push_reminders",
    metadata,
    Column("league_id", UUID(as_uuid=True), nullable=False),
    Column("membership_id", UUID(as_uuid=True), primary_key=True),
    Column("fixture_id", String(40), primary_key=True),
    Column("lead", String(10), primary_key=True),
    _ts("created_at", nullable=False),
)
