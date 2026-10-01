# Home page: the round's picks along its kickoffs

Recorded on 2026-10-01 in Africa/Johannesburg time. Branch `claude/home-kickoff-ruler`, from `master` at `6367867`.

## Request

Show on the Home page of a round which Superbru picks the member has made and which are outstanding, without adding a section. Five visual options were mocked up as artifacts; the user chose the hero tally and the kickoff ladder, and from four permutations of those two chose the kickoff ruler: the hero footer lays one dot per fixture along the round's kickoffs.

## Changes

1. **Kickoff ruler view** (`features/home/match-hero/kickoff-ruler.ts`, `.models.ts`). A pure `kickoffRuler(fixtures, myPick, competition, now, zone)`:
   - groups the round's fixtures by kickoff, in kickoff order; fixtures without a kickoff share a trailing `TBC` slot that never locks;
   - gives each fixture a dot: `picked` with the picked club's colour and crest (a draw has neither), `open` while the kickoff is ahead of `now`, `missed` once it has passed without a pick or when Superbru recorded no pick;
   - counts picks in, to make and missed, and places the "now" pin after every slot whose kickoff has passed;
   - returns null for a round without fixtures.
2. **Match hero** (`match-hero.html`, `.ts`, `.scss`). A `ruler` input, null by default so the match page's hero is unchanged. With one, the footer gains a label (`YOUR PICKS · 5 OF 8 IN · 3 TO MAKE`, `· 1 MISSED` once a kickoff passes) and the ruler: a coral "now" pin, one slot per kickoff with its weekday and time, and a dot per fixture. Picked dots wear the club's crest on its colour, open dots are coral dashed rings, missed dots muted rings, a draw a chalk `D`. Each dot is a link to its match page that preserves the `round` query parameter, with the fixture and pick as its accessible name and tooltip. Slots with an open pick and the pin are coral. Below 750 px of container width the footer stacks venue, ruler and button; the ruler scrolls sideways where it does not fit (320 px), so the page never widens.
3. **Home page** (`home.page.ts`, `.html`). A computed `ruler` from `FixtureService.fixtures()`, `PickService.myPickFor`, `CompetitionService.current()`, `LiveScoresService.clock()` and `LeagueTime.zone()`, passed to the hero. An admin viewing without membership (`MemberService.memberId()` null) gets no ruler.
4. **README**: the home page sentence names the ruler.

## Files

- `apps/web/src/app/features/home/match-hero/kickoff-ruler.ts`, `kickoff-ruler.models.ts`, `kickoff-ruler.spec.ts` (new)
- `apps/web/src/app/features/home/match-hero/match-hero.html`, `match-hero.ts`, `match-hero.scss`
- `apps/web/src/app/features/home/home.page.ts`, `home.page.html`
- `apps/web/e2e/superbru.spec.ts` (new journey), `apps/web/e2e/profile-and-layout.spec.ts` (ruler visible at every width)
- `README.md`

## Checks

Run from `apps/web` with Node 24.21.0 (the container's Node 22.22.0 is below the CLI's minimum, so a Node 24 tarball was used from a scratch directory).

- `npm run build`: passes, no warnings.
- `npm test -- --watch=false`: 124 files, 623 tests pass (4 new in `kickoff-ruler.spec.ts`).
- `npx playwright test e2e/superbru.spec.ts e2e/profile-and-layout.spec.ts e2e/match-centre.spec.ts e2e/live-scoring.spec.ts e2e/club-names.spec.ts e2e/stadium-backgrounds.spec.ts` with the container's Chromium 1194 as `executablePath` (Playwright 1.63 wants revision 1243, which is not installed): 28 tests pass, including the new journey.
- Screenshots of the hero at 1440, 800, 390 and 320 px were inspected; no horizontal page overflow at any width.
- `npm run test:e2e:production`, the API and agent suites were not run: nothing outside the web app changed.

## Unresolved

- The first stacked layout gave the ruler a 340 px height (flex basis on the column axis); fixed with `flex: none` below 750 px. Worth a look on a real phone.
- The ruler's weekday formatter is a small module-level cache in `kickoff-ruler.ts` rather than `LeagueTime`, which has no weekday-only pattern.

## Next steps

- Permutation 3 (the ladder as a drawer under the ruler) can be added later without changing the ruler.
- The plan does not describe the Home page's pick tally; add a line when the plan is next revised.
