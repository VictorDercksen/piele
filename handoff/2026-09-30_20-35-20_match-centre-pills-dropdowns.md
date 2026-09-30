# Match centre: status pills, updated pill, dropdown responsiveness

## Request

On the Match Centre page: show full time, final and the teamsheet statuses (one read "ok") as
styled pills; make the "URC match centre · updated <time>" line a pill with an icon reading
"Updated <time>"; fix laggy dropdowns and chevrons that sometimes do not respond; fix the Pavilion
preview's Sources section, which could not be closed.

## Causes found

- Sources: the nested dropdown took the outer dropdown's state. `dropdown.scss` used descendant
  selectors (`.open .dropdown-body`, `.panel .dropdown-head`, `.open .chevron`, ...), and both
  dropdowns share the component's scoped styles, so an open preview forced the Sources body open
  (height auto, visible) whatever its own state.
- Unresponsive chevrons: the chevron's `::after` spans the heading row as its hit area. The global
  `button:hover { filter: brightness(0.97) }` and the open state's `transform: rotate(180deg)`
  each made the button the containing block of that layer, shrinking the hit area to the 32 px
  button. On a phone the button stays hovered after a tap, so later taps on the heading missed;
  on desktop the hover flickered between the two sizes.
- Scroll: every open dropdown read layout (`getComputedStyle`, two `getBoundingClientRect`) on
  every scroll and resize event.

## Changes

- `shared/dropdown/dropdown.scss`: state rules name their own parts with child combinators; a
  dropdown nested in another's body does not pin its heading; the chevron icon rotates instead
  of the button; `.chevron:hover { filter: none }`.
- `shared/dropdown/dropdown.ts`: scroll/resize measurement at most once per frame, only while open.
- `styles/spartan.scss`: `.status-pill` (Helm badge, outline) with `data-tone` done / pending /
  live (pulsing dot) / warn / muted.
- `features/match/section-status.ts` (+ spec): `sectionPill(status, ready)`; `ok` shows as
  "Published" (teamsheets) or "Available" (forecast), never "ok".
- Scoring (`scoring.ts` adds `tone`), pool picks, teamsheets and forecast tags are status pills.
- `match.page.html`: the score's source line is an outline pill with `lucideRefreshCw`,
  "Updated HH:mm:ss z" (warn tone while the score is delayed); the source name is its `title`.
- Tests: selectors moved from `.tag` to `.status-pill`; `live-scoring.spec.ts` closes the open
  Scoring panel from its heading row; `match-centre.spec.ts` checks the Published/Available
  pills and that the heading row closes the Teamsheets after hovering the chevron.

## Checks run (Node 24 via npx; Playwright with /opt/pw-browsers/chromium via a scratch config)

- `ng test --watch=false`: 116 files, 572 tests passed.
- `ng build`: complete, no warnings.
- Playwright, full suite against `ng serve`: 73 passed. With `.chevron:hover { filter: none }`
  removed, the new match-centre step fails (heading tap leaves the section open).
- Scratch script at 390 and 1280 px: pills render with their tones, the open heading row closes
  its section, a closed dropdown cloned into an open one's body stays at height 0 and hidden,
  its heading does not pin, no horizontal overflow.

## Unresolved / next steps

- The Pavilion preview itself only renders in API builds with Supabase configured, so it was not
  rendered here; the Sources fix was verified through the cloned nested dropdown above.
- The teamsheets footer still reads "URC match centre · checked <date>" as text; it could take
  the same pill if wanted.
- Not verified on a real iPhone.
