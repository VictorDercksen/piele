-- Superbru round standings (plan M14, simplified). The captain records each member's round
-- points from the Superbru pool; ranks are derived by the API, never stored. Superbru points
-- and house marks are separate measures with no exchange rate. A later correction replaces the
-- row and bumps its version; the audit trail keeps the previous points.
create table piele.round_standings (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references piele.leagues (id),
  season_id uuid not null,
  season_membership_id uuid not null,
  round_number smallint not null check (round_number between 1 and 21),
  points numeric(6, 1) not null check (points >= 0),
  recorded_by_membership_id uuid not null,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (season_id, league_id) references piele.seasons (id, league_id),
  foreign key (season_membership_id, league_id) references piele.season_memberships (id, league_id),
  foreign key (recorded_by_membership_id, league_id) references piele.league_memberships (id, league_id),
  unique (season_membership_id, round_number)
);

create index ix_round_standings_season_round on piele.round_standings (season_id, round_number);

alter table piele.round_standings enable row level security;
create policy round_standings_current on piele.round_standings for all to piele_api
  using (league_id = piele.current_league_id()) with check (league_id = piele.current_league_id());
