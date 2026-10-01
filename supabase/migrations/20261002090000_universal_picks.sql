-- One Superbru pick per account, competition and fixture. A member of several leagues on the
-- same competition makes one pick per match on Superbru, so every league of theirs on that
-- competition reads the same pick, and the captain of any of them may correct it (the audit
-- event stays in the league where the change was made). A name nobody has claimed yet has
-- no account, so its picks belong to its league membership until the name is claimed; the
-- claim moves them to the account (the account's own pick wins where both exist), and a
-- release copies the account's picks on the league's competition back to the name.
--
-- The pick confirmation duty that covers a member's pick is league-local, so it leaves the
-- pick row for piele.pick_duty_links.
--
-- The API deployed with this migration reads the new table. The previous API's picks routes
-- fail for the minutes between the migration and the deploy, as with the earlier key change
-- in 20260926150000_competitions.sql.

-- The old table and its index names make way for the new ones.
alter table piele.picks rename to picks_legacy;
alter index piele.picks_pkey rename to picks_legacy_pkey;
alter index piele.picks_season_membership_id_fixture_id_key rename to picks_legacy_season_membership_id_fixture_id_key;
alter index piele.ix_picks_season_fixture rename to ix_picks_legacy_season_fixture;

-- Constraints are named, since the legacy table still holds the default names here.
-- Exactly one owner: the account (user_id) or an unclaimed name (membership_id with its
-- league_id). Fixture ids are unique within a competition.
create table piele.picks (
  id uuid primary key default gen_random_uuid(),
  competition_id varchar(40) not null,
  fixture_id varchar(40) not null,
  user_id uuid references piele.users (id),
  membership_id uuid,
  league_id uuid constraint picks_league_id_fkey references piele.leagues (id),
  side varchar(10) not null constraint picks_side_check check (side in ('home', 'away', 'draw', 'missed')),
  margin smallint,
  is_default boolean not null default false,
  recorded_by_user_id uuid references piele.users (id),
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint picks_one_owner check ((user_id is null) <> (membership_id is null)),
  constraint picks_name_league check ((membership_id is null) = (league_id is null)),
  constraint picks_margin_check check ((side in ('home','away') and margin between 1 and 150) or (side = 'draw' and margin = 0) or (side = 'missed' and margin is null)),
  constraint picks_default_check check (not is_default or side in ('home','away')),
  foreign key (membership_id, league_id) references piele.league_memberships (id, league_id)
);
create unique index ux_picks_account on piele.picks (user_id, competition_id, fixture_id) where user_id is not null;
create unique index ux_picks_name on piele.picks (membership_id, competition_id, fixture_id) where membership_id is not null;
create index ix_picks_competition_fixture on piele.picks (competition_id, fixture_id);
comment on table piele.picks is
  'One Superbru pick per owner, competition and fixture. The owner is the account (user_id), '
  'read by every league of theirs on the competition, or an unclaimed name (membership_id, '
  'league_id), league-local until the claim moves it to the account.';

create table piele.pick_duty_links (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references piele.leagues (id),
  season_id uuid not null,
  season_membership_id uuid not null,
  fixture_id varchar(40) not null,
  duty_id uuid not null,
  created_at timestamptz not null default now(),
  foreign key (season_id, league_id) references piele.seasons (id, league_id),
  foreign key (season_membership_id, league_id) references piele.season_memberships (id, league_id),
  foreign key (duty_id, league_id) references piele.duties (id, league_id),
  unique (season_membership_id, fixture_id)
);
create index ix_pick_duty_links_duty on piele.pick_duty_links (duty_id);

-- Claimed names' picks become the account's: one per account, competition and fixture, the
-- most recently updated legacy row winning where two leagues (or two season memberships of
-- a reinstated member) held one. The recorder is the recording membership's account.
insert into piele.picks (id, competition_id, fixture_id, user_id, side, margin, is_default,
                         recorded_by_user_id, version, created_at, updated_at)
select distinct on (owner.user_id, s.competition_id, l.fixture_id)
  l.id, s.competition_id, l.fixture_id, owner.user_id, l.side, l.margin, l.is_default,
  recorder.user_id, l.version, l.created_at, l.updated_at
from piele.picks_legacy l
join piele.season_memberships sm on sm.id = l.season_membership_id
join piele.league_memberships owner on owner.id = sm.membership_id
join piele.seasons s on s.id = l.season_id
join piele.league_memberships recorder on recorder.id = l.recorded_by_membership_id
where owner.user_id is not null
order by owner.user_id, s.competition_id, l.fixture_id, l.updated_at desc, l.id;

-- Unclaimed names keep league-local picks.
insert into piele.picks (id, competition_id, fixture_id, membership_id, league_id, side, margin,
                         is_default, recorded_by_user_id, version, created_at, updated_at)
select distinct on (owner.id, s.competition_id, l.fixture_id)
  l.id, s.competition_id, l.fixture_id, owner.id, owner.league_id, l.side, l.margin,
  l.is_default, recorder.user_id, l.version, l.created_at, l.updated_at
from piele.picks_legacy l
join piele.season_memberships sm on sm.id = l.season_membership_id
join piele.league_memberships owner on owner.id = sm.membership_id
join piele.seasons s on s.id = l.season_id
join piele.league_memberships recorder on recorder.id = l.recorded_by_membership_id
where owner.user_id is null
order by owner.id, s.competition_id, l.fixture_id, l.updated_at desc, l.id;

insert into piele.pick_duty_links (league_id, season_id, season_membership_id, fixture_id, duty_id, created_at)
select league_id, season_id, season_membership_id, fixture_id, duty_id, updated_at
from piele.picks_legacy
where duty_id is not null;

drop table piele.picks_legacy;

-- The account reads and writes its own picks in any context, the push job reads them all to
-- find who has not picked, and inside a league's context the captain or admin reaches the
-- picks of the league's names and of the accounts that belong to it.
alter table piele.picks enable row level security;
create policy picks_owner on piele.picks for all to piele_api
  using (
    user_id = piele.current_user_id()
    or piele.current_job() = 'push'
    or league_id = piele.current_league_id()
    or user_id in (
      select user_id from piele.league_memberships
      where league_id = piele.current_league_id() and user_id is not null
    )
  )
  with check (
    user_id = piele.current_user_id()
    or piele.current_job() = 'push'
    or league_id = piele.current_league_id()
    or user_id in (
      select user_id from piele.league_memberships
      where league_id = piele.current_league_id() and user_id is not null
    )
  );

alter table piele.pick_duty_links enable row level security;
create policy pick_duty_links_current on piele.pick_duty_links for all to piele_api
  using (league_id = piele.current_league_id()) with check (league_id = piele.current_league_id());
