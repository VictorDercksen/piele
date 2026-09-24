-- Private application schema. Not added to the Data API's exposed schemas, so PostgREST
-- and the publishable key cannot read it. The Python API reads it through the pooler.
create schema if not exists piele;

-- Cache of match centre provider responses (teamsheets, odds, weather). Not authoritative
-- league state: rows expire and can be deleted at any time.
create table piele.external_snapshots (
  key varchar(200) primary key,
  status varchar(40) not null,
  payload jsonb not null,
  fetched_at timestamptz not null,
  expires_at timestamptz not null
);

create index ix_external_snapshots_expires_at on piele.external_snapshots (expires_at);

-- Defence in depth: no policies, so only the table owner and roles with bypassrls read it.
alter table piele.external_snapshots enable row level security;
