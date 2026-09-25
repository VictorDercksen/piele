"""SQLAlchemy Core tables mirroring supabase/migrations/20260924160000_league_foundation.sql
and the later migrations that extend it.

Only the columns the API reads or writes are declared. Constraints and policies live in
the migrations, which are the single schema history.
"""

from sqlalchemy import BigInteger, Column, DateTime, Integer, MetaData, SmallInteger, String, Table, Text, text
from sqlalchemy.dialects.postgresql import JSONB, UUID

metadata = MetaData(schema="piele")


def _ts(name: str, nullable: bool = True) -> Column:
    return Column(name, DateTime(timezone=True), nullable=nullable)


users = Table(
    "users",
    metadata,
    Column("id", UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")),
    Column("auth_subject", UUID(as_uuid=True), nullable=False),
    Column("email", String(320)),
    Column("favourite_team_id", String(40)),
    Column("photo_path", String(300)),
    _ts("photo_updated_at"),
    _ts("updated_at", nullable=False),
)

leagues = Table(
    "leagues",
    metadata,
    Column("id", UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")),
    Column("name", String(120), nullable=False),
    Column("timezone", String(64), nullable=False),
    Column("captain_membership_id", UUID(as_uuid=True), nullable=False),
    Column("version", Integer, nullable=False),
)

league_memberships = Table(
    "league_memberships",
    metadata,
    Column("id", UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")),
    Column("league_id", UUID(as_uuid=True), nullable=False),
    Column("user_id", UUID(as_uuid=True)),
    Column("display_name", String(50), nullable=False),
    Column("full_name", String(120), nullable=False),
    Column("invited_email", String(320)),
    Column("status", String(20), nullable=False),
    _ts("joined_at", nullable=False),
    _ts("left_at"),
    Column("version", Integer, nullable=False),
    _ts("updated_at", nullable=False),
)

seasons = Table(
    "seasons",
    metadata,
    Column("id", UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")),
    Column("league_id", UUID(as_uuid=True), nullable=False),
    Column("name", String(80), nullable=False),
    Column("competition", String(80), nullable=False),
    Column("status", String(20), nullable=False),
    _ts("closed_at"),
)

season_memberships = Table(
    "season_memberships",
    metadata,
    Column("id", UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")),
    Column("league_id", UUID(as_uuid=True), nullable=False),
    Column("season_id", UUID(as_uuid=True), nullable=False),
    Column("membership_id", UUID(as_uuid=True), nullable=False),
    Column("status", String(20), nullable=False),
)

duties = Table(
    "duties",
    metadata,
    Column("id", UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")),
    Column("league_id", UUID(as_uuid=True), nullable=False),
    Column("season_id", UUID(as_uuid=True), nullable=False),
    Column("season_membership_id", UUID(as_uuid=True), nullable=False),
    Column("round_number", SmallInteger),
    Column("type", String(30), nullable=False),
    Column("reason", Text, nullable=False),
    _ts("deadline_at"),
    _ts("clock_reset_at"),
    Column("status", String(20), nullable=False),
    _ts("completed_at"),
    _ts("voided_at"),
    Column("void_reason", Text),
    Column("created_by_membership_id", UUID(as_uuid=True), nullable=False),
    Column("version", Integer, nullable=False),
    _ts("created_at", nullable=False),
    _ts("updated_at", nullable=False),
)

media_assets = Table(
    "media_assets",
    metadata,
    Column("id", UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")),
    Column("league_id", UUID(as_uuid=True), nullable=False),
    Column("season_id", UUID(as_uuid=True), nullable=False),
    Column("uploader_membership_id", UUID(as_uuid=True), nullable=False),
    Column("object_path", String(300), nullable=False),
    Column("filename", String(255), nullable=False),
    Column("declared_type", String(100), nullable=False),
    Column("detected_type", String(100)),
    Column("size_bytes", BigInteger),
    Column("status", String(20), nullable=False),
    _ts("upload_expires_at", nullable=False),
    _ts("purge_after"),
    _ts("purged_at"),
    _ts("updated_at", nullable=False),
)

evidence_submissions = Table(
    "evidence_submissions",
    metadata,
    Column("id", UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")),
    Column("league_id", UUID(as_uuid=True), nullable=False),
    Column("season_id", UUID(as_uuid=True), nullable=False),
    Column("submitter_membership_id", UUID(as_uuid=True), nullable=False),
    Column("subject_membership_id", UUID(as_uuid=True), nullable=False),
    Column("asset_id", UUID(as_uuid=True), nullable=False),
    _ts("claimed_completed_at"),
    _ts("submitted_at", nullable=False),
    Column("note", String(500), nullable=False),
)

duty_evidence_links = Table(
    "duty_evidence_links",
    metadata,
    Column("id", UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")),
    Column("league_id", UUID(as_uuid=True), nullable=False),
    Column("duty_id", UUID(as_uuid=True), nullable=False),
    Column("submission_id", UUID(as_uuid=True), nullable=False),
    Column("decision", String(20), nullable=False),
    Column("decided_by_membership_id", UUID(as_uuid=True)),
    _ts("decided_at"),
    Column("reason", Text),
    _ts("effective_completed_at"),
    Column("version", Integer, nullable=False),
    _ts("updated_at", nullable=False),
)

feed_entries = Table(
    "feed_entries",
    metadata,
    Column("id", UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")),
    Column("league_id", UUID(as_uuid=True), nullable=False),
    Column("season_id", UUID(as_uuid=True)),
    Column("round_number", SmallInteger),
    Column("kind", String(40), nullable=False),
    Column("actor_membership_id", UUID(as_uuid=True)),
    Column("subject_membership_id", UUID(as_uuid=True)),
    Column("duty_id", UUID(as_uuid=True)),
    Column("submission_id", UUID(as_uuid=True)),
    Column("title", String(200), nullable=False),
    Column("detail", String(500), nullable=False),
    _ts("occurred_at", nullable=False),
)

audit_events = Table(
    "audit_events",
    metadata,
    Column("id", UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")),
    Column("league_id", UUID(as_uuid=True), nullable=False),
    Column("actor_membership_id", UUID(as_uuid=True)),
    Column("actor_label", String(80), nullable=False),
    Column("action", String(60), nullable=False),
    Column("entity_type", String(40), nullable=False),
    Column("entity_id", UUID(as_uuid=True)),
    Column("reason", Text),
    Column("before", JSONB),
    Column("after", JSONB),
    Column("request_id", String(128)),
)
