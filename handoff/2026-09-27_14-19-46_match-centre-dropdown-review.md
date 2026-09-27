# Match centre dropdowns: sticky bars exposed on close, and a page review

## Request

A screen recording (iPhone, Safari) showed "the whole top section exposed" when closing a
dropdown. Review every UI component on the match centre page end to end so none of these bugs
remain, and open a new PR.

## What the recording showed

Frames at 15 fps around the close of the pinned Scoring panel: the Scoring heading stayed in
place (the PR #45 fix works), but for about 0.6 s the top bar and the round context were not
drawn; the match hero ("Connacht vs Stormers", "Dexcom Stadium") showed where they should be.
Only the fixture ribbon (the one part of the round header on its own layer, through its
transform) stayed on top. This is iOS Safari mis-drawing the non-composited sticky bars while a
layout animation runs straight after a programmatic scroll. It cannot be reproduced in Chromium,
and no WebKit browser is available in this container.

## Completed

- `shared/dropdown/dropdown.ts`: when closing scrolls the page back to the heading, the body now
  goes at once instead of animating (no layout animation after the programmatic scroll);
  `scrollBy(0, dy)` replaces the options form; the pinned state is remeasured when an animation
  settles (a body can change the page's height without a scroll event).
- `shared/dropdown/dropdown.scss`, `core/layout/shell/shell.scss`: `transform: translateZ(0)` on
  the pinned heading row, the top bar and the round header, so Safari keeps them on their own
  layers. No `position: fixed` descendants exist under them, so containing blocks are unchanged.
- `features/match/match.page.ts`: another fixture (ribbon, pager) scrolls to the top. Its
  dropdowns reset per fixture, so the old scroll position otherwise landed near the page's end
  (measured 1074 px down without the fix).
- Review of the match page's components: scoring (peek, tap to open, keyboard summary), pool
  picks (lead form and split, pool body, chevron only when the pool shows), teamsheets, Pavilion
  preview (API builds only; unit tests), kickoff forecast (plain panel, no dropdown), hero and
  fixture switching. The dropdown bugs covered: closing from inside a body, sticky bars during a
  close, fixture switch while open, stale pinned state after an animation.
- e2e (`e2e/support.ts`): `dropdown(page, heading)`; `openSection` waits for the open animation;
  `expectClosesInPlace` samples the top bar, round header and heading every frame for 800 ms of
  the close. New test in `match-centre.spec.ts` runs Scoring, Pool picks and Teamsheets through
  open, pin and close at 390 px (with a full-time score mocked), then the fixture switch.
- `apps/web/CLAUDE.md` updated.

## Checks run (Node 24 via npx; Playwright with the preinstalled Chromium via a temporary config)

- `npm test -- --watch=false`: 43 files, 285 tests passed.
- `npm run build`: passed, no warnings.
- Playwright: all specs, repeated twice with 4 workers, 106 passed. The new test repeated 12
  times with 4 workers passed. Without the match page fix the new test fails (scrollY 1074).
- Before `openSection` waited for the animation, the new test and once the captain's picks test
  failed under load; both traced to acting on a body still animating open.

## Open

- The Safari fix (no animation after the scroll-back, own layers for the sticky bars) is not
  verified on a real iPhone here; check it on the preview deployment.
