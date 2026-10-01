-- Players' international (Test) records, kept so the preview agent and the match chat know
-- which selected players have played Test rugby and for which union. The URC feed's own
-- nationalTeam field does not work, and birth country is not the test team, so the team
-- researcher finds each record on a cited web page and the API stores it here when the
-- player is in the side's current teamsheet (POST /v1/agent/previews).
--
-- Competition data shared by every league, like match_previews: one row per club and player,
-- keyed by the normalised name (app/agent/internationals.py player_key: accents stripped,
-- lower case, whitespace collapsed). A row with origin 'operator' was entered by hand and is
-- never overwritten by the researcher; only the operator changes or removes those.

create table piele.player_internationals (
  club_id text not null,
  player_key text not null check (char_length(player_key) >= 1),
  name text not null check (char_length(name) between 1 and 100),
  union_name text not null check (char_length(union_name) between 1 and 40),
  caps integer check (caps between 1 and 250),
  caps_as_of date,
  last_test_on date,
  source_url text not null check (source_url ~* '^https?://' and char_length(source_url) <= 2000),
  source_title text not null check (char_length(source_title) between 1 and 200),
  source_publisher text check (char_length(source_publisher) <= 100),
  origin text not null default 'researcher' check (origin in ('researcher', 'operator')),
  checked_at timestamptz not null default now(),
  primary key (club_id, player_key)
);

-- The API reads, inserts and updates researcher rows. It never deletes (rows go stale and
-- are overwritten, or the operator removes them), and it cannot write an operator row: an
-- insert must be a researcher row, and an update can only see researcher rows (USING) and
-- must leave them so (WITH CHECK). The API's upsert is therefore an INSERT ... ON CONFLICT
-- DO NOTHING followed by an UPDATE of the researcher rows it did not insert; an ON CONFLICT
-- DO UPDATE would raise on an operator row, because that row fails the update's USING.
alter table piele.player_internationals enable row level security;
create policy player_internationals_read on piele.player_internationals for select to piele_api using (true);
create policy player_internationals_insert on piele.player_internationals for insert to piele_api
  with check (origin = 'researcher');
create policy player_internationals_update on piele.player_internationals for update to piele_api
  using (origin = 'researcher') with check (origin = 'researcher');
revoke delete on piele.player_internationals from piele_api;
