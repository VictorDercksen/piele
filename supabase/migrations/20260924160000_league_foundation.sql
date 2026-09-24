-- League foundation (plan sections 4 and 5): identity, membership, seasons, duties,
-- evidence, the feed and the audit trail. Every league table carries league_id and is
-- protected by row level security keyed on transaction-local actor context that the API
-- sets after verifying the caller's token (see app/league/context.py).

-- Transaction-local context. set_config(..., true) resets at commit, so pooled connections
-- never carry another caller's identity into the next transaction.
create function piele.current_league_id() returns uuid
  language sql stable
  as $$ select nullif(current_setting('piele.league_id', true), '')::uuid $$;

create function piele.current_auth_subject() returns uuid
  language sql stable
  as $$ select nullif(current_setting('piele.auth_subject', true), '')::uuid $$;

create function piele.current_auth_email() returns text
  language sql stable
  as $$ select lower(nullif(current_setting('piele.auth_email', true), '')) $$;

-- M1. One row per Supabase Auth account. No passwords, no roles.
create table piele.users (
  id uuid primary key default gen_random_uuid(),
  auth_subject uuid not null unique,
  email varchar(320),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- M2. captain_membership_id is required; the foreign key is added below, deferred so the
-- bootstrap can create the league and its captain membership in one transaction.
create table piele.leagues (
  id uuid primary key default gen_random_uuid(),
  name varchar(120) not null,
  timezone varchar(64) not null default 'Africa/Johannesburg',
  captain_membership_id uuid not null,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- M3. display_name is the member's Superbru nickname. A signed-in account claims an
-- unclaimed membership by choosing its name; invited_email, when set, reserves the
-- membership for a verified sign-in with that address instead. There is no role column.
create table piele.league_memberships (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references piele.leagues (id),
  user_id uuid references piele.users (id),
  display_name varchar(50) not null,
  full_name varchar(120) not null,
  invited_email varchar(320),
  status varchar(20) not null default 'active' check (status in ('active', 'withdrawn')),
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (league_id, user_id),
  unique (id, league_id),
  check ((status = 'withdrawn') = (left_at is not null))
);

create unique index ux_league_memberships_invited_email
  on piele.league_memberships (league_id, lower(invited_email))
  where invited_email is not null;

alter table piele.leagues
  add constraint fk_leagues_captain_membership
  foreign key (captain_membership_id, id) references piele.league_memberships (id, league_id)
  deferrable initially deferred;

-- M5. One active season per league.
create table piele.seasons (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references piele.leagues (id),
  name varchar(80) not null,
  competition varchar(80) not null,
  status varchar(20) not null default 'active' check (status in ('draft', 'active', 'closed')),
  starts_on date,
  ends_on date,
  closed_at timestamptz,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, league_id),
  check ((status = 'closed') = (closed_at is not null))
);

create unique index ux_seasons_one_active_per_league on piele.seasons (league_id) where status = 'active';

-- M6. Composite foreign keys keep a season and its members inside one league (I1).
create table piele.season_memberships (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references piele.leagues (id),
  season_id uuid not null,
  membership_id uuid not null,
  status varchar(20) not null default 'active' check (status in ('active', 'withdrawn')),
  effective_from timestamptz not null default now(),
  effective_to timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (season_id, league_id) references piele.seasons (id, league_id),
  foreign key (membership_id, league_id) references piele.league_memberships (id, league_id),
  unique (season_id, membership_id),
  unique (id, league_id)
);

-- M17. round_number is the round's position in the bundled URC schedule (1-18 regular,
-- 19-21 playoffs). deadline_at null means unknown, which earns no marks. completed_at is the
-- accepted effective completion time. clock_reset_at restarts the overdue clock after a
-- challenge is resolved in the member's favour (league decision: challenges never pause
-- accrual). overdue and under_review are derived, never stored.
create table piele.duties (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references piele.leagues (id),
  season_id uuid not null,
  season_membership_id uuid not null,
  round_number smallint check (round_number between 1 and 21),
  type varchar(30) not null check (type in ('spoon', 'pick_confirmation')),
  reason text not null default '',
  deadline_at timestamptz,
  clock_reset_at timestamptz,
  status varchar(20) not null check (status in ('pending_deadline', 'open', 'completed', 'voided')),
  completed_at timestamptz,
  voided_at timestamptz,
  void_reason text,
  created_by_membership_id uuid not null,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (season_id, league_id) references piele.seasons (id, league_id),
  foreign key (season_membership_id, league_id) references piele.season_memberships (id, league_id),
  foreign key (created_by_membership_id, league_id) references piele.league_memberships (id, league_id),
  unique (id, league_id),
  check ((status = 'completed') = (completed_at is not null)),
  check ((status = 'voided') = (voided_at is not null)),
  check (status <> 'open' or deadline_at is not null),
  check (status <> 'pending_deadline' or deadline_at is null)
);

-- I3: one live duty of each type per member and round.
create unique index ux_duties_one_live_per_member_round_type
  on piele.duties (season_membership_id, round_number, type)
  where status in ('pending_deadline', 'open');
create index ix_duties_unresolved on piele.duties (league_id, deadline_at)
  where status in ('pending_deadline', 'open');
create index ix_duties_season_round on piele.duties (season_id, round_number);

-- M26. Private evidence videos in Supabase Storage. Bytes never pass through the API.
create table piele.media_assets (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references piele.leagues (id),
  season_id uuid not null,
  uploader_membership_id uuid not null,
  object_path varchar(300) not null unique,
  filename varchar(255) not null,
  declared_type varchar(100) not null,
  detected_type varchar(100),
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  status varchar(20) not null default 'reserved' check (status in ('reserved', 'ready', 'purged')),
  upload_expires_at timestamptz not null,
  purge_after timestamptz,
  purged_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (season_id, league_id) references piele.seasons (id, league_id),
  foreign key (uploader_membership_id, league_id) references piele.league_memberships (id, league_id),
  unique (id, league_id)
);

create index ix_media_assets_purge on piele.media_assets (purge_after) where purged_at is null;

-- M18. subject_membership_id is the member whose duties the video is for; it differs from
-- the submitter only when the captain records evidence on a member's behalf, in which case
-- claimed_completed_at is the captain-entered completion time.
create table piele.evidence_submissions (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references piele.leagues (id),
  season_id uuid not null,
  submitter_membership_id uuid not null,
  subject_membership_id uuid not null,
  asset_id uuid not null,
  claimed_completed_at timestamptz,
  submitted_at timestamptz not null default now(),
  note varchar(500) not null default '',
  created_at timestamptz not null default now(),
  foreign key (season_id, league_id) references piele.seasons (id, league_id),
  foreign key (submitter_membership_id, league_id) references piele.league_memberships (id, league_id),
  foreign key (subject_membership_id, league_id) references piele.league_memberships (id, league_id),
  foreign key (asset_id, league_id) references piele.media_assets (id, league_id),
  unique (id, league_id),
  check (submitter_membership_id = subject_membership_id or claimed_completed_at is not null)
);

create index ix_evidence_submissions_subject on piele.evidence_submissions (subject_membership_id, submitted_at desc);

-- M19. Acceptance lives here because one video may satisfy one duty and fail another.
create table piele.duty_evidence_links (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references piele.leagues (id),
  duty_id uuid not null,
  submission_id uuid not null,
  decision varchar(20) not null default 'pending'
    check (decision in ('pending', 'accepted', 'rejected', 'superseded')),
  decided_by_membership_id uuid,
  decided_at timestamptz,
  reason text,
  effective_completed_at timestamptz,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (duty_id, league_id) references piele.duties (id, league_id),
  foreign key (submission_id, league_id) references piele.evidence_submissions (id, league_id),
  foreign key (decided_by_membership_id, league_id) references piele.league_memberships (id, league_id),
  unique (duty_id, submission_id),
  check ((decision in ('accepted', 'rejected')) = (decided_at is not null)),
  check (decision <> 'accepted' or effective_completed_at is not null)
);

create index ix_duty_evidence_links_pending on piele.duty_evidence_links (league_id) where decision = 'pending';

-- Feed entries are written in the same transaction as the change they describe. Anything
-- here is visible to every active member of the league.
create table piele.feed_entries (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references piele.leagues (id),
  season_id uuid,
  round_number smallint check (round_number between 1 and 21),
  kind varchar(40) not null,
  actor_membership_id uuid,
  subject_membership_id uuid,
  duty_id uuid,
  submission_id uuid,
  title varchar(200) not null,
  detail varchar(500) not null default '',
  occurred_at timestamptz not null default now(),
  foreign key (season_id, league_id) references piele.seasons (id, league_id),
  foreign key (actor_membership_id, league_id) references piele.league_memberships (id, league_id),
  foreign key (subject_membership_id, league_id) references piele.league_memberships (id, league_id),
  foreign key (duty_id, league_id) references piele.duties (id, league_id),
  foreign key (submission_id, league_id) references piele.evidence_submissions (id, league_id)
);

create index ix_feed_entries_league_time on piele.feed_entries (league_id, occurred_at desc);
create index ix_feed_entries_round_time on piele.feed_entries (league_id, round_number, occurred_at desc);

-- M25. Append-only for the runtime role. Details are redacted by the API before insert.
create table piele.audit_events (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references piele.leagues (id),
  actor_membership_id uuid,
  actor_label varchar(80) not null,
  action varchar(60) not null,
  entity_type varchar(40) not null,
  entity_id uuid,
  reason text,
  before jsonb,
  after jsonb,
  request_id varchar(128),
  occurred_at timestamptz not null default now(),
  foreign key (actor_membership_id, league_id) references piele.league_memberships (id, league_id)
);

create index ix_audit_events_league_time on piele.audit_events (league_id, occurred_at desc);
revoke update, delete on piele.audit_events from piele_api;

-- Row level security. The runtime role sees only its own auth account and the league it
-- has set in context. Memberships are additionally readable through the caller's own
-- account, a reservation for the caller's verified email, or while unclaimed for any
-- verified account, so the API can resolve or claim the league before setting it.
alter table piele.users enable row level security;
create policy users_self on piele.users for all to piele_api
  using (auth_subject = piele.current_auth_subject())
  with check (auth_subject = piele.current_auth_subject());

alter table piele.leagues enable row level security;
create policy leagues_current on piele.leagues for all to piele_api
  using (id = piele.current_league_id())
  with check (id = piele.current_league_id());

alter table piele.league_memberships enable row level security;
create policy league_memberships_current on piele.league_memberships for all to piele_api
  using (
    league_id = piele.current_league_id()
    or user_id in (select id from piele.users where auth_subject = piele.current_auth_subject())
    or (user_id is null and piele.current_auth_subject() is not null)
  )
  with check (
    league_id = piele.current_league_id()
    or user_id in (select id from piele.users where auth_subject = piele.current_auth_subject())
  );

alter table piele.seasons enable row level security;
create policy seasons_current on piele.seasons for all to piele_api
  using (league_id = piele.current_league_id()) with check (league_id = piele.current_league_id());

alter table piele.season_memberships enable row level security;
create policy season_memberships_current on piele.season_memberships for all to piele_api
  using (league_id = piele.current_league_id()) with check (league_id = piele.current_league_id());

alter table piele.duties enable row level security;
create policy duties_current on piele.duties for all to piele_api
  using (league_id = piele.current_league_id()) with check (league_id = piele.current_league_id());

alter table piele.media_assets enable row level security;
create policy media_assets_current on piele.media_assets for all to piele_api
  using (league_id = piele.current_league_id()) with check (league_id = piele.current_league_id());

alter table piele.evidence_submissions enable row level security;
create policy evidence_submissions_current on piele.evidence_submissions for all to piele_api
  using (league_id = piele.current_league_id()) with check (league_id = piele.current_league_id());

alter table piele.duty_evidence_links enable row level security;
create policy duty_evidence_links_current on piele.duty_evidence_links for all to piele_api
  using (league_id = piele.current_league_id()) with check (league_id = piele.current_league_id());

alter table piele.feed_entries enable row level security;
create policy feed_entries_current on piele.feed_entries for all to piele_api
  using (league_id = piele.current_league_id()) with check (league_id = piele.current_league_id());

alter table piele.audit_events enable row level security;
create policy audit_events_current on piele.audit_events for all to piele_api
  using (league_id = piele.current_league_id()) with check (league_id = piele.current_league_id());
