# Picks: one per account, competition and fixture

Recorded in Africa/Johannesburg time. Branch `claude/universal-competition-picks`, from `master` at `c0e667b`.

## Request

"Picks for the same type of competition should be universal for all leagues." A member of several leagues on one competition makes one pick per match on Superbru, so every league of theirs on that competition now reads the same pick.

## Changes

1. **Migration `20261002090000_universal_picks.sql`.** `piele.picks` is rebuilt. A pick belongs to an account (`user_id`), or to an unclaimed name (`membership_id`, `league_id`) until the name is claimed. It is keyed by `competition_id` and `fixture_id`. Legacy rows are copied; where two leagues held a pick for one account and fixture, the most recently updated wins. Duty links move to the new league-local `piele.pick_duty_links`. Row level security: the account's own picks in any context, the push job, and inside a league context the picks of its names and of its members' accounts.
2. **API (`app/league/service.py`, `tables.py`).** Reads join picks to the league's enrolled members by account or name, on the season's competition. Saves take an advisory lock per owner, competition and fixture. A claim moves the name's picks to the account, and the account's own pick wins on a clash. A release copies the account's picks on the league's competition back to the name. Audit events stay in the league where the change was made. The API contract is unchanged, so the web app needs no change.
3. **Push (`app/push/job.py`).** A member who picked in another league on the same competition gets no reminder.
4. **Tests.** `test_league.py`: the league-isolation test is split; new tests cover sharing between leagues, claim merging and release. `test_push.py`: a pick in another league stops the reminder. `test_database.py`: the picks constraint and row level security tests match the new table.
5. **Docs.** README, `apps/api/CLAUDE.md`, `apps/api/README.md`, and a decision row in `docs/multi-league-architecture.md`.

## Checks run

- Local PostgreSQL 16 with every migration applied from scratch, then `uv --directory apps/api run pytest -q` with `PIELE_TEST_DATABASE_URL`: 375 passed. Baseline before the change: 371 passed.
- Migration data copy, checked on a scratch database with legacy rows: a two-league collision kept the newer pick, the unclaimed name's pick stayed league-local, both duty links were copied, and the legacy table was dropped. Row level security showed league B only its members' picks and no rows without a context.

## Unresolved

- Between the migration and the API deploy, the previous API's picks routes fail. Deploy the API right after Supabase applies the migration.
- Season rules stay per league. A default pick recorded in a league that allows defaults is also read by a league that does not.
- A pick confirmation duty in one league records a `missed` pick on the account when there is none, and the member's other leagues read it.
- A release copies all of the account's picks on the competition to the name, including those made through another league.

## Next steps

- Optional: tell the member in the pick form that the pick is shared with their other leagues on the competition. The API would need to report those leagues.

## Pool hidden until kickoff

### Request

"Other players' picks shouldn't be visible for any fixtures before kickoff." The match page showed "You're the first in. The pool's picks show here as the others make theirs, and at kickoff." under the member's own pick. A follow-up from the user: admins and captains must not see them before kickoff either.

### Changes

1. **API (`app/league/service.py`, `app/routers/league.py`).** `_fixture_views` shows `picks` only once the fixture is locked. Before kickoff `picks` is empty for everyone: members, the captain, and the admin with or without a membership. `myPick` still carries the caller's own pick. The steward routes still record and delete picks at any time, and their responses follow the same rule. `picksHiddenBeforeKickoff` stays stored but is informational; its comment says the pool is always hidden before kickoff. The response shape is unchanged. `generated.ts` was regenerated with `npm run generate:api`; only the `record_picks` docstring changed.
2. **Chat (`app/chat/context.py`, `app/chat/service.py`).** `POOL_HIDDEN` is now "The other members' picks are hidden until kickoff." The model gets the pool only once the fixture is locked. The chat closes at kickoff, so in practice the model sees only the member's own pick.
3. **Web.** `PickService.picksFor`: `hidden` is `!locked`, and before kickoff the rows hold only the member's own pick. The sample data mirrors the API (`picks` empty before kickoff). In the match page's picks panel, `poolOfOne` and the form's "Make your pick to see the pool's picks." note are removed. Before kickoff the card shows the member's form or strip, or nothing for the admin view, then one muted `.pool-note` line with the users icon: "The pool's picks show here at kickoff." It has no table, split, chevron or legend. On the captain's desk, the picks card shows no grid before kickoff, only the note "Members make their own picks until kickoff. Their picks show here at kickoff, when you can record or correct them." The `picksHiddenBeforeKickoff` hint in the rules form now says the pool's picks always show at kickoff here.
4. **Tests.** API: `test_league.py` checks the following. Before kickoff a member with a pick, the captain and the membership-less admin all get an empty pool, as does a steward-route response. From kickoff (`KICKED_OFF`, helper `view_at_kickoff`) everyone gets the full pool, the admin included. The cross-league, release and withdrawal tests read the pool at kickoff. `test_chat.py`: the pool stays out of the model's context before kickoff, even after the member has picked. Web specs cover the pick service, the sample data, the picks panel and the picks card. The e2e test `superbru.spec.ts` asserts the new line, and a new test checks that the captain's desk shows no picks before kickoff.
5. **Docs.** README, `apps/api/README.md`, `apps/api/CLAUDE.md`, `apps/web/CLAUDE.md`.
6. **Picks reload at kickoff.** Before this change, a page left open across a kickoff showed the fixture locked with an empty pool until the picks were read again. This affected the match page, the captain's desk and the home page.
   - `HttpLeagueData` now sets a timer for the next loaded fixture still sent as open. It fires `KICKOFF_DELAY_MS` (2 s) after that fixture's kickoff and reads `GET /picks` once for every fixture that has kicked off since the last read.
   - Each fixture's kickoff causes at most one read per league. An API whose clock lags does not cause a loop.
   - A read already in flight is not doubled. A failed read is tried again after `SETTLE_RETRY_MS`.
   - While the tab is hidden the timer does nothing. Coming back to the tab does the read, beside the existing check for closed voting windows.
   - Delays past `setTimeout`'s limit are waited for in steps.
   - The timer is cleared on `clear()` (league change, sign-out) and on destroy.
   - `SampleLeagueData` reads the showing league again at the next open kickoff (an effect with a timer), so the sample build behaves the same.
   - Tests: `http-league-data.spec.ts` covers two fixtures kicking off together (one read), none before kickoff plus the delay, and none afterwards. It also covers a kickoff during a hidden tab (one read on two `visibilitychange` events) and a lagging API answer that causes no second read. `sample-league-data.spec.ts` checks that the pool shows at kickoff without a manual reload.

### Checks run

- `uv --directory apps/api run pytest -q` against the local PostgreSQL: 373 passed, 2 skipped. The 2 skips are `test_updates.py` round 1 milestones already recorded in the reused database. The number of tests is unchanged. Ruff reports no new findings in the changed files.
- `npx ng test --watch=false` (Node 24.21): 124 files, 628 tests passed, after the kickoff reload. The new HTTP test fails when the timer scheduling is removed.
- `npm run build`: succeeded.
- `npx playwright test e2e/superbru.spec.ts` (Chromium at `/opt/pw-browsers/chromium`): 8 passed.
- The picks panel at 390 px wide, before kickoff, was checked in a screenshot after saving a pick: the strip and the single line.
