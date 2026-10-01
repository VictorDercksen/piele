-- Pavilion match chat. A member asks questions about one fixture in a small panel under the
-- preview; the API assembles a context from data the member may already read, relays one
-- model turn from the agent project (apps/agent, POST /chat/turn) and stores the transcript
-- here. A thread is one member's messages about one fixture (scope_kind 'fixture', scope_key
-- the fixture id); 'round' is reserved for a later round scope.

create table piele.chat_messages (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references piele.leagues (id),
  season_id uuid not null,
  membership_id uuid not null,
  scope_kind varchar(10) not null check (scope_kind in ('fixture', 'round')),
  scope_key varchar(40) not null,
  role varchar(10) not null check (role in ('user', 'assistant')),
  text text not null check (char_length(text) between 1 and 4000),
  -- The sources the answer cites: [{url, title}].
  sources jsonb not null default '[]'::jsonb,
  -- Token counts and the model the agent reported with its answer, if any.
  usage jsonb,
  model varchar(100),
  -- An answer that broke off or never came is 'failed'; one the member stopped, 'aborted'.
  status varchar(10) not null default 'complete' check (status in ('complete', 'failed', 'aborted')),
  created_at timestamptz not null default now(),
  foreign key (season_id, league_id) references piele.seasons (id, league_id),
  foreign key (membership_id, league_id) references piele.league_memberships (id, league_id)
);
create index ix_chat_messages_thread on piele.chat_messages (league_id, membership_id, scope_kind, scope_key, created_at);
create index ix_chat_messages_day on piele.chat_messages (league_id, membership_id, created_at) where role = 'user';

-- A member reads, writes and clears only their own threads, inside the league context the
-- API sets after its membership check. Messages are never edited.
alter table piele.chat_messages enable row level security;
create policy chat_messages_own_read on piele.chat_messages for select to piele_api
  using (
    league_id = piele.current_league_id()
    and exists (
      select 1 from piele.league_memberships m
      where m.id = membership_id and m.user_id = piele.current_user_id()
    )
  );
create policy chat_messages_own_insert on piele.chat_messages for insert to piele_api
  with check (
    league_id = piele.current_league_id()
    and exists (
      select 1 from piele.league_memberships m
      where m.id = membership_id and m.user_id = piele.current_user_id()
    )
  );
create policy chat_messages_own_delete on piele.chat_messages for delete to piele_api
  using (
    league_id = piele.current_league_id()
    and exists (
      select 1 from piele.league_memberships m
      where m.id = membership_id and m.user_id = piele.current_user_id()
    )
  );
revoke update on piele.chat_messages from piele_api;

-- One row per member question, kept when the member clears the thread, so clearing a
-- conversation never hands back turns: the per-thread, per-day and deployment-wide limits
-- count these rows, not the messages. Append-only.
create table piele.chat_turns (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references piele.leagues (id),
  membership_id uuid not null,
  scope_kind varchar(10) not null check (scope_kind in ('fixture', 'round')),
  scope_key varchar(40) not null,
  created_at timestamptz not null default now(),
  foreign key (membership_id, league_id) references piele.league_memberships (id, league_id)
);
create index ix_chat_turns_member on piele.chat_turns (league_id, membership_id, created_at);
create index ix_chat_turns_day on piele.chat_turns (created_at);

alter table piele.chat_turns enable row level security;
create policy chat_turns_own_read on piele.chat_turns for select to piele_api
  using (
    league_id = piele.current_league_id()
    and exists (
      select 1 from piele.league_memberships m
      where m.id = membership_id and m.user_id = piele.current_user_id()
    )
  );
create policy chat_turns_own_insert on piele.chat_turns for insert to piele_api
  with check (
    league_id = piele.current_league_id()
    and exists (
      select 1 from piele.league_memberships m
      where m.id = membership_id and m.user_id = piele.current_user_id()
    )
  );
revoke update, delete on piele.chat_turns from piele_api;

-- The deployment-wide cap (a kill switch on model spend) needs the number of questions in
-- every league, which the runtime role may not read. This function returns only that count,
-- for the 24 hours up to `at` (the API passes its own clock). Security definer: it runs as
-- the migration role, which owns the table, and pins the search path.
create function piele.chat_turns_last_day(at timestamptz default now()) returns bigint
  language sql stable security definer
  set search_path = ''
  as $$
    select count(*) from piele.chat_turns
    where created_at > at - interval '24 hours' and created_at <= at
  $$;
revoke execute on function piele.chat_turns_last_day(timestamptz) from public;
grant execute on function piele.chat_turns_last_day(timestamptz) to piele_api;

-- The preview agent's team research (both researcher results, unchanged), stored with the
-- preview so the chat can quote it. Members' preview reads do not return it.
alter table piele.match_previews add column research jsonb;
