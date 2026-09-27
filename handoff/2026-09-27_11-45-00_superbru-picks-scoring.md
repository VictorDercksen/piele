# Superbru picks, scoring and standings

Branch `claude/superbru-scoring-standings-ovbqhv`, six feature commits on top of master's
`539197d` (`0c62e64` API, `deee2f7` scoring core, `8431787` standings, `d25b778` picks panel,
`2c4a4f5` captain and manage cards, `28503a3` docs and end-to-end specs). Pull request #41 is
open. This pass fixed the six inline review comments on PR #41, committed with this handoff.

## Request

Bring Piele's Superbru pool into The Pavilion: members record their picks in the app, the app
scores them with Superbru's rules, and the round and season tables, badges and overrides follow
from those picks. Then address the PR #41 review (six comments) and write this handoff.

## Product decisions (from the owner)

- Every member records their own pick per fixture (home, away or draw, and a margin from 1 to
  150, signed from the home side) **before that fixture's kickoff**. After kickoff a member's
  pick cannot change.
- A member sees the rest of the pool's picks for a fixture only once their own pick is in, or
  once the fixture has kicked off. The admin without a membership always sees them.
- The captain or admin (the steward) records or corrects any member's pick from kickoff, marks
  Superbru default picks and records missed picks.
- Scoring lives on the frontend in one pure module (`superbru.ts`); the API never scores.
  - WP for the correct outcome by round type (regular 1, quarter-final 1.5, semi-final 2,
    final 3).
  - MP 0.5 when the pick is within 5 points of the actual margin, independent of WP.
  - BP 1 to the closest correct picks within 15 points. With the split rule, tied picks share
    it, but no share goes below 0.25 (five tied get 0.25 each, not 0.2). Without the split rule,
    each tied pick gets the full point.
  - GSP 2 for a complete regular round picked correctly throughout without default or missed
    picks. There is no GSP in knockout rounds.
  - A default pick earns WP only. A missed pick earns nothing.
  - Live and half time are provisional, full time is final, and postponed or cancelled
    fixtures are void.
- Rules are set per season. The steward can edit them, and they are set when a league is
  created. The defaults are Piele's. The rules are the five switches (default picks, picks
  hidden before kickoff (informational only), bonus point, split, range cap), the starting
  round, the win points by round type, the other numbers, and last season's champion.
- `round_standings` becomes an override table: a stored total replaces the derived one for
  that member and round. It shows as an override only where it differs from the derived total.
- Badges appear only once every fixture of the round is final:
  - a yellow cap for the round winners;
  - a spoon for **everyone** on the lowest points;
  - a crown for last season's champion. The season table shows the latest complete round's
    cap and spoon.
- Superbru tie order: points, then higher WP, then higher MP, then lower total distance, then
  a shared rank (1, 2, 2, 4) listed by name.
- A pick confirmation duty may link the picks it covers (`dutyId` on a pick).

## Completed

### Database

- Migration `supabase/migrations/20260927110000_picks_and_rules.sql` adds:
  - `piele.picks`, one per season membership and fixture, with side, margin, default flag, an
    optional duty link, recorded-by and version, checks, league-scoped foreign keys and an RLS
    policy;
  - `seasons.rules` (jsonb holding only the keys that differ from the defaults);
  - `seasons.previous_champion_membership_id`.
- **Not applied to any database.**

### API (`apps/api`, all under `/v1/leagues/{leagueId}`)

- `GET /picks` returns every fixture from the starting round with a known kickoff: whether it
  is locked, the stored result, `myPick`, and the pool's picks under the visibility rule.
- Picks:
  - `PUT /matches/{id}/picks/me` saves the member's own pick. It returns 422 `picks_locked` from
    kickoff and 409 `admin_not_a_member` for the admin without a membership.
  - `PUT /matches/{id}/picks` lets the steward record the listed members' picks. An omitted
    `dutyId` keeps the existing link and `null` unlinks it.
  - `DELETE /matches/{id}/picks/{memberId}` removes a pick.
- Rules: `GET /rules`, and `PUT /rules` for the steward (only the changed keys). The feed gains
  `rules_updated`.
- Standings: `DELETE /rounds/{n}/standings/{memberId}` clears one override.
  `PUT /rounds/{n}/standings` accepts only members enrolled in the season.
- `rules` appears on the league-scoped `GET /me`, the account's `LeagueSummary` and
  `AdminLeague`. Admin create and `PATCH` of a league accept `rules`.
- Duties carry `pickFixtureIds`. `POST /duties` links those picks for a pick confirmation duty,
  creating missed picks where none exist.

### Scoring core (`apps/web/src/app/core/league/superbru.ts`)

- `DEFAULT_RULES` and `withDefaultRules`.
- `roundType`, `signedMargin`, `isScored`/`isFinal`/`isVoided`.
- `scoreFixture`, `orderPicks`, `sway` and `rankRows`.
- `roundTable` (GSP, recorded overrides, `sameTotal`), `roundBadges` and `seasonTable`.
- `badges.ts` holds `BADGES` (cap, spoon, crown with their alt text).

### Data providers

- `LeagueData` gains `picks`, `rules`, `savePick`, `recordPicks`, `removePick`, `saveRules`,
  `recordStandings` and `clearStanding`.
- `HttpLeagueData` loads picks with the league and takes the rules from `me`.
- `SampleLeagueData` scores the sample leagues and refuses writes the way the API does:
  - `sampleResults` for rounds 1 and 2;
  - Piele's picks, with Arno's defaults and Liam's missed picks under duties;
  - Johan as champion;
  - the Pofadder Bowl with round 1 picks and round 2 totals recorded only.

### `RoundViewService`

- `rules` and `picksFor(fixtureId)` (state, rows in pick order with marks and points, `sway`,
  `myPlace`).
- `myPickFor`, `roundTable`, `seasonStandings`, `roundBadges`, `roundProvisional`,
  `derivedVsRecorded` and `standings` (the home board).

### Picks panel (`features/match/picks-panel`, "Pool picks.")

- Before kickoff without a pick, only the member's form: jerseys and Draw as a radiogroup, a
  margin field and "Save pick".
- With a pick in: "Your pick" with "Edit your pick", the pool's split bar and the pool table.
- From kickoff: W, M and B rings (brass when earned), points and "{2nd of 12} in this match".
- A status tag, a steward link to record picks and the rules line.
- `pick-chip` is the shared chip.

### Standings (`features/standings`)

- Round, Season and House marks tabs, kept in `?table=`.
- Status tag, crown, cap and spoon beside names, and an "override" tag.
- "Show breakdown" (kept in `localStorage`): WP, MP, GSP and BP columns, a legend and a stacked
  bar.

### Home

- The pecking order uses the derived round table: a provisional tag while a match is live, and
  the cap and spoon.
- A season line links to `/standings?table=season`.

### Captain's desk

- `picks-card` (`#picks`):
  - a strip of the round's fixtures with each one's state;
  - a grid of every in-season member's side, margin, Default and Missed, read-only before
    kickoff and sending only changed rows;
  - W · M · B · Pts once scored;
  - Derived against Recorded with an inline Override and a confirmed Clear;
  - a "Propose Spoon duty" button per spoon holder.
- `rules-card` edits the season's rules through `shared/rules-fields` and `rules-form.ts`.

### Manage

- The create-league form has a collapsed "Superbru rules" group that sends only the rules that
  differ from the defaults.
- The rename form on each league card has its own rules group, sent as `rules` in the `PATCH`.

### Duty links

- The create-duty dialog lists "Picks it covers" for a pick confirmation duty: kicked-off
  fixtures where the member has no pick, a missed pick or a default pick.
- The duty card lists "Picks covered:" as links to those match pages.

### Assets and docs

- `public/assets/images/badges/{cap,spoon,crown}.webp` at 256 px, from the owner's artwork.
- `apps/web/CLAUDE.md` documents the feature.

## Review fixes in this pass (PR #41)

1. **Rules card lost unsaved edits** (`features/captain/rules-card/rules-card.ts`):
   - The form now resets from a `baseline` computed that compares the rules by value
     (`rulesChange` is empty and the round bound is the same). Re-adopting `me` after an
     appearance or profile save no longer wipes unsaved edits.
   - `dirty` now reads `form.events`, so `markAsPristine()` on the unchanged-save path hides
     "Undo changes".
2. **Stale picks after a new starting round** (`core/league/http-league-data.ts`):
   `saveRules` reloads `GET /picks` alongside the feed when the change includes `startingRound`.
3. **Duty link lost on omission**:
   - `HttpLeagueData.recordPicks` sends `dutyId` only when it is defined, so omitted keeps the
     link and `null` unlinks.
   - `SampleLeagueData.recordPicks` now does the same. Before, it cleared the link when
     `dutyId` was omitted.
4. **Hard-coded 18 rounds** in `features/manage/league-card/league-card.ts` and
   `create-league-form/create-league-form.ts`:
   - The constant and the registry lookup are gone.
   - The league card loads `AdminService.competitions()` when the rename form opens (one cached
     request for all cards). Until the list arrives, the bound is the league's saved starting
     round, which is never looser. An effect applies the real bound when the list arrives.
   - The create form's `lastRound` is computed from the chosen competition's `regularRounds`.
     Until the list arrives, it is the default starting round.
5. **Override button for members outside the season** (`core/league/round-view.service.ts`):
   `derivedVsRecorded` keeps only `inSeason` members, the only ones `record_standings` accepts.
6. **Row subscriptions kept alive** (`features/captain/picks-card/picks-card.ts`): the row
   listeners live in one `Subscription` that `build()` unsubscribes and replaces before
   rebuilding, and that is unsubscribed on destroy. This replaces the per-row
   `takeUntilDestroyed`.

Tests added or changed:

- `rules-card.spec.ts`: same rules as a new object keep the edits; an unchanged save drops Undo.
- `http-league-data.spec.ts`: `dutyId` omitted, null and set; picks reload on a new starting
  round.
- `sample-league-data.spec.ts`: an omitted `dutyId` keeps the link and `null` clears it.
- New `league-card.spec.ts`: the bound comes from the admin list, with the fallback while
  loading.
- `create-league-form.spec.ts`: a 10-round competition bounds the starting round, and switching
  competition moves the bound.
- `round-view.service.spec.ts`: a member added outside the season is not on the override rows.
- `picks-card.spec.ts`: the old rows' listeners are dropped on rebuild and the new rows still
  react.

The rules-card and picks-card tests were confirmed to fail against the committed code.

## Files

- **Database:** `supabase/migrations/20260927110000_picks_and_rules.sql`
- **API:**
  - `apps/api/app/league/{service,tables,bootstrap}.py`
  - `apps/api/app/routers/{league,admin,account}.py`
  - `apps/api/app/matchcentre/service.py`
  - `apps/api/tests/{test_league,test_picks,test_database}.py`
- **Core:** `apps/web/src/app/core/league/`
  - `superbru.ts`, `badges.ts`, `league.models.ts`, `league-data.ts`
  - `http-league-data.ts`, `sample-league-data.ts`, `sample-leagues.ts`
  - `round-view.service.ts`, `admin.service.ts`, `admin.models.ts`, `feed-presentation.ts`
  - their specs
- **Features:** `apps/web/src/app/features/`
  - `match/picks-panel/*`
  - `standings/*`
  - `home/*`
  - `captain/{picks-card,rules-card}/*` and `captain/captain.page.*`
  - `duties/{create-duty-dialog,duty-card}/*`
  - `manage/{league-card,create-league-form}/*`
- **Shared:** `apps/web/src/app/shared/rules-fields/*`
- **Assets and tests:**
  - `apps/web/public/assets/images/badges/*.webp`
  - `apps/web/e2e/superbru.spec.ts`
  - `apps/web/CLAUDE.md`

## Checks run

The feature commit messages record no check counts. These were run in this pass, on the working
tree with the review fixes, from `apps/web` with Node 24
(`/root/.npm/_npx/387698761821791d/node_modules/node/bin`):

- `npm test -- --watch=false`: 42 files, 277 tests passed.
- `npm run build`: passed with no warnings.
- Playwright `e2e/superbru.spec.ts`, `e2e/manage.spec.ts` and `e2e/leagues.spec.ts`: 24 passed.
  They ran with a temporary config that points `executablePath` at `/opt/pw-browsers/chromium`
  on port 4317. The config was removed afterwards.
- API `uv run --frozen pytest -q`: 86 passed, 96 skipped (the database tests need PostgreSQL).
- API `uv run --frozen ruff check app tests`: 21 findings, all on lines from earlier commits
  (`E741`/`F841` in `service.py` from `77926b1`, `F811` fixture redefinitions in
  `test_agent.py` and `test_competitions.py`, `E741` in `test_league.py` from `aa95224`). None
  come from this feature.
- Not run: the full Playwright suite, `npm run test:e2e:production`, and the PostgreSQL-backed
  API tests.

## Next steps

- Commit the review fixes and push them to PR #41. Reply to the six review threads.
- Apply the migration with the deploy, before or together with the API release.
- Record round 1's picks, so the stored round 1 totals match the derived ones and stop
  showing as overrides. Check that the 12 members' totals match the Superbru screenshots in
  the spec.
- Set Annas as last season's champion on Piele's captain's desk (rules card).
- Members enter their round 2 picks in the app before each kickoff.
- There is no Superbru import. Picks are entered in the app, and totals from Superbru
  reprocessing go in as overrides.
