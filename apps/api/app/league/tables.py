"""SQLAlchemy Core tables mirroring supabase/migrations/20260924160000_league_foundation.sql
and the later migrations that extend it.

Only the columns the API reads or writes are declared. Constraints and policies live in
the migrations, which are the single schema history.
"""

from sqlalchemy import BigInteger, Boolean, Column, DateTime, Integer, MetaData, Numeric, SmallInteger, String, Table, Text, text
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
    # Account-wide profile photo under avatars/<user id>/. The favourite team and the
    # notification read state moved to league_memberships (20260926160000_multi_league.sql);
    # the old users columns are left undeclared until a later migration drops them.
    Column("photo_path", String(300)),
    _ts("photo_updated_at"),
    # Set only by an operator with SQL (docs/production.md), never by the API.
    Column("is_admin", Boolean, nullable=False),
    Column("last_league_id", UUID(as_uuid=True)),
    _ts("updated_at", nullable=False),
)

leagues = Table(
    "leagues",
    metadata,
    Column("id", UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")),
    Column("name", String(120), nullable=False),
    Column("slug", String(40), nullable=False),
    Column("timezone", String(64), nullable=False),
    Column("captain_membership_id", UUID(as_uuid=True), nullable=False),
    # 'preset:<key>' or an object in the private bucket under emblems/<league id>/ (checked
    # by leagues_emblem_path_own); null shows the default crest or a monogram.
    Column("emblem_path", String(300)),
    Column("accent_colour", String(7)),
    # Null closes the league to joining by code.
    Column("join_code", String(16)),
    # Reviews vetoes when the captain is involved (20260928090000_evidence_cases.sql).
    # Never the captain.
    Column("stand_in_reviewer_membership_id", UUID(as_uuid=True)),
    # 'active' or 'archived'. An archived league keeps every row but is left out of the
    # account's list, and its league routes answer 404 `unknown_league`.
    Column("status", String(20), nullable=False),
    Column("version", Integer, nullable=False),
    _ts("created_at", nullable=False),
    _ts("updated_at", nullable=False),
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
    # The member's team in this league's competition, and what they have read in this
    # league's notifications panel (a high-water mark and exception keys).
    Column("favourite_team_id", String(40)),
    _ts("notifications_read_at"),
    Column("notifications_read_keys", JSONB, nullable=False),
    _ts("joined_at", nullable=False),
    # Set together when the captain or admin withdraws the member (status 'withdrawn');
    # cleared on reinstatement.
    _ts("left_at"),
    Column("withdrawal_reason", Text),
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
    # A key of app.competitions.ALL (20260926150000_competitions.sql).
    Column("competition_id", String(40), nullable=False),
    Column("status", String(20), nullable=False),
    _ts("closed_at"),
    # Superbru rules: only the keys that differ from service.DEFAULT_RULES; reads merge them
    # (20260927110000_picks_and_rules.sql). The previous season's champion wears the crown.
    Column("rules", JSONB, nullable=False),
    Column("previous_champion_membership_id", UUID(as_uuid=True)),
    Column("version", Integer, nullable=False),
    _ts("created_at", nullable=False),
    _ts("updated_at", nullable=False),
)

season_memberships = Table(
    "season_memberships",
    metadata,
    Column("id", UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")),
    Column("league_id", UUID(as_uuid=True), nullable=False),
    Column("season_id", UUID(as_uuid=True), nullable=False),
    Column("membership_id", UUID(as_uuid=True), nullable=False),
    # A withdrawal ends the row (status 'withdrawn', effective_to); reinstatement adds a new
    # one, so a member may hold several rows in a season but at most one active.
    Column("status", String(20), nullable=False),
    _ts("effective_from", nullable=False),
    _ts("effective_to"),
    _ts("updated_at", nullable=False),
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

# Evidence cases (20260928090000_evidence_cases.sql): one per evidence link, voted on by the
# members frozen into evidence_case_voters when it opens. Voter rows are ballots: the API
# never returns whose they are.
evidence_cases = Table(
    "evidence_cases",
    metadata,
    Column("id", UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")),
    Column("league_id", UUID(as_uuid=True), nullable=False),
    Column("season_id", UUID(as_uuid=True), nullable=False),
    Column("duty_id", UUID(as_uuid=True), nullable=False),
    Column("link_id", UUID(as_uuid=True), nullable=False),
    Column("subject_membership_id", UUID(as_uuid=True), nullable=False),
    _ts("opened_at", nullable=False),
    _ts("closes_at", nullable=False),
    Column("eligible_count", Integer, nullable=False),
    # open, in_review, accepted, rejected or superseded.
    Column("status", String(20), nullable=False),
    # majority, auto, no_voters, veto_upheld or captain; set when accepted or rejected.
    Column("resolution", String(20)),
    _ts("resolved_at"),
    Column("version", Integer, nullable=False),
    _ts("updated_at", nullable=False),
)

evidence_case_voters = Table(
    "evidence_case_voters",
    metadata,
    Column("id", UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")),
    Column("league_id", UUID(as_uuid=True), nullable=False),
    Column("case_id", UUID(as_uuid=True), nullable=False),
    Column("membership_id", UUID(as_uuid=True), nullable=False),
    # null, accept or veto.
    Column("choice", String(10)),
    Column("veto_reason", String(500)),
    _ts("responded_at"),
    # The account that responded: only it sees or changes the ballot, so a released name
    # passes none to its next claimant.
    Column("responded_by_user_id", UUID(as_uuid=True)),
    # A veto's review: pending, upheld or dismissed.
    Column("review_status", String(20)),
    Column("reviewed_by_membership_id", UUID(as_uuid=True)),
    Column("reviewed_by_label", String(80)),
    _ts("reviewed_at"),
    Column("review_reason", String(500)),
    Column("version", Integer, nullable=False),
    _ts("updated_at", nullable=False),
)

round_standings = Table(
    "round_standings",
    metadata,
    Column("id", UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")),
    Column("league_id", UUID(as_uuid=True), nullable=False),
    Column("season_id", UUID(as_uuid=True), nullable=False),
    Column("season_membership_id", UUID(as_uuid=True), nullable=False),
    Column("round_number", SmallInteger, nullable=False),
    Column("points", Numeric(6, 1), nullable=False),
    Column("recorded_by_membership_id", UUID(as_uuid=True), nullable=False),
    Column("version", Integer, nullable=False),
    _ts("updated_at", nullable=False),
)

# Superbru picks (20260927110000_picks_and_rules.sql): one per member and fixture, found by
# member because a reinstated member's earlier picks sit on the withdrawn season membership.
# Signed from the home side: 'home'/'away' with a margin of 1 to 150, 'draw' with 0, 'missed'
# with none. `is_default` marks a Superbru default pick (home or away only).
picks = Table(
    "picks",
    metadata,
    Column("id", UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")),
    Column("league_id", UUID(as_uuid=True), nullable=False),
    Column("season_id", UUID(as_uuid=True), nullable=False),
    Column("season_membership_id", UUID(as_uuid=True), nullable=False),
    Column("fixture_id", String(40), nullable=False),
    Column("side", String(10), nullable=False),
    Column("margin", SmallInteger),
    Column("is_default", Boolean, nullable=False),
    # The pick confirmation duty that covers this pick, if any.
    Column("duty_id", UUID(as_uuid=True)),
    Column("recorded_by_membership_id", UUID(as_uuid=True), nullable=False),
    Column("version", Integer, nullable=False),
    _ts("created_at", nullable=False),
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
