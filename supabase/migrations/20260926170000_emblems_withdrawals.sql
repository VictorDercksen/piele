-- League emblems and member withdrawal (multi-league phase 3, docs/multi-league-architecture.md).

-- Emblems are a preset key or an object in the private bucket under emblems/<league id>/.
alter table piele.leagues
  add constraint leagues_emblem_path_own
  check (emblem_path is null or emblem_path like 'preset:%' or emblem_path like 'emblems/' || id::text || '/%');

-- Why a member was removed, shown to the captain beside the date. The audit trail keeps it too.
alter table piele.league_memberships add column withdrawal_reason text;

-- A reinstated member is enrolled again with a new season membership, and the withdrawn row
-- keeps its effective_to to mark the gap, so a member may hold several rows in one season.
-- At most one of them is active.
alter table piele.season_memberships drop constraint season_memberships_season_id_membership_id_key;
create unique index ux_season_memberships_one_active
  on piele.season_memberships (season_id, membership_id)
  where status = 'active';
