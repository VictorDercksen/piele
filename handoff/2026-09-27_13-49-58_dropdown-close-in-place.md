# Closing a dropdown from the middle of its body

## Request

Closing an open dropdown while scrolled into the middle of it "feels very weird". Fix it in a
new PR.

## Cause (reproduced before fixing)

Team sheet open at 390 px, scrolled 500 px into its body, heading pinned at 147 px. On close,
the page kept its scroll position while the body collapsed: the heading jumped to -500 px (off
screen) and, the page now shorter than the scroll position, the round header was pulled out of
view (bottom at -182 px). The reader landed on unrelated content with nothing to orient by.

## Completed

- `shared/dropdown/dropdown.ts`: before closing, `returnToHeading()` measures where the heading
  rests in the page's flow (its row momentarily `position: static`) and, when that is above the
  pin line, scrolls the page by the difference at once. The heading stays exactly where it was
  on screen and the body folds up under it. Only the on-screen part of the body animates (the
  rest, below the fold, goes at once; never less than the `peek`).
- `dropdown.scss`: `overflow-anchor: none` on the body, so the browser does not re-anchor the
  scroll during the height animation.
- After the fix the same repro keeps the heading at 147 px and the round header in place for the
  whole close.
- e2e: `expectClosesInPlace(page, heading)` in `e2e/support.ts`; used for the team sheet
  (desktop and 390 px, the next section then in view) and the match centre's teamsheets (390 px).
- `apps/web/CLAUDE.md`: the Dropdowns paragraph describes the behaviour and the helper.

## Checks run (Node 24 via npx; Playwright with the preinstalled Chromium via a temporary config)

- `npm test -- --watch=false`: 43 files, 285 tests passed.
- `npm run build`: passed, no warnings.
- Playwright, all specs: 52 passed.

## Open

- Nothing known.

## Follow-up: CI failure on PR #45

- `web` failed in `match-centre.spec.ts` (hero test): `expectClosesInPlace` found the teamsheets
  heading 321 px lower after closing. The teamsheets are the last panel on the match page, so
  once their body folds away there is not enough page left below to keep the heading at the pin
  line; the browser pulls the scroll back and the heading slides down with the collapse, still
  in view (measured locally: 235 px to 649 px). The check had passed locally only because it read
  the position before the animation shrank the page.
- `e2e/support.ts`: `expectClosesInPlace` now waits for the close animation to finish, then
  requires the heading unmoved unless the page rests at its end, and in view either way.
- Checks: `match-centre.spec.ts` and `leagues.spec.ts` 17 passed; the two affected tests
  repeated four times each, 8 passed.
