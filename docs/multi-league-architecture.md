# Multi-league architecture

Status: proposal with decisions recorded, 26 September 2026. Nothing here is
implemented. It extends `piele-application-plan.md` (which said "keep a single league
experience in the initial UI, retain league IDs in the model") to several leagues per
account, several rugby competitions per product, a league switcher, league emblems, join
codes, a global admin and an admin-only league management centre.

Working product name: **The Pavilion**. Piele stays the name of the first league.

## Decisions recorded on 2026-09-26

| Topic | Decision |
| --- | --- |
| Product name | The Pavilion (working name). Tagline "the rugby clubhouse" stays. |
| League in the URL | Yes. Web routes are prefixed with the league slug; API routes carry the league id. |
| Favourite team | Per membership, not per account. |
| Emblem | Preset gallery and custom upload, both. |
| Joining | Join-code links, one rotatable code per league, plus the existing reservation by email. |
| Competitions | Rugby only for now. The registry still exists so a second rugby competition (Currie Cup, Rugby Championship, Six Nations, World Cup) is one new folder. |
| Admin | One global admin account (the operator) with access to every league and captain-level rights in all of them. Each league still has its own captain, who may be someone else. |

## 1. Where the code stands

What already supports several leagues:

- Every league table carries `league_id` and has row level security keyed on
  `piele.current_league_id()` (`supabase/migrations/20260924160000_league_foundation.sql`).
- `piele.users` is account-wide; `league_memberships` is `unique (league_id, user_id)`, so
  one account may hold one membership per league.
- Evidence is stored under `{league_id}/{season_id}/{membership_id}/` in Storage.
- Seasons already carry a `competition` label and a league-level `timezone` exists.
- `GET /members` already returns every league membership with an `inSeason` flag, so a
  member outside the active season is a known state.

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
| Account (user) | Global. Photo, admin flag, last-used league. | `piele.users` |
| League | Named, has an emblem, a timezone, a captain, a join code, seasons. | `piele.leagues` |
| Membership | One per (league, user). Display name, favourite team, notification read state, captaincy. | `piele.league_memberships` |
| Season | One active per league. Points at exactly one competition. | `piele.seasons` |
| Competition | Global. A rugby schedule of rounds and fixtures, a team catalogue, providers, assets. Shared by every league that plays it. | Code registry keyed by `competition_id`; referenced from seasons and the global fixture tables |
| Captain | Per league, as today. Runs the league day to day. | `leagues.captain_membership_id` |
| Admin | Global. Sees every league, holds captain-level rights in all of them, creates and archives leagues, appoints captains. | `users.is_admin` |

Rules:

- A league's competition is its active season's competition. Two leagues may run the same
  competition and season; they see the same fixtures, scores, teamsheets and previews and
  keep separate standings, duties, feed and marks.
- Captain authority stays per league and comes from `leagues.captain_membership_id`.
  Admin authority is global and comes from `users.is_admin`. A route that today requires
  the captain requires "captain or admin". Admin-only routes (create, archive, appoint a
  captain) require the admin.
- The admin can open every league. Reads need no membership. Writes that the schema
  attributes to a member (`created_by_membership_id`, `recorded_by_membership_id`,
  `decided_by_membership_id`, feed actors) need a membership in that league, so the admin
  gets one on demand: "Add me to this league" in the management centre creates a
  membership outside the active season. It shows on the team sheet as not in this season,
  never on standings or in duties, and satisfies every foreign key. The admin's own
  league (Piele) is an ordinary in-season membership.
- The rule that a captain cannot decide their own evidence applies to the admin too.
- Favourite team moves from the account to the membership because it is a team in that
  league's competition. When a member joins a second league on the same competition the
  API copies the team from an existing membership as the default.
- Notification read state moves from the account to the membership, because the stream
  (league feed plus that competition's round events) is per league.
- Rounds are validated against the competition, not a fixed 1 to 21.

## 3. Database changes (all additive, one migration per phase)

Phase 2 (foundation):

```sql
alter table piele.users add column is_admin boolean not null default false;
alter table piele.users add column last_league_id uuid references piele.leagues (id);

alter table piele.leagues
  add column slug varchar(40) not null unique,           -- 'piele'
  add column emblem_path varchar(300),                   -- Storage object path or 'preset:<key>'
  add column accent_colour varchar(7),                   -- optional, for the brand chip and monogram
  add column join_code varchar(12) unique,               -- null = closed to joining
  add column status varchar(20) not null default 'active' check (status in ('active', 'archived'));

alter table piele.seasons add column competition_id varchar(40);  -- 'urc-2026-27'
update piele.seasons set competition_id = 'urc-2026-27';
alter table piele.seasons alter column competition_id set not null;

alter table piele.league_memberships
  add column favourite_team_id varchar(40),
  add column notifications_read_at timestamptz,
  add column notifications_read_keys jsonb not null default '[]'::jsonb;
-- backfill from users through user_id; drop the users columns in a later migration once
-- the code no longer reads them.

-- Round bounds come from the competition. Replace the three 1..21 checks with >= 1 on
-- duties, feed_entries and round_standings.

-- Global competition tables get a competition column, and their keys become
-- (competition_id, fixture_id, ...).
alter table piele.match_previews add column competition_id varchar(40) not null default 'urc-2026-27';
alter table piele.preview_dispatches add column competition_id varchar(40) not null default 'urc-2026-27';
alter table piele.fixture_milestones add column competition_id varchar(40) not null default 'urc-2026-27';
```

The admin flag is set once by SQL on the production database, outside migrations, the
way the runtime role's password is: `update piele.users set is_admin = true where
auth_subject = '<your subject>'`. No API route grants or removes it.

Row level security changes:

- `leagues`: add `leagues_member` (select) so an account can read the leagues it belongs
  to without a league context, for the switcher:
  `id in (select league_id from piele.league_memberships where user_id = <own user id>)`.
  Add `leagues_admin` (select) for every row when the caller's user row has `is_admin`.
  Writes keep `id = current_league_id()`; the API sets the context after checking the
  caller is a member or the admin.
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
the membership by `(user_id, league_id, status = 'active')`. When there is none and the
caller is the admin, the actor is built with `membership_id = None`, `is_admin = True`,
and reads proceed; attributed writes return 409 `admin_not_a_member` with the hint to add
themselves from the management centre.

Account-level routes:

| Route | Returns |
| --- | --- |
| `GET /v1/me` | `{ userId, photoUrl, isAdmin, lastLeagueId, leagues: [LeagueSummary] }`. For the admin, `leagues` holds every active league with `memberId` null where they hold no membership. Each summary is `{ id, slug, name, emblemUrl, accentColour, competition: { id, name, shortName }, seasonName, memberId, displayName, isCaptain, inSeason }`. Runs the reserved-email auto-claim across every league that reserved this address. |
| `PUT /v1/me/last-league` | Records the league opened last, so a fresh device lands there. |
| `PUT /v1/me/photo`, `POST /v1/me/photo/uploads` | Unchanged, account-wide. |
| `GET /v1/join/{code}` | `{ league: LeagueSummary-without-member, unclaimed: [names] }`. Sets league context from the code. |
| `POST /v1/join/{code}` | Claims one unclaimed name in that league. Rejects only if this account already has a membership in this league. |

League-scoped routes (`/v1/leagues/{leagueId}/...`): `me` (the member's view, with the
favourite team and read marks), `members`, `duties`, `marks`, `standings`, `evidence`,
`feed`, `rounds/{n}/standings`, plus `emblem` (grant and set), `emblem/preset` and
`join-code` (issue or rotate) for the captain or admin. The existing paths keep their
shape under the prefix. `captain_dependency` becomes `steward_dependency`: captain of
this league, or admin.

Competition routes (no league): `/v1/competitions/{competitionId}/matches/{fixtureId}`,
`/.../matches/{fixtureId}/preview`, `/.../rounds/{n}/scores`, `/.../rounds/{n}/updates`.
The unauthenticated score and match routes need the competition in the path because there
is no actor to derive it from. Previews and updates keep requiring a signed-in account
whose leagues include one on that competition (or the admin).

Admin routes (`admin_dependency`, checks `users.is_admin`):

| Route | Action |
| --- | --- |
| `GET /v1/admin/leagues` | Every league, archived included, with member counts, competition, captain, status, join code. |
| `POST /v1/admin/leagues` | Creates league, captain membership, first season and season memberships in one transaction. Body: name, slug, timezone, competition id, season name, members `[{ fullName, displayName }]`, captain display name, captain email reservation (may be the admin's own address), optional emblem preset and accent colour. This is `bootstrap.bootstrap` refactored into `service.create_league` and shared with the CLI. |
| `PATCH /v1/admin/leagues/{id}` | Rename, change timezone, archive or restore. |
| `POST /v1/admin/leagues/{id}/captain` | Appoints a claimed, active membership as captain. Direct appointment replaces the plan's accept-a-transfer flow (M27) for now; the feed and audit record the change. |
| `POST /v1/admin/leagues/{id}/members/me` | Adds the admin as a member outside the active season, with a display name they choose. Idempotent. |

Everything the admin does writes an audit event with `actor_label = 'admin'` and, when
they hold a membership, `actor_membership_id`.

### Actor

`Actor` gains `competition: Competition` (resolved from the season's `competition_id`),
`league_slug`, `league_timezone`, `is_admin`, `administers` (`is_captain or is_admin`),
`favourite_team_id` (from the membership) and an optional `membership_id`. Round
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

`Competition` carries: `id`, `name`, `short_name`, `schedule` (loaded lazily, one per
competition, replacing the `lru_cache` singleton), `clubs`, `stadiums`, `regular_rounds`,
`last_round`, `round_label(n)`, `first_kickoff(n)`, and three providers behind Protocols:
`ScoresProvider`, `TeamsheetsProvider`, `FallbackScoresProvider` (weather stays generic).
Rugby is fixed, so shirts 1 to 15 as starters, the pitch drawing and the scoring timeline
stay shared code. `MatchCentreService` takes a `Competition` instead of settings.
Snapshot keys become `{competition_id}:scores:round:{n}` and so on.

This is the minimum that lets a second rugby competition be added as one new folder. It
does not build a second competition.

### Storage

- Evidence: unchanged.
- Avatars: unchanged (`avatars/{user_id}/`).
- Emblems: a public bucket `emblems` with objects at `{league_id}/{token}.png`, because an
  emblem is not member data and the switcher fetches one per league on every load. The
  browser resizes to 512 px and uploads with an API-issued grant like profile photos.
  Presets ship as static web assets under `assets/images/emblems/` and are stored as
  `preset:<key>`.

### Agent

`preview_dispatches` and the dispatch payload gain `competition_id`. The agent's
allow-list, instructions and researcher wording move under a per-competition folder so a
second competition adds one folder. Nothing else in the agent changes in phase 2.

## 5. Web app

### League context

- `LeagueContext` service (`core/league/league-context.ts`): signals `leagues`
  (from `GET /v1/me`), `current` (a `LeagueSummary`), `competition` (from the registry by
  `current.competition.id`), `isAdmin`, `isMemberOfCurrent`. Everything that reads
  `HttpLeagueData.leagueName` or `CompetitionService` today reads these instead.
- `HttpLeagueData` becomes a per-league store: `select(leagueId)` clears the records and
  reloads against `${apiUrl}/v1/leagues/${id}`. `ensureLoaded` stays.
- `CompetitionService` becomes a registry (`core/competition/registry.ts`) returning a
  `Competition` per id: `{ id, name, shortName, schedule, rounds, regularRounds, teams,
  stadiums, banners, countries, assets: { ball, emblem } }`. `RoundViewService`,
  `NotificationsService`, the shell, the match page and `LiveScoresService` take the
  current competition from `LeagueContext`. The display timezone comes from
  `leagues.timezone` (already in the model) and replaces the hard-coded SAST strings.
- `ProfileStore` validates the favourite team against the current competition's teams
  and saves through the league-scoped `me/profile` route. The profile page shows one
  favourite team per league; the photo stays account-wide.
- localStorage keys used by the sample and empty builds gain the league id.
- The sample build ships two sample leagues (both URC, different captains) so the
  switcher, the admin view and "not a member here" states can be developed and tested
  without an API.

### Routes

The league slug prefixes every league page: `/:league/`, `/:league/standings`,
`/:league/duties`, `/:league/match/:id`, `/:league/more`, and so on. The current routes
move under the prefix unchanged. Account-level routes stay bare: `/sign-in`, `/welcome`,
`/profile`, `/join/:code`, `/manage` (admin). `/` redirects to the last-used league,
to the league picker when there are several and no last-used one, or to a "no league yet"
page with a join-code field when there are none. Reason: bookmarks, refresh, back button
and links shared between members must all land in the right league. A `leagueRequired`
guard resolves the slug against `LeagueContext.leagues` and redirects to `/` when the
account is neither a member of it nor the admin.

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
   For the admin the list is grouped as "Your leagues" and "All leagues", the second group
   marked "Admin view" where they hold no membership.
2. "Join a league" (opens the join-code field).
3. "Manage leagues", shown only when `isAdmin`.

Choosing a league navigates to the same page path under the new slug when that page
exists for the league, else to its home. With one league the button still opens the
sheet, so joining is discoverable. The product wordmark moves to the sign-in page, the
footer and the More page. Eyebrows such as "PIELE / CAPTAIN'S DESK" show the current
league's name.

In a league where the admin holds no membership, the shell shows an "Admin view, not a
member" ribbon; personal cards (my duty, my standing) are hidden; captain actions are
enabled; attributed actions prompt to add themselves first.

### Emblem

The captain or admin sets the emblem from the captain's desk: a preset gallery (a set of
crests in the Floodlights style) or an upload that the browser resizes to 512 px. Default
when none is set: a monogram of the league's initials on the accent colour, reusing the
member monogram treatment.

### Joining

- `/join/:code`: shows the league's name and emblem and its unclaimed names, then the same
  two-tap claim as today. Sign-in first if needed, then return to the code.
- The captain's desk shows the join link with copy and rotate. Reservation by email keeps
  working per league.
- The existing `/claim` page becomes the join page for a specific league instead of an
  unscoped list.

### Management centre (`/manage`, admin only)

- League list with member counts, competition, captain, status, join code and "Open"
  (switches to it) and "Add me" (creates the out-of-season membership).
- Create league: name, slug (derived, editable), timezone, competition (from the registry),
  season name, captain (a member name plus reserved email, or "me"), members pasted one
  per line as "Full name, Superbru name", emblem preset, accent colour. One request, one
  transaction.
- Appoint captain: pick a claimed, active member.
- Archive and restore.
- The route is guarded client-side by `isAdmin` for navigation only; the API decides.

## 6. Renaming the product

"Piele" stays as the league's name. The product becomes The Pavilion.

| Item | New value | Notes |
| --- | --- | --- |
| GitHub repo `VictorDercksen/piele` | `VictorDercksen/pavilion` | GitHub redirects the old URL. Re-check the Vercel git link, the Supabase GitHub integration branch mapping and this project's Claude Code repository scope afterwards. |
| Vercel projects | `pavilion-web`, `pavilion-api`, `pavilion-agent` | Renaming changes the default `*.vercel.app` URLs, so `ALLOWED_ORIGINS`, `PIELE_API_URL`, the agent's API URL and the Supabase Auth redirect allowlist change in the same release. Adding custom domains at the same time avoids doing this twice. |
| Supabase projects | `pavilion-staging`, `pavilion-production` | Cosmetic. Project refs, connection strings and keys do not change. |
| `angular.json` project, `package.json` names, `pyproject.toml` name, output folder | `pavilion-web`, `pavilion-api`, `pavilion-agent`, `dist/pavilion-web/browser` | `vercel.json` `outputDirectory` follows. |
| Title, boot wordmark, route titles, aria-labels | "The Pavilion", `THE PAVILION`, "Standings · The Pavilion" | Product name where it means the app. |
| Eyebrows, footer, notifications caption | Current league's name | "PIELE / CAPTAIN'S DESK" stays exactly that inside the Piele league and reads "<league> / CAPTAIN'S DESK" elsewhere. |
| Preview wording ("Piele preview", "the Piele agent") | "Pavilion preview", "the Pavilion agent" | The preview is competition data shared by every league. |
| localStorage keys | `pavilion-profile-v1`, `pavilion-notifications-read-v2` | Read the old key once, write the new one. |
| Environment variable prefix `PIELE_*` | Keep for now | Renaming means re-entering every Vercel variable in both environments and the agent, for a working name. Revisit when the name is final. |
| Database schema `piele`, role `piele_api`, storage bucket `evidence` | Keep | Renaming a schema and role under row level security on a live database has no product benefit and real risk. |
| Crest asset `piele-crest.png` | Becomes the Piele league's emblem preset | The product gets its own mark for the sign-in page and favicon. |

## 7. Phasing

Each phase ships on its own and keeps today's single-league behaviour for members.

1. Rename to The Pavilion. Own PR, no behaviour change. First, so later phases do not
   rename files they add.
2. Foundation. Migration in section 3, competition registry on both sides, league in the
   API path, `GET /v1/me` as the account view, membership-level team and read state, fix
   the cross-league unclaimed exposure, league slug in web routes with `/` redirecting,
   admin flag and `steward_dependency`. One league in production still; members notice
   only the URL prefix.
3. Switcher, emblem, join code and join page.
4. Management centre: create league, appoint captain, add me, archive. Set `is_admin` on
   your account by SQL in production.
5. Second rugby competition, when one is chosen: providers behind the Protocols, the
   agent's per-competition folder, web assets per competition, competition-scoped live
   polling.

## 8. Tests to add

- API: one account bootstrapped into two leagues; each league's `me`, standings and feed
  differ; a request for a league the account is not in returns 403 `not_a_member`.
- API: the admin reads a league they are not in; an attributed write returns 409
  `admin_not_a_member`; after `members/me` the same write succeeds and the audit row
  carries `actor_label = 'admin'`.
- API: unclaimed names are visible only through a valid join code and only for that league.
- API: `admin_dependency` rejects captains; `create_league` writes an audit event and
  the league's first feed entry; the CLI and the endpoint produce identical rows;
  appointing a captain updates `captain_membership_id` and refuses an unclaimed name.
- Database: cross-league reads under `leagues_member` return only the caller's leagues;
  `leagues_admin` returns all; the `invited_email` clause exposes exactly the reserved row.
- Web: switcher lists leagues and navigates to the same page under the new slug; the admin
  sees both groups; `/` redirects by last-used league; the join page claims a name for the
  coded league only; `/manage` is hidden for non-admins.
- E2E: two sample leagues in the development build, switch and check the feed changes.

## 9. Still open

1. Custom domains for the web and API at the rename, or keep `*.vercel.app` for now.
2. Whether the admin's out-of-season membership should be hidden from other members'
   team sheet entirely, or shown as "not in this season" as proposed.
3. Which rugby competition comes second, which decides the first provider implementation
   beyond the URC.
