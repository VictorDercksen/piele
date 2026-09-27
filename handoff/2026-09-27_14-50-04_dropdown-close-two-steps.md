# Dropdown close: scroll back first, fold at rest

## Request

A second iPhone recording (after PR #46) still showed the top bar and round context missing for
about half a second when a pinned dropdown closed, with the match hero drawn where they should
be. Check the parent components and anything else that could cause it.

## Findings

- The Vercel production deployment for #46 (`69d52a9`) was created 12:23:27 UTC and the
  recording's page loaded 12:27:08 UTC, so the #46 changes (no animation after the scroll-back,
  `translateZ(0)` layers) were almost certainly live and did not help.
- Frames at 15 fps: the Scoring heading stays in place (PR #45 holds); the top bar and round
  context vanish while the fixture ribbon, a composited horizontal scroller inside the same
  round bar, stays. iOS Safari mis-draws the sticky bars whenever a programmatic scroll and a
  layout change land in the same frame; the shell's structure itself (`.top-bar` sticky in the
  shell grid, `.round-bar` sticky in `.main-content` with `isolation: isolate`, the absolute
  `app-stadium-backdrop` at z-index -2, the hero's own isolated stacking context) is sound and
  has no `position: fixed` descendants.
- WPE WebKit (Playwright's Linux WebKit, iPhone 13 emulation) was installed and run against the
  old build: it does not reproduce the iOS glitch (Linux WebKit has no UI-side compositing), so
  a real iPhone check on the preview deployment is still needed.

## Completed

- `shared/dropdown/dropdown.ts`: closing a pinned dropdown is now two steps that never share a
  frame. `pinGap()` measures the heading's place in the flow from the lead (which never moves;
  no more `position: static` toggling); `closeAfterScroll()` scrolls the window there with
  `scrollTo({ behavior: 'smooth' })` (instant under reduced motion), polls `scrollY` each frame
  until it arrives or settles (150 ms + 3 still frames, 1.5 s cap), then `animateBody(false)`
  folds the body with no scroll in flight. The scroll-back only runs while the heading is
  actually `stuck`; a second tap on the way is ignored; a reset key mid-scroll cancels it.
- `features/match/match.page.ts`: the scroll to the top for another fixture waits for the frame
  after the new fixture has rendered (`afterNextRender` + `requestAnimationFrame`).
- e2e: `expectClosesInPlace` samples the bars, heading, `scrollY` and body height every frame
  for 2.5 s and fails if the page scrolls in the same frame as the body folds (the invariant
  that protects Safari), besides the bars and heading staying put.
- Unit spec: a pinned close scrolls first (`{ top: 394, behavior: 'smooth' }` from the mocked
  geometry), ignores a second tap, folds once the page arrives; an unpinned close scrolls nothing.
- `apps/web/CLAUDE.md` updated.

## Checks run (Node 24 via npx; Playwright with the preinstalled Chromium via a temporary config)

- `npm test -- --watch=false`: 43 files, 286 tests passed.
- `npm run build`: passed, no warnings.
- Playwright (Chromium): the full suite, 53 passed.
- WPE WebKit (Linux, iPhone 13 emulation, a throwaway spec outside the repo): the old build does
  not show the iOS glitch there, so it cannot prove the fix; on the new code both Scoring and
  Teamsheets close in two steps (the page scrolls back through the body, then the body folds)
  with the bars intact throughout. The Scoring run overran the spec's 90 s timeout on its last
  screenshot (the pitch's SVG filters render slowly in WPE), not a functional failure.

## Open

- Verify on an iPhone (preview deployment): open Scoring, scroll into the pitch, close. The page
  should scroll back up to the heading first, then the pitch folds, with the bars intact.
