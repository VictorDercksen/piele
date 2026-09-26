# Multi-league architecture

Status: proposal, 26 September 2026. Nothing here is implemented. It extends
`piele-application-plan.md` (which said "keep a single league experience in the initial
UI, retain league IDs in the model") to several leagues per account, several competitions
per product, a league switcher, league emblems and an operator-only league management
centre. Open questions are collected at the end.

## 1. Where the code stands

What already supports several leagues:

- Every league table carries `league_id` and has row level security keyed on
  `piele.current_league_id()` (`supabase/migrations/20260924160000_league_foundation.sql`).
- `piele.users` is account-wide; `league_memberships` is `unique (league_id, user_id)`, so
  one account may hold one membership per league.
- Evidence is stored under `{league_id}/{season_id}/{membership_id}/` in Storage.
- Seasons already carry a `competition` label and a league-level `timezone` exists.

What enforces one league per account today:

- `app/league/context.py:actor_for` picks the account's first active membership with
  `.first()`. No request carries a league; the API cannot be told which league you mean.
- `service.claim_membership` returns 409 `already_member` when the account has an active
  membership anywhere (`service.py:140-146`).
- `service.unclaimed_memberships` and the membership policy's `user_id is null` clause
  expose unclaimed names from every league. With a second league this is a bug: any
  signed-in account could claim a name in a league it was never invited to.
- Favourite team and notification read state live on `users`, so they are shared across
  leagues even though the team is competition-specific and the read marks are league-specific.
- The web app keeps one `LeagueData`, one set of localStorage keys, no league in any URL,
  and renders a static crest and "PIELE" wordmark top left (`core/layout/shell/shell.html:8-25`).

What ties everything to the URC:

- One schedule singleton (`matchcentre/schedule.py`, `core/competition/urc-fixtures.ts`),
  one club, stadium and country catalogue on each side, 21 rounds hard-coded in the API
  (`LAST_ROUND`), the database checks (`round_number between 1 and 21`) and the web
  (`REGULAR_ROUNDS`, `PLAYOFFS`), SAST hard-coded in roughly a dozen files.
- Fixture ids are the URC's own numeric ids and are used as global keys in
  `match_previews`, `preview_dispatches`, `fixture_milestones` and the snapshot cache
  (`scores:round:1` would collide between two competitions).
- Providers (URC GraphQL, ESPN fallback, Open-Meteo) are called directly from
  `MatchCentreService`; the preview agent's allow-list and instructions are URC-only.

Production today: one league, one season ("United Rugby Championship 2026/27"), 13
memberships of which 5 are claimed, 6 user accounts, 12 standings rows, 0 duties.

## 2. Concepts

| Concept | Scope | Lives in |
| --- | --- | --- |
| Account (user) | Global. Photo, operator flag, last-used league. | `piele.users` |
| League | Named, has an emblem, a timezone, a captain, a join code, seasons. | `piele.leagues` |
| Membership | One per (league, user). Display name, favourite team, notification read state, captaincy. | `piele.league_memberships` |
| Season | One active per league. Points at exactly one competition. | `piele.seasons` |
| Competition | Global. A schedule of rounds and fixtures, a team catalogue, providers, assets. Shared by every league that plays it. | Code registry keyed by `competition_id`; referenced from seasons and the global fixture tables |
| Operator | The single account allowed to create and archive leagues. Not a captain. | `users.is_operator` |

Rules:

- A league's competition is its active season's competition. Two leagues may run the same
  competition and season; they see the same fixtures, scores, teamsheets and previews and
  keep separate standings, duties, feed and marks.
- The captain is per league, as today. The operator gets no captain powers; the operator
  becomes captain of a league only by being its captain membership.
- Favourite team moves from the account to the membership because it is a team in that
  league's competition. When a member joins a second league on the same competition the
  API copies the team from an existing membership as the default.
- Notification read state moves from the account to the membership, because the stream
  (league feed plus that competition's round events) is per league.
- Rounds are validated against the competition, not a fixed 1 to 21.

## 3. Database changes (all additive, one migration per phase)

Phase 1 (foundation):

```sql
alter table piele.users add column is_operator boolean not null default false;
alter table piele.users add column last_league_id uuid references piele.leagues (id);

alter table piele.leagues
  add column slug varchar(40) not null unique,           -- 'piele'
  add column emblem_path varchar(300),                   -- Storage object or preset key
  add column accent_colour varchar(7),                   -- optional, for the brand chip
  add column join_code varchar(12) unique,               -- null = closed to joining
  add column status varchar(20) not null default 'active' check (status in ('active', 'archived'));

alter table piele.seasons add column competition_id varchar(40);  -- 'urc-2026-27'
update piele.seasons set competition_id = 'urc-2026-27';
alter table piele.seasons alter column competition_id set not null;

alter table piele.league_memberships
  add column favourite_team_id varchar(40),
  add column notifications_read_at timestamptz,
  add column notifications_read_keys jsonb not null default '[]'::jsonb;
-- backfill from users through user_id, then drop the users columns in a later migration
-- once the code no longer reads them.

-- Round bounds come from the competition. Replace the three 1..21 checks with >= 1.
alter table piele.duties drop constraint ..., add constraint ... check (round_number >= 1);
-- same for feed_entries and round_standings

-- Global competition tables get a competition column.
alter table piele.match_previews add column competition_id varchar(40) not null default 'urc-2026-27';
alter table piele.preview_dispatches add column competition_id varchar(40) not null default 'urc-2026-27';
alter table piele.fixture_milestones add column competition_id varchar(40) not null default 'urc-2026-27';
-- and their unique keys become (competition_id, fixture_id, ...)
```

Row level security changes:

- `leagues`: add `leagues_member` so an account can read the leagues it belongs to without
  a league context, for the switcher:
  `id in (select league_id from piele.league_memberships where user_id = <own user id>)`.
  Add `leagues_operator` for all rows when the caller's user row has `is_operator`.
  Both are select-only; writes keep `id = current_league_id()`.
- `league_memberships`: drop the blanket `user_id is null and auth_subject is not null`
  clause. Replace it with `lower(invited_email) = piele.current_auth_email()` so a reserved
  name is visible to the reserved address in any league. Unclaimed names become visible
  only inside a league context, which the API sets after validating a join code.
- The membership-to-users subquery is not recursive (leagues -> memberships -> users), which
  keeps the plan's rule about avoiding recursive membership policies.

## 4. API

### League in the path

League-scoped routes move under `/v1/leagues/{leagueId}`. Explicit beats a header: it is
visible in logs and tests, cacheable per league, and the actor dependency gets the league
from the path rather than hidden state. The change is mechanical: the existing `league`
router mounts with the prefix and `actor_dependency(league_id: UUID = Path(...))` looks up
the membership by `(user_id, league_id, status = 'active')`.

Account-level routes:

| Route | Returns |
| --- | --- |
| `GET /v1/me` | `{ userId, photoUrl, isOperator, lastLeagueId, leagues: [LeagueSummary] }` where each summary is `{ id, slug, name, emblemUrl, accentColour, competition: { id, name, shortName }, seasonName, memberId, displayName, isCaptain, inSeason }`. Runs the reserved-email auto-claim across every league that reserved this address. |
| `PUT /v1/me/last-league` | Records the league opened last, so a fresh device lands there. |
| `PUT /v1/me/photo`, `POST /v1/me/photo/uploads` | Unchanged, account-wide. |
| `GET /v1/join/{code}` | `{ league: LeagueSummary-without-member, unclaimed: [names] }`. Sets league context from the code. |
| `POST /v1/join/{code}` | Claims one unclaimed name in that league. Rejects only if this account already has a membership in this league. |

League-scoped routes (`/v1/leagues/{leagueId}/...`): `me` (the member's view, with the
favourite team and read marks), `members`, `duties`, `marks`, `standings`, `evidence`,
`feed`, `rounds/{n}/standings`, plus captain-only `emblem` and `join-code` routes. The
existing paths keep their shape under the prefix.

Competition routes (no league): `/v1/competitions/{competitionId}/matches/{fixtureId}`,
`/.../matches/{fixtureId}/preview`, `/.../rounds/{n}/scores`, `/.../rounds/{n}/updates`.
The unauthenticated score and match routes need the competition in the path because there
is no actor to derive it from. Previews and updates keep requiring a signed-in account
whose leagues include one on that competition.

Operator routes (`operator_dependency`, checks `users.is_operator`):

| Route | Action |
| --- | --- |
| `GET /v1/operator/leagues` | Every league with member counts, competition, captain, status. |
| `POST /v1/operator/leagues` | Creates league, captain membership, first season and season memberships in one transaction. Body: name, slug, timezone, competition id, season name, members `[{ fullName, displayName }]`, captain display name, captain email reservation, optional emblem preset. This is `bootstrap.bootstrap` refactored into `service.create_league` and shared with the CLI. |
| `PATCH /v1/operator/leagues/{id}` | Rename, archive or restore. |
| `POST /v1/operator/leagues/{id}/join-code` | Issue or rotate a join code (the captain can too, from the desk). |

Everything the operator does writes an audit event with `actor_label = 'operator'`.

### Actor

`Actor` gains `competition: Competition` (resolved from the season's `competition_id`),
`league_slug`, `league_timezone` and `favourite_team_id` (from the membership). Round
validation (`le=LAST_ROUND`) becomes `actor.competition.validate_round(n)`, and
`default_deadline` uses `actor.competition.first_kickoff(round)`.

### Competition registry

New package `app/competitions/`:

```
competitions/
  registry.py          # COMPETITIONS: dict[str, Competition]; get(competition_id)
  base.py              # Competition dataclass and provider Protocols
  urc_2026_27/
    __init__.py        # the Competition instance
    schedule.json      # moved from app/data/urc_fixtures.json
    catalogue.py       # clubs, stadiums (moved from matchcentre/catalogue.py)
    providers.py       # URC GraphQL scores + teamsheets, ESPN fallback wiring
```

`Competition` carries: `id`, `name`, `short_name`, `sport`, `schedule` (loaded lazily,
one per competition, replacing the `lru_cache` singleton), `clubs`, `stadiums`,
`regular_rounds`, `last_round`, `round_label(n)`, `first_kickoff(n)`, and three providers
behind Protocols: `ScoresProvider`, `TeamsheetsProvider`, `FallbackScoresProvider`
(weather stays generic). `MatchCentreService` takes a `Competition` instead of settings.
Snapshot keys become `{competition_id}:scores:round:{n}` and so on.

This is the minimum that lets a second competition be added as one new folder. It does
not build a second competition.

### Storage

- Evidence: unchanged.
- Avatars: unchanged (`avatars/{user_id}/`).
- Emblems: `emblems/{league_id}/{token}.png` in the same private bucket with API-signed
  URLs like photos, or a separate public bucket so the switcher does not sign a URL per
  league per load. Recommendation: public bucket `emblems`, because an emblem is not
  member data and it is fetched on every page load. Presets ship as static assets under
  `assets/images/emblems/` and are stored as `preset:<key>`.

### Agent

`preview_dispatches` and the dispatch payload gain `competition_id`. The agent's
allow-list, instructions and researcher wording move under a per-competition folder so a
second competition adds one folder. Nothing else in the agent changes in phase 1.

## 5. Web app

### League context

- `LeagueContext` service (`core/league/league-context.ts`): signals `leagues`
  (from `GET /v1/me`), `current` (a `LeagueSummary`), `competition` (from the registry by
  `current.competition.id`), `isOperator`. Everything that reads `HttpLeagueData.leagueName`
  or `CompetitionService` today reads these instead.
- `HttpLeagueData` becomes a per-league store: `select(leagueId)` clears the records and
  reloads against `${apiUrl}/v1/leagues/${id}`. `ensureLoaded` stays.
- `CompetitionService` becomes a registry (`core/competition/registry.ts`) returning a
  `Competition` per id: `{ id, name, shortName, schedule, rounds, regularRounds, teams,
  stadiums, banners, countries, assets: { ball, emblem } }`. `RoundViewService`,
  `NotificationsService`, the shell, the match page and `LiveScoresService` take the
  current competition from `LeagueContext`. The display timezone comes from
  `leagues.timezone` (already in the model) and replaces the hard-coded SAST strings.
- `ProfileStore` validates the favourite team against the current competition's teams
  and saves through the league-scoped `me/profile` route.
- localStorage keys used by the sample and empty builds gain the league id.
- The sample build ships two sample leagues (both URC) so the switcher can be developed
  and tested without an API.

### Routes

The league slug prefixes every league page: `/:league/`, `/:league/standings`,
`/:league/duties`, `/:league/match/:id`, `/:league/more`, and so on. The current routes
move under the prefix unchanged. Account-level routes stay bare: `/sign-in`, `/welcome`,
`/profile`, `/join/:code`, `/manage` (operator). `/` redirects to the last-used league,
to the league picker when there are several and no last-used one, or to a "no league yet"
page with a join-code field when there are none. Reason: bookmarks, refresh, back button
and links shared between members must all land in the right league. A `leagueRequired`
guard resolves the slug against `LeagueContext.leagues` and redirects to `/` when the
account is not a member of it.

The `round` query parameter and `SelectedRoundService` are unaffected.

### League switcher (top left)

Replace the static crest and wordmark in both `rail-brand` and `club-brand` with the
current league's emblem and name, plus the competition short name beneath. It is a button
(`aria-haspopup="dialog"`) that opens a sheet from the top on phones and a popover on
desktop, built the way the notifications flag is: local `open` signal, Escape and
outside-pointer close, focus returned to the button.

Sheet contents:

1. One row per league: emblem, name, competition and season, "Captain" tag where
   applicable, "Not in this season" when `inSeason` is false. The current league is marked.
2. "Join a league" (opens the join-code field).
3. "Manage leagues", shown only when `isOperator`.

Choosing a league navigates to the same page path under the new slug when that page
exists for the league, else to its home. With one league the button still opens the
sheet, so joining is discoverable. The product wordmark moves to the sign-in page, the
footer and the More page.

### Emblem

The captain sets the emblem from the captain's desk: a preset gallery (a set of crests in
the Floodlights style) or an upload that the browser resizes to 512 px, uploaded with an
API-issued grant exactly like profile photos. Default when none is set: a monogram of the
league's initials on the accent colour, reusing the member monogram treatment.

### Joining

- `/join/:code`: shows the league's name and emblem and its unclaimed names, then the same
  two-tap claim as today. Sign-in first if needed, then return to the code.
- The captain's desk shows the join link with copy and rotate. Reservation by email keeps
  working per league.
- The existing `/claim` page becomes the join page for a specific league instead of an
  unscoped list.

### Management centre (`/manage`, operator only)

- League list with member counts, competition, captain, status, join code.
- Create league: name, slug (derived, editable), timezone, competition (from the registry),
  season name, captain (the operator or a name plus reserved email), members pasted one per
  line as "Full name, Superbru name", emblem preset. One request, one transaction.
- Archive and restore.
- The route is guarded client-side by `isOperator` for navigation only; the API decides.

## 6. Renaming the product

"Piele" stays as the league's name. The product needs its own name for the repo, the
three Vercel projects, the two Supabase projects, titles, the boot wordmark and route
titles. Candidates, all short, rugby or clubhouse flavoured, and easy to say in South
African English or Afrikaans:

| Name | Why |
| --- | --- |
| Kantien | The club bar where the league is argued about. Distinctive, unlikely to collide. |
| Stoep | Where mates watch the match. Short, warm, local. |
| Touchline | Neutral English rugby word, reads well internationally. |
| Pavilion | Clubhouse feel, works for any sport if competitions widen beyond rugby. |
| Scrumcap | Playful, clearly rugby. Less fitting if football pools arrive. |
| Spoons | Named for the wooden spoon duty that drives the app. Very informal. |

Recommendation: Kantien (fallback Stoep), with the tagline "the rugby clubhouse" kept.
Names were not checked against domain or trademark availability.

What to rename and what to leave:

| Item | Rename? | Notes |
| --- | --- | --- |
| GitHub repo `VictorDercksen/piele` | Yes | GitHub redirects the old URL. Re-check the Vercel git link, the Supabase GitHub integration branch mapping and this project's Claude Code repository scope afterwards. |
| Vercel projects `piele-web`, `piele-api`, `piele-agent` | Yes | Renaming changes the default `*.vercel.app` URLs, so `ALLOWED_ORIGINS`, `PIELE_API_URL`, the agent's API URL and the Supabase Auth redirect allowlist change in the same release. Adding custom domains at the same time avoids doing this twice. |
| Supabase projects `piele-staging`, `piele-production` | Yes, cosmetic | Project refs, connection strings and keys do not change. |
| `angular.json` project, `package.json` names, `pyproject.toml` name, output folder `dist/piele-web` | Yes | `vercel.json` `outputDirectory` follows. |
| Titles, wordmark, aria-labels, eyebrows ("PIELE / CAPTAIN'S DESK"), preview wording ("Piele preview") | Yes, but split | Product name where it means the app; league name where it means the league. Eyebrows and the footer should show the current league's name, not the product. "Piele preview" becomes "<Product> preview" or "the clubhouse preview". |
| Environment variable prefix `PIELE_*` | Optional | Renaming means re-entering every Vercel variable in both environments and the agent. Recommend keeping the prefix or renaming in its own release. |
| Database schema `piele`, role `piele_api`, storage bucket `evidence` | No | Renaming a schema and role under row level security on a live database has no product benefit and real risk. |
| localStorage keys `piele-profile-v1`, `piele-notifications-read-v2` | Yes with migration | Read the old key once, write the new one. |

## 7. Phasing

Each phase ships on its own and keeps today's single-league behaviour for members.

1. Rename. Own PR, no behaviour change. Can go first or last; first avoids renaming
   files the later phases add.
2. Foundation. Migration in section 3, competition registry on both sides, league in the
   API path, `GET /v1/me` as the account view, membership-level team and read state, fix
   the cross-league unclaimed exposure, league slug in web routes with `/` redirecting.
   One league in production still; users notice only the URL prefix.
3. Switcher, emblem, join code and join page.
4. Management centre and the operator flag set on your account by SQL.
5. Second competition, when one is chosen: providers behind the Protocols, the agent's
   per-competition folder, web assets per competition, competition-scoped live polling.

## 8. Tests to add

- API: one account bootstrapped into two leagues; each league's `me`, standings and feed
  differ; a request for a league the account is not in returns 403 `not_a_member`.
- API: unclaimed names are visible only through a valid join code and only for that league.
- API: the operator dependency rejects captains; `create_league` writes an audit event and
  the league's first feed entry; the CLI and the endpoint produce identical rows.
- Database: cross-league reads under the new `leagues_member` policy return only the
  caller's leagues; the `invited_email` clause exposes exactly the reserved row.
- Web: switcher lists leagues and navigates to the same page under the new slug; `/`
  redirects by last-used league; the join page claims a name for the coded league only;
  the operator route is hidden for non-operators.
- E2E: two sample leagues in the development build, switch and check the feed changes.

## 9. Decisions needed

1. Product name: pick one from section 6 or propose another. Rename the env prefix or not.
   Custom domains now or later.
2. League in the URL (`/:league/...`, recommended) or hidden current-league state.
3. Favourite team per membership (recommended) or per account.
4. Emblem: presets, upload, or both (recommended both). Set by the captain (recommended)
   or only the operator.
5. Joining: join link with a code (recommended), or only captain email reservations.
6. Which competitions come next. The model assumes rounds of home-and-away fixtures with
   kickoffs. Rugby and football pools fit; a driver championship or a golf major would not.
7. Operator identity: `users.is_operator` set by SQL (recommended) or an environment
   variable of allowed auth subjects.
8. New leagues: are you the default captain, or does creation always name a captain by
   email reservation.
9. Should the second league in the sample build be a second URC league, or a placeholder
   competition to shake out the competition abstraction early.
