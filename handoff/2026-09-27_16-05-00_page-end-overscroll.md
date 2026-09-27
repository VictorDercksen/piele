# Pages scrolling past their end

## Request

A recording: on a phone, many pages (Duties, Standings, More, ...) could be scrolled well past
where the content stops, a blank viewport and more under the round header. Check every page.

## Cause

Two kinds of hidden box extended the document's scrollable area:

- Overlays hanging under the sticky top bar while closed: the league switcher's phone scrim
  (`position: absolute; top: 100%; height: 100dvh; visibility: hidden`), its panel (up to
  640 px, hidden the same way) and the notifications flag's assembly (the cloth, ~400 px,
  `visibility: hidden` on its swing). The rail's switcher popover did the same under the sticky
  rail on desktop. A hidden box still counts towards scrollable overflow. In Chromium that adds
  up to 63 px on a short page (the bar's height plus a viewport); iOS Safari measures a sticky
  bar's descendants at its stuck position, so the extra viewport moved with the scroll and the
  page could be scrolled a viewport past its footer, which is what the recording shows.
- Closed dropdown bodies (`shared/dropdown`: `height: 0; overflow: hidden`, but `position:
  static`): the visually hidden table text inside (`.visually-hidden`, `position: absolute`)
  was positioned against an ancestor outside the body, so the clip did not apply to it and the
  captain's desk gained 1130 px and the match centre 38 px of blank scroll below the footer.

Found with a Playwright scan of every page at 393, 320 and 1440 px: the document's
`scrollHeight` against the footer's bottom plus the fixed bar, and every descendant of a sticky
bar that reaches beyond the bar's box.

## Completed

- `shared/dropdown/dropdown.scss`: `.dropdown-body` is `position: relative`, the containing
  block of its absolutely positioned descendants, so a closed body clips them too.
- `core/layout/league-switcher/league-switcher.scss`: the panel and the phone scrim are
  `display: none` while closed. The switch waits for the fade out through
  `transition: display … allow-discrete`, and the fade in starts from `@starting-style`
  (also for the phone sheet's slide). `visibility` transitions are gone.
- `core/layout/notifications-flag/notifications-flag.scss`: `.assembly` is `display: none`
  while closed, `transition: display 660ms allow-discrete`, so it shows at once on opening and
  leaves after the roll-up and retract animations. The swing's own visibility rule stays.
- e2e (`season-timeline.spec.ts`, "a page ends where its content ends"): Duties, Constitution,
  Captain, a match and Home, at 390 and 1440 px: `scrollHeight` equals the footer's bottom plus
  the fixed bar (or the viewport on a short page) within 1 px, and nothing unclipped inside the
  top bar, rail or round header reaches below it. It fails on the previous styles (the scrim,
  panel and cloth listed).
- `apps/web/CLAUDE.md`: the rule under the shell hierarchy.

## Checks run (Node 24 via npx; Playwright with the preinstalled Chromium through a temporary config)

- Scan after the change: every shell page at the three widths ends at its content; no sticky
  descendant reaches beyond its bar. Short desktop pages report the viewport's height, which is
  `min-height: 100vh`, not scroll.
- `npm test -- --watch=false`: 43 files, 286 tests passed.
- `npm run build`: passed, no warnings.
- Playwright (Chromium): the full suite, 55 passed (the new test included); the new test alone
  fails with the style changes stashed.
- Screenshots on a phone and desktop: the flag and the switcher open and close as before; the
  assembly stays `display: block` for the 660 ms of the closing animation.

## Open

- Verify on an iPhone: Duties or More on a short round should stop at the footer, and no page
  should scroll on past its end after opening and closing the switcher or the flag.
- `visually-hidden` is declared per component (captain page, picks card, manage fields) rather
  than once in `styles/ui.scss`; not changed here.
