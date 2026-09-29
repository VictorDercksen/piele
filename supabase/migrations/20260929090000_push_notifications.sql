-- Push notifications (reverses plan decision P5's deferral). A member turns them on per
-- device: the browser's push subscription is stored against the account. League events
-- (a duty for you, a vote or veto ruling waiting for you, your evidence decided) queue a
-- message in the same transaction as their feed entry; a scheduled job (Vercel Cron on the
-- API, GET /v1/cron/push) adds competition events (teamsheets, Pavilion previews) and pick
-- reminders, then sends what is queued.

-- The job is not a signed-in account. It sets the transaction-local piele.job to 'push',
-- which lets it list the leagues (it then sets each league's context in turn, like a
-- request), read memberships to check a recipient still belongs to a league, and work the
-- push tables.
create function piele.current_job() returns text
  language sql stable
  as $$ select nullif(current_setting('piele.job', true), '') $$;

create policy leagues_push_job on piele.leagues for select to piele_api
  using (piele.current_job() = 'push');
create policy league_memberships_push_job on piele.league_memberships for select to piele_api
  using (piele.current_job() = 'push');

-- The kinds of message a member has turned off in this league: duties, cases, picks or
-- matches. Empty means every kind is on.
alter table piele.league_memberships
  add column push_muted jsonb not null default '[]'::jsonb,
  add constraint league_memberships_push_muted_array check (jsonb_typeof(push_muted) = 'array');

-- One row per account and browser. The endpoint and keys come from the browser's
-- PushSubscription; the keys encrypt every message to that browser only. A browser signed
-- into another account later keeps the newer row (the job drops the older one).
create table piele.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references piele.users (id) on delete cascade,
  endpoint varchar(1000) not null check (endpoint like 'https://%'),
  p256dh varchar(200) not null,
  auth varchar(100) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_success_at timestamptz,
  unique (user_id, endpoint)
);
create index ix_push_subscriptions_endpoint on piele.push_subscriptions (endpoint);

alter table piele.push_subscriptions enable row level security;
create policy push_subscriptions_own on piele.push_subscriptions for all to piele_api
  using (user_id = piele.current_user_id() or piele.current_job() = 'push')
  with check (user_id = piele.current_user_id() or piele.current_job() = 'push');

-- Messages waiting to be sent, one per recipient account. dedup_key makes queuing
-- idempotent. A message is not sent after expires_at (a pick reminder after kickoff).
-- Requests queue league messages inside their league context; only the job reads, sends
-- and clears them.
create table piele.push_outbox (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references piele.users (id) on delete cascade,
  league_id uuid references piele.leagues (id),
  kind varchar(40) not null,
  dedup_key varchar(200) not null unique,
  title varchar(120) not null,
  body varchar(400) not null,
  url varchar(300) not null check (url like '/%'),
  tag varchar(120) not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  status varchar(20) not null default 'pending' check (status in ('pending', 'sent', 'dropped', 'failed')),
  attempts smallint not null default 0,
  lease_until timestamptz,
  sent_at timestamptz,
  last_error varchar(300)
);
create index ix_push_outbox_pending on piele.push_outbox (created_at) where status = 'pending';

alter table piele.push_outbox enable row level security;
create policy push_outbox_queue on piele.push_outbox for insert to piele_api
  with check (league_id = piele.current_league_id() or piele.current_job() = 'push');
-- Queuing skips a message already queued (on conflict do nothing), which needs the row to be
-- readable: a league context reads its own league's messages.
create policy push_outbox_league on piele.push_outbox for select to piele_api
  using (league_id = piele.current_league_id());
create policy push_outbox_job on piele.push_outbox for all to piele_api
  using (piele.current_job() = 'push') with check (piele.current_job() = 'push');

-- Competition events already announced, so each is sent once: teamsheets published (a
-- fixture_milestones row) and a fixture's first Pavilion preview.
create table piele.push_announcements (
  competition_id varchar(40) not null,
  fixture_id varchar(40) not null,
  kind varchar(40) not null check (kind in ('teamsheets_published', 'preview_published')),
  announced_at timestamptz not null default now(),
  primary key (competition_id, fixture_id, kind)
);

alter table piele.push_announcements enable row level security;
create policy push_announcements_job on piele.push_announcements for all to piele_api
  using (piele.current_job() = 'push') with check (piele.current_job() = 'push');

-- Pick reminders already sent: one per member, fixture and lead time (24 hours and 1 hour
-- before kickoff).
create table piele.push_reminders (
  league_id uuid not null,
  membership_id uuid not null,
  fixture_id varchar(40) not null,
  lead varchar(10) not null check (lead in ('24h', '1h')),
  created_at timestamptz not null default now(),
  primary key (membership_id, fixture_id, lead),
  foreign key (membership_id, league_id) references piele.league_memberships (id, league_id) on delete cascade
);

alter table piele.push_reminders enable row level security;
create policy push_reminders_job on piele.push_reminders for all to piele_api
  using (league_id = piele.current_league_id() and piele.current_job() = 'push')
  with check (league_id = piele.current_league_id() and piele.current_job() = 'push');
