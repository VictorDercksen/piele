-- Superbru picks and rules. Every member records their own pick per fixture before kickoff
-- (side and margin from the home side); the captain or admin records or corrects any pick at
-- any time and marks Superbru default picks. Scoring is derived from picks and results by the
-- web app; round_standings rows become overrides of the derived round totals.
--
-- A pick belongs to the member's season membership. A reinstated member has a new season
-- membership, so the API finds a member's earlier picks by member, not by season membership.
-- A pick may be linked to the pick confirmation duty that covers it (many picks to one duty).
create table piele.picks (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references piele.leagues (id),
  season_id uuid not null,
  season_membership_id uuid not null,
  fixture_id varchar(40) not null,
  side varchar(10) not null check (side in ('home', 'away', 'draw', 'missed')),
  margin smallint,
  is_default boolean not null default false,
  duty_id uuid,
  recorded_by_membership_id uuid not null,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((side in ('home','away') and margin between 1 and 150) or (side = 'draw' and margin = 0) or (side = 'missed' and margin is null)),
  check (not is_default or side in ('home','away')),
  foreign key (season_id, league_id) references piele.seasons (id, league_id),
  foreign key (season_membership_id, league_id) references piele.season_memberships (id, league_id),
  foreign key (recorded_by_membership_id, league_id) references piele.league_memberships (id, league_id),
  foreign key (duty_id, league_id) references piele.duties (id, league_id),
  unique (season_membership_id, fixture_id)
);
create index ix_picks_season_fixture on piele.picks (season_id, fixture_id);
alter table piele.picks enable row level security;
create policy picks_current on piele.picks for all to piele_api
  using (league_id = piele.current_league_id()) with check (league_id = piele.current_league_id());

-- Superbru rules per season. `rules` stores only the keys that differ from the API's
-- defaults (DEFAULT_RULES in apps/api/app/league/service.py); reads merge them. The previous
-- season's champion is a membership of the league, shown with a crown.
alter table piele.seasons add column rules jsonb not null default '{}'::jsonb;
alter table piele.seasons add column previous_champion_membership_id uuid;
alter table piele.seasons add constraint fk_seasons_previous_champion
  foreign key (previous_champion_membership_id, league_id) references piele.league_memberships (id, league_id);
