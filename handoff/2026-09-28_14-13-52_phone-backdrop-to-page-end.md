# Stadium artwork to the end of short pages on phones

## Request

A recording after PR #57: on Decisions and More the stadium background stops partway, a strip
of plain paper under it, instead of covering the page or fading into the paper the way Home
does when the content is long.

## Cause

The backdrop (`app-stadium-backdrop`, `position: absolute; inset: 0; max-height: 1500px`)
and the darkening gradient (`.main-content::before`) cover the main content. On phones the room
for the fixed bottom navigation was the `.league` grid's own bottom padding, outside the
content, so the artwork ended at the footer with the nav's 78 px of paper under it. And on the
iPhone the artwork stopped even higher, at the content's end well above the screen's bottom:
Safari does not stretch the grid's `1fr` main row to the grid's `min-height`, so a short page's
main was only as tall as its content. Home looked right only because it is longer than the
1500 px at which the gradient reaches solid paper and the artwork ends.

Chromium measurements at 390×664 before the change (page end = `scrollHeight`):

| page | main bottom | backdrop bottom | page end |
| --- | --- | --- | --- |
| Decisions | 768 | 768 | 846 |
| More | 645 | 645 | 723 |
| Duties | 586 | 586 | 664 |
| Home | 2289 | 1564 (1500 tall) | 2367 |

## Completed

- `core/layout/shell/shell.scss`, last phone container block: the nav's room is now
  `.main-content`'s own `padding-bottom: var(--nav-height)` (the grid's padding is gone), and
  the content has `min-height: calc(100svh - 64px)` (a `100vh` line before it as the
  fallback), so it fills the screen on its own. The backdrop and the gradient therefore run to
  the page's end on a short page, and on a long page the artwork fades into the paper by
  1500 px as on Home. Desktop is untouched (the rules sit in the ≤1050 px block; the top bar
  is 64 px there).
- After the change the backdrop's bottom equals the page end on Decisions (846), More (723)
  and Duties (664); Home is unchanged (1500 px, page 2367).
- e2e `stadium-backgrounds.spec.ts`: "on a phone the artwork runs to the end of a short page
  and fades out on a long one": at 390×664 the backdrop and its image fill the screen and end
  within 1 px of the page's end on Decisions, More and Duties, the page end clears the footer
  by more than the nav, and Home's backdrop is 1500 px with the page longer than that.
- e2e `mobile-round-picker.spec.ts`: the sheet sampler from PR #57 used a fixed 600 ms window
  and missed the resting position on a cold load. It now samples until the rise animation
  ends or the sheet is removed (5 s cap).

## Checks run (Node 24; Playwright through a scratch config pointing at `/opt/pw-browsers/chromium`)

- `npm run build`: passed, no warnings.
- `npm test -- --watch=false`: 57 files, 364 tests passed.
- Playwright: `mobile-round-picker.spec.ts` 9 of 9 (three repeats); the layout specs
  (`stadium-backgrounds`, `season-timeline`, `profile-and-layout`, `mobile-round-picker`)
  passed with the new test; the full suite's final result is in the PR.
- Screenshots of Decisions, More, Duties and Home at 390×664 (full page): the artwork now
  runs under the bottom navigation to the page's end; Home unchanged.

## Open

- Verify on the iPhone: Decisions and More should show the artwork to the bottom of the screen
  (under the floating nav) with no plain strip; a long page should fade it out as Home does.
- The e2e `.page-body` gate: without a seeded profile a page redirects to `/welcome`; ad-hoc
  scripts need the same `localStorage` seed as `e2e/support.ts`.
