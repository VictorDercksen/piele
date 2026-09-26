-- Multi-league foundation (multi-league phase 2, docs/multi-league-architecture.md).
-- An account can belong to several leagues; league-scoped API routes carry the league in
-- the path (/v1/leagues/{leagueId}/...). Accounts gain a global admin flag, set only by an
-- operator with SQL (see docs/production.md), and remember the league they opened last.
-- Leagues gain a URL slug, an optional emblem and accent colour, a join code and a status.
-- The favourite team and the notification read state move from the account to the
-- membership, because a team belongs to the league's competition and the notification
-- stream is per league.
alter table piele.users
  add column is_admin boolean not null default false,
  add column last_league_id uuid references piele.leagues (id);

alter table piele.leagues
  add column slug varchar(40),
  add column emblem_path varchar(300),
  add column accent_colour varchar(7) check (accent_colour is null or accent_colour ~ '^#[0-9a-f]{6}$'),
  add column join_code varchar(16),
  add column status varchar(20) not null default 'active' check (status in ('active', 'archived'));
-- Production holds one league, Piele. Any other existing league (a development database)
-- gets a slug from its id. Join codes are twelve hex characters (48 random bits) from the
-- core gen_random_uuid(), whose first twelve hex digits are all random; pgcrypto's
-- gen_random_bytes is not installed everywhere this history is applied (CI runs plain
-- PostgreSQL 17).
update piele.leagues
  set slug = case
        when id = (select id from piele.leagues order by created_at, id limit 1) then 'piele'
        else 'league-' || replace(id::text, '-', '')
      end,
      join_code = left(replace(gen_random_uuid()::text, '-', ''), 12);
alter table piele.leagues alter column slug set not null;
alter table piele.leagues add constraint leagues_slug_format check (slug ~ '^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])?$');
create unique index ux_leagues_slug on piele.leagues (slug);
create unique index ux_leagues_join_code on piele.leagues (join_code) where join_code is not null;

alter table piele.league_memberships
  add column favourite_team_id varchar(40),
  add column notifications_read_at timestamptz,
  add column notifications_read_keys jsonb not null default '[]'::jsonb,
  add constraint league_memberships_notifications_read_keys_array
    check (jsonb_typeof(notifications_read_keys) = 'array');
update piele.league_memberships m
  set favourite_team_id = u.favourite_team_id,
      notifications_read_at = u.notifications_read_at,
      notifications_read_keys = u.notifications_read_keys
  from piele.users u where u.id = m.user_id;
-- The users columns favourite_team_id, notifications_read_at and notifications_read_keys
-- stay for one release (the running code reads them while this migration applies), but the
-- new code never reads or writes them. A later migration drops them.

create function piele.current_user_id() returns uuid
  language sql stable
  as $$ select id from piele.users where auth_subject = piele.current_auth_subject() $$;

create function piele.current_user_is_admin() returns boolean
  language sql stable
  as $$ select coalesce((select is_admin from piele.users where auth_subject = piele.current_auth_subject()), false) $$;

-- An account reads the leagues it belongs to without a league context (the league list),
-- and the admin reads every league. Writes still need the league context.
create policy leagues_member on piele.leagues for select to piele_api
  using (id in (select league_id from piele.league_memberships where user_id = piele.current_user_id()));
create policy leagues_admin on piele.leagues for select to piele_api
  using (piele.current_user_is_admin());
-- A join code opens exactly one league to a signed-in account that does not belong to it
-- yet: the API sets the transaction-local piele.join_code from the request path, reads the
-- league it names, and only then sets the league context.
create policy leagues_join_code on piele.leagues for select to piele_api
  using (join_code is not null and join_code = nullif(current_setting('piele.join_code', true), ''));

-- Unclaimed names are no longer visible to every signed-in account across leagues: only
-- inside the league context (set after a join code or membership check), or a name
-- reserved for the caller's verified email in any league.
drop policy league_memberships_current on piele.league_memberships;
create policy league_memberships_current on piele.league_memberships for all to piele_api
  using (
    league_id = piele.current_league_id()
    or user_id = piele.current_user_id()
    or (user_id is null and lower(invited_email) = piele.current_auth_email())
  )
  with check (
    league_id = piele.current_league_id()
    or user_id = piele.current_user_id()
  );
