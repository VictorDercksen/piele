# Notifications panel rework

Branch `claude/notifications-panel-rework-5ji5s7`.

## Request

Rework the notifications flag: drop the round status card with its "Open the match centre" link; show the round's transaction log plus competition updates (kick-offs, results, teamsheets, previews); remember what the member has read so nothing is shown as new twice, using an established pattern; keep a "mark all read" control; plan first and ask. Decisions taken by the user in the planning round: the panel follows the current round only (with a fix for rounds whose fixtures overlap); the favourite team's match and the featured match get their own lines while the rest fold into one line per kind; the badge stays until an item is followed or "Mark all read" is pressed; read state lives server-side; the member's duty and the round's poll stay pinned; only kick-off and full time count as match events (no half time); the polling cadence was left to the implementation.

## Completed

### Read state: high-water mark plus exception keys

Per account, like the favourite team: `piele.users.notifications_read_at` (everything at or before it is read) and `notifications_read_keys` (items read individually above the mark, at most 200 keys of 120 characters). "Mark all read" is one write that moves the mark and clears the keys; unread is a timestamp comparison. `PUT /v1/me/notifications` merges: the mark never moves back (a stale device cannot undo another's reads), never runs ahead of the server clock, and keys from both sides are kept newest first. `GET /v1/me` returns `notificationsReadAt` and `notificationsReadKeys`. Builds without the API keep the same shape in `localStorage` under `piele-notifications-read-v2`.

### Competition events: `GET /v1/rounds/{round}/updates`

Members only. Returns the round's `teamsheets_published`, `preview_published` (with revision), `kicked_off` (at the kickoff time, once the score feed shows the match under way or finished) and `full_time` (with the score) events in time order, from the match centre's cached snapshots, the stored previews and a new append-only table `piele.fixture_milestones` (first time the API saw the teamsheets published or full time, with the score). Snapshot times move as caches expire; the milestone times do not, which the watermark relies on. Teamsheets are looked for from three days before kickoff to two days after; fixtures already milestoned are not asked again. The database tests run the whole flow against PostgreSQL with mocked providers.

### Web

- `core/league/notifications.service.ts`: builds the stream for the current round: league feed entries (`feedNotice`) and competition events (`competitionNotices`), newest first, capped at 40, with read state applied; pinned duty and poll (never counted); `markAllRead`, `markRead`, `refresh`. Followed rounds are the current one plus any other round with a fixture within seven days either way, and league entries from the last seven days stay whatever their round. Items from another round carry an `R08` style tag.
- `core/api/round-updates.service.ts`: fetches the followed rounds' events, keeps the last events when a refresh fails and exposes `stale`.
- `core/league/feed-presentation.ts`: the feed's icons, labels and target pages, now shared by the home feed and the panel, with `standings_recorded` labelled ("SUPERBRU TABLE").
- `LeagueData` gained `notificationsRead`, `saveNotificationsRead` and `refreshFeed` (feed-only fetch); `HttpLeagueData` adopts the merged read state from every `/me` response.
- `core/layout/notifications-flag`: round card removed; "Mark all read" always visible in the heading, disabled when nothing is unread; "New" and "Earlier" dividers when the read items are the tail; pinned duty and poll above the log; an empty state naming the next kick-off; a footer link to the full feed on the clubhouse page; a stale line when match updates could not be refreshed. Following an item marks only that item read and opens its page in the item's round.
- Polling: one 60-second tick in the service. The feed and the followed rounds' events refresh together every 10 minutes while the tab is visible, every 2 minutes while a followed match is inside its play window (15 minutes before kickoff to 3 hours after), and on return to the tab when the last refresh is older than 2 minutes. Hidden tabs never poll. The round-updates request adds no provider calls beyond what the match pages make, so the cost is one small API call per followed round per refresh.
- `angular.json`: the initial bundle warning budget moved from 650 kB to 700 kB; the shell grew by the notifications service (650.57 kB after this change).

### Overlapping rounds

The published schedule has one overlap: Round 8 has a fixture on 21 February 2027, after Rounds 9 to 11 (its other seven are on 26 and 27 December 2026). `currentRoundId` picks the round of the next kickoff, so between 30 January and 21 February the app treats Round 8 as current again. The panel's seven-day window covers this: on 21 February it follows Round 8 and Round 12 (26 February), and the week after any weekend it still shows the previous round's results and duties while the next round is current. No change was made to `currentRoundId` itself.

## Files

API: `supabase/migrations/20260926130000_notifications.sql`, `apps/api/app/matchcentre/milestones.py`, `apps/api/app/matchcentre/updates.py`, `apps/api/app/routers/matches.py`, `apps/api/app/routers/league.py`, `apps/api/app/league/service.py`, `apps/api/app/league/tables.py`, `apps/api/tests/test_updates.py`, `apps/api/README.md`.

Web: `src/app/core/league/notifications.service.ts` (+ spec), `notifications-read.ts`, `feed-presentation.ts`, `league-data.ts`, `league.models.ts`, `http-league-data.ts`, `sample-league-data.ts`, `src/app/core/api/round-updates.service.ts`, `match-centre.models.ts`, `src/app/core/layout/notifications-flag/*`, `src/app/features/home/feed/feed.ts`, `angular.json`. Root `README.md`.

## Checks run

- `uv run pytest` in `apps/api` with `PIELE_TEST_DATABASE_URL` against a local PostgreSQL 16 with every migration applied as in CI: 116 passed (including 5 new database tests and 3 new unit tests).
- `npx ng test --watch=false` in `apps/web` with Node 24.15: 23 files, 85 tests passed (8 new).
- `npx ng build`: complete, no warnings after the budget change.
- Prettier on the new and rewritten web files. `http-league-data.ts` and `sample-league-data.ts` were not Prettier-clean before this change and were left as they were apart from the edits.
- `ruff check` is not configured for the API; its 16 findings are all pre-existing and in untouched code.
- `npx playwright test` in `apps/web`: 25 passed. The pinned Playwright 1.63 build's headless shell is not installed in this container, so the run used a session-only config pointing `launchOptions.executablePath` at the preinstalled Chromium; that file was not committed.
- Screenshots of the open panel in the sample build at 1440 px and 360 px (Playwright script, not committed): pinned duty and poll, "New" divider, tags with the round label and relative time, the textured buttons readable on the spoon-duty timber, footer link clear of the flag's corner stripes.
- Database tests that write `fixture_milestones` skip themselves when the database already holds Round 1's milestones (the table is global and append-only, and `piele_api` cannot delete). CI's database is empty, so they run there; a rerun on the same local database skips two tests and says why.

## Not done / next steps

- The web shell's `ng` CLI needs Node 22.22.3 or newer; the container had 22.22.2, so Node 24.15 was downloaded for the checks. Nothing in the repository changed for this.
- The API does not emit feed entries for poll events or captain notes yet (`poll_opened`, `poll_closed`, `captain_note` exist only in the sample league), so the panel shows the current round's poll only as the pinned line.
- No half-time event, by decision. A preview rewrite (new revision) would appear as a new line because the key carries the revision.
- Consider a per-item "mark read" for items without a link; the panel has one for such items but the feed currently gives every kind a page.
