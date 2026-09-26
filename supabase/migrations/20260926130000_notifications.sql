-- Notifications panel: what each member has read, and the competition milestones the
-- panel reports (teamsheets published, full time). Read state is a high-water mark plus
-- the keys of items read individually, so "mark all read" is one write and unread is a
-- timestamp comparison. It is account-wide like the favourite team, so it follows the
-- member to every device. Keys are opaque strings the web app builds; the API bounds them.
alter table piele.users
  add column notifications_read_at timestamptz,
  add column notifications_read_keys jsonb not null default '[]'::jsonb,
  add constraint users_notifications_read_keys_array check (jsonb_typeof(notifications_read_keys) = 'array');

-- First observation of a fixture milestone by the API. Global competition data, not league
-- records: every league sees the same rows. The provider snapshots in external_snapshots
-- expire and move, so the panel needs a time that stays put once a milestone is seen.
-- detail holds the full-time score.
create table piele.fixture_milestones (
  fixture_id varchar(40) not null,
  kind varchar(40) not null check (kind in ('teamsheets_published', 'full_time')),
  observed_at timestamptz not null default now(),
  detail jsonb not null default '{}'::jsonb,
  primary key (fixture_id, kind)
);

alter table piele.fixture_milestones enable row level security;
create policy fixture_milestones_read on piele.fixture_milestones for select to piele_api using (true);
create policy fixture_milestones_insert on piele.fixture_milestones for insert to piele_api with check (true);
revoke update, delete on piele.fixture_milestones from piele_api;
