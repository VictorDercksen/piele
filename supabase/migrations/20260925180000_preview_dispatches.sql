-- Claims on a fixture's first preview, taken by the preview agent's schedule through
-- POST /v1/agent/dispatches before it starts a writing session. A fixture is claimed once
-- both teamsheets are published and it has no preview; while a claim's lease runs no other
-- session starts for it, and a session that saved nothing is retried a limited number of
-- times after the lease lapses. The rules live in apps/api/app/agent/previews.py.
create table piele.preview_dispatches (
  fixture_id varchar(40) not null,
  attempt integer not null check (attempt > 0),
  dispatched_at timestamptz not null default now(),
  -- sha256 hex of the teamsheets published when the fixture was claimed.
  teamsheet_hash char(64) not null,
  primary key (fixture_id, attempt)
);

alter table piele.preview_dispatches enable row level security;
create policy preview_dispatches_read on piele.preview_dispatches for select to piele_api using (true);
create policy preview_dispatches_insert on piele.preview_dispatches for insert to piele_api with check (true);
revoke update, delete on piele.preview_dispatches from piele_api;
