# Mobile feed pill, ribbon and round-sheet animations, page-end scroll

## Request

After this morning's Spartan migration and the mobile round sheet (PR #56): the round/season
selector on the home feed looked wrong on a phone (its two segments stacked, the selected one a
tall brown chip); the fixture ribbon's slide out of view was gone on phones and the new round
sheet needed a slide up from the bottom; and pages could be scrolled well past their content
(a recording of Duties, Decisions and More on an iPhone).

## Completed

- **Feed pill** (`features/home/feed/feed.{html,scss}`, `styles/spartan.scss`): the
  `.feed-scope` toggle group no longer wraps or shrinks (`flex-wrap: nowrap; flex-shrink: 0`),
  and the feed's heading row wraps the whole pill under the heading when it does not fit
  (320 px). The feed's own button rules that beat the shared toggle theme on load order are
  gone, so the pressed segment is the coral style the theme defines; the `.active` bindings
  went with them (`aria-pressed` drives the state).
- **Ribbon slide on phones** (`core/layout/shell/shell.scss`, last container block): leaving
  Home or Match, the round bar's bottom margin closes while the drawer folds (0.35 s), then the
  bar leaves the layout through `transition: display … allow-discrete`, so no hidden box
  extends the page. Coming back it unfolds from `@starting-style`. Reduced motion is instant.
  No transforms on the grid or the main content.
- **Round sheet** (`core/layout/round-picker/round-picker.scss`, `styles/spartan.scss`):
  keyframes slide the sheet up from the viewport's bottom (0.3 s) and down on closing
  (0.25 s, on `data-state="closed"`; Brain 1.5 keeps the dialog attached until an animation
  started by that state ends, so no `closeDelay` exists or is needed). The backdrop fades in
  through Spartan's `--spartan-overlay-backdrop-*` variables for every dialog and fades out
  for the round sheet only. Reduced motion: no slide, no fade.
- **Page-end scroll** (`app.scss`, `shell.scss`): the app root, the shell host and the
  `.league` grid used `min-height: 100vh`. On iOS Safari that is the viewport with its
  toolbars collapsed, so once the rail and round context left the phone layout, a short page
  fell below it and could be scrolled by the toolbars' height (its heading under the top bar,
  a blank strip below), and a page between the two heights was stretched, leaving the large
  gap under More's footer. `min-height: 100svh` now follows each `100vh` line (desktop is
  unchanged). Chromium measured every page ending at its content (`scrollHeight` equals the
  footer plus the nav's inset within 1 px; nothing hidden under the sticky bars), so the
  remaining cause was the viewport unit.
- e2e: `mobile-round-picker.spec.ts` samples the sheet's top edge on open (from below the
  viewport to rest) and on Escape (down past rest before removal); its date check accepts
  both en-dash spacings Chromium versions produce. `season-timeline.spec.ts`: the page-end
  test also covers Decisions, More and Standings at 390×664; "a short page does not scroll on
  a phone" checks `scrollHeight === innerHeight` and that no `vh` minimum applies to the page's
  boxes; "the fixture ribbon folds up … and back down" observes the `mobile-empty` flip and
  asserts the `grid-template-rows` and `margin-bottom` transitions start, heights never grow
  on the way out or shrink on the way back, the bar ends `display: none` with no excess
  scroll, and returns to full height.

## Checks run (Node 24; Playwright through a scratch config pointing at `/opt/pw-browsers/chromium`, since Playwright 1.63 wants build 1243 and 1194 is installed)

- `npm run build`: passed, no warnings.
- `npm test -- --watch=false`: 57 files, 364 tests passed.
- Playwright, full suite: 64 passed; the three failures on the first run were the date-format
  expectation (fixed) and the ribbon test's frame sampler under parallel load (rewritten to
  assert on the transitions; 3 of 3 repeats pass, and it fails with the bar's transition
  removed). The final full run's result is in the commit message if it finished before the
  push; otherwise see below.
- Screenshots at 320/390/430/1440 px of the feed heading, mid-animation frames of the ribbon
  and the sheet, reduced motion: all looked right.
- Prettier clean on the changed files.

## Open

- Verify on an iPhone: Duties and Constitution should not scroll at all; More should end with
  its footer just above the nav; the ribbon should fold up when leaving Home and unfold on
  return; the round sheet should slide up and down.
- The `@starting-style` unfold also plays on the first load of Home and when fixtures arrive
  after the bar was hidden. Acceptable, but say if it should not.
- Sign-in, join, manage and the profile editor still use `min-height: 100vh` outside the
  shell; the same iOS pattern applies there and was left alone.
- The preinstalled Chromium build does not match Playwright 1.63; a setup script that
  installs the matching build (or pins `executablePath`) would let `npm run test:e2e` run
  unchanged here.
