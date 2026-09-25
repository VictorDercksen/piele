-- Match previews written by the preview agent (apps/agent) through POST /v1/agent/previews.
-- Global competition data, not league records: every league reads the same preview. The
-- agent holds no database credentials; the API validates each preview and inserts it.
-- Rows are append-only revisions per fixture; members read the latest one.
create table piele.match_previews (
  id uuid primary key default gen_random_uuid(),
  fixture_id varchar(40) not null,
  revision integer not null check (revision > 0),
  generated_at timestamptz not null default now(),
  -- sha256 hex of the fixture state and of the teamsheets the preview was written from.
  inputs_hash char(64) not null,
  teamsheet_hash char(64) not null,
  summary text not null check (char_length(summary) between 1 and 1500),
  key_factors jsonb not null,
  sentiment jsonb not null,
  sources jsonb not null,
  models jsonb not null,
  usage jsonb,
  run_id varchar(200),
  unique (fixture_id, revision)
);

-- A retried agent run returns its stored preview instead of adding a revision.
create unique index ux_match_previews_run on piele.match_previews (fixture_id, run_id) where run_id is not null;

alter table piele.match_previews enable row level security;
create policy match_previews_read on piele.match_previews for select to piele_api using (true);
create policy match_previews_insert on piele.match_previews for insert to piele_api with check (true);
revoke update, delete on piele.match_previews from piele_api;
