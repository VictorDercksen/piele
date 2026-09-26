-- Hardening after the multi-league review (docs/multi-league-architecture.md).

-- Membership writes stay inside the league context. An account reads its own memberships in
-- every league (the league list) and names reserved for its verified email, but it writes a
-- membership only in the league whose context the API has set after its checks, so a
-- membership id from another league can never be changed through this league's routes.
-- Every membership write in the API sets the league context first: claiming a name (join and
-- the reserved-name claim on GET /v1/me), creating a league, the admin adding themselves,
-- and the steward routes. SELECT ... FOR UPDATE also needs the update policy, so locking a
-- membership row needs the league context too.
drop policy league_memberships_current on piele.league_memberships;
create policy league_memberships_read on piele.league_memberships for select to piele_api
  using (
    league_id = piele.current_league_id()
    or user_id = piele.current_user_id()
    or (user_id is null and lower(invited_email) = piele.current_auth_email())
  );
create policy league_memberships_insert on piele.league_memberships for insert to piele_api
  with check (league_id = piele.current_league_id());
create policy league_memberships_update on piele.league_memberships for update to piele_api
  using (league_id = piele.current_league_id())
  with check (league_id = piele.current_league_id());
create policy league_memberships_delete on piele.league_memberships for delete to piele_api
  using (league_id = piele.current_league_id());

-- A withdrawn member no longer sees the league outside its context (the league list).
drop policy leagues_member on piele.leagues;
create policy leagues_member on piele.leagues for select to piele_api
  using (
    id in (
      select league_id from piele.league_memberships
      where user_id = piele.current_user_id() and status = 'active'
    )
  );

-- The runtime role updates only the account columns the API writes: the email from the
-- token, the photo and the last league opened. is_admin is set by an operator with SQL, and
-- the legacy favourite_team_id and notifications_read_* columns (read state and team now
-- live on the membership) are no longer written; a later migration drops them.
revoke update on piele.users from piele_api;
grant update (email, photo_path, photo_updated_at, last_league_id, updated_at) on piele.users to piele_api;

-- Deploy window. 20260926150000_competitions.sql moved the fixture_milestones primary key
-- to (competition_id, fixture_id, kind), which leaves the previously deployed API's
-- milestone upsert (on conflict (fixture_id, kind)) without a matching unique index. This
-- index keeps that upsert working until the new API is live. Every stored milestone is a
-- URC 2026/27 one, so it holds. A later cleanup migration drops it, once a second
-- competition could share fixture ids.
create unique index if not exists ux_fixture_milestones_legacy on piele.fixture_milestones (fixture_id, kind);

-- New account rows carry only the sign-in identity; is_admin cannot be set through an insert.
revoke insert on piele.users from piele_api;
grant insert (auth_subject, email) on piele.users to piele_api;
