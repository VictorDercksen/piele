# Captain's desk dropdowns and stitched white buttons

## Request

- Put every section of the captain's desk into a dropdown with a chevron, all closed by default.
- Give the normal white buttons the stitching pattern the main (primary) buttons have.

## Completed

- New `apps/web/src/app/shared/collapsible-section` (component, template, SCSS, spec): a section
  closed to its heading, with a chevron top right (named by the heading through
  `aria-labelledby`, `aria-expanded`, `aria-controls`; its hit area the whole heading row). The
  body is `inert` and hidden while closed and its height animates like the match centre's
  drawers (skipped under reduced motion). An `anchor` input gives the host that id and opens the
  section when the route's fragment names it; `sectionSide` content sits beside the chevron.
- Captain's desk: "Evidence to decide." and "The team sheet." (page template) and the picks,
  join link, appearance and rules cards now use it. The evidence heading shows "{n} PENDING"
  while there is evidence to decide. `/captain#picks` still opens and scrolls to the picks
  (the scroll margin moved from `picks-card.scss` to the component). Sections sit 28 px apart.
  The hidden `.section-title > span` labels (ROUND, SEASON, LEAGUE) were dropped.
- `src/styles/ui.scss`: the white buttons (`.league .icon-button`, `.context-pager button`,
  `.toast button`, `button.text-button`, the profile editor's close and remove-photo buttons,
  and the sign-in page's `.google-button`) get the primary button's dashed stitched edge as an
  `::after`. `league-card.scss` keeps its bare chevron's whole-head hit area (`position: static`
  on the button, `border: 0` on its `::after`).
- e2e: `openSection(page, heading)` in `e2e/support.ts`; captain desk flows in
  `leagues.spec.ts`, `season-timeline.spec.ts` and `superbru.spec.ts` open their section first;
  a new test checks the desk opens closed except the section `#picks` names.
- `apps/web/CLAUDE.md` describes the collapsible sections and the stitched white buttons.

## Checks run (Node 24 through npx; the container's Node 22.22.2 is below the Angular CLI minimum)

- `npm test -- --watch=false`: 43 files, 282 tests passed.
- `npm run build`: passed, no warnings.
- Playwright (all nine specs, with the preinstalled Chromium through a temporary config setting
  `executablePath: '/opt/pw-browsers/chromium'`): 51 passed.
- Screenshots at 1280 px and 320 px: sections closed with chevrons, stitched white buttons, no
  horizontal overflow at 320 px.

## Open

- Nothing known. The section state is not remembered across visits (closed each time), as asked.

## Follow-up: the team sheet on phones

- Each team-sheet row's buttons (and the withdrawn row's "Reinstate") are grouped in
  `.member-actions`. Below 700 px (container) a row is a grid: name and full name with the
  status tag top right, the note below, then the actions side by side (equal width, up to
  160 px each) instead of one stacked button per line. Desktop keeps the single line.
- Checks: unit tests 43 files, 282 passed; build passed with no warnings; Playwright
  `leagues.spec.ts` and `season-timeline.spec.ts` 20 passed; screenshots at 390, 320 and
  1280 px with no horizontal overflow.
