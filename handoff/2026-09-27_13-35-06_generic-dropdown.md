# One dropdown for the app, with a pinned heading

## Request

- Make the match centre's Pavilion preview and teamsheets dropdowns.
- For those and every earlier dropdown, keep the heading pinned to the top (under the shell's
  bars) while the dropdown is open and scrolled, so it can always be closed.
- Build a generic dropdown with styling options for uniformity. Plan first, then implement, in
  a new PR.

## Plan (as carried out)

1. Replace `shared/collapsible-section` with `shared/dropdown` (`app-dropdown`): one heading,
   chevron, body and animation for the whole app, with options instead of copies.
2. The shell publishes `--sticky-offset` (top bar + round header, measured with a
   `ResizeObserver`), which the open heading row sticks to; the row gets a `stuck` background
   once pinned.
3. Move every dropdown onto it: the six captain's desk sections, the scoring panel, pool picks,
   and the new Pavilion preview and teamsheets.
4. Unit tests for the dropdown, updated specs, e2e for the pinned heading on desktop and phone,
   docs.

## Completed

- `apps/web/src/app/shared/dropdown/` (component, template, SCSS, spec). Inputs: `heading`,
  `headingId`, `appearance` (`section` | `panel`), `toggleName`, `bodyId`, `peek`, `tapToOpen`,
  `collapsible`, `resetKey`, `anchor`. Slots: `dropdownSide`, `dropdownLead`, body,
  `dropdownFoot`. CSS hooks: `--dropdown-rule`, `--dropdown-rule-hover`, `--dropdown-stuck-bg`,
  `--dropdown-pad-x`. An open dropdown stays open when the fragment later changes (only a
  matching fragment opens it; only a new `resetKey` closes it).
- Shell (`core/layout/shell`): `#topBar`, `#roundBar`, `#main` and the offset observer.
- Captain's desk: renamed usages (`dropdownSide` for the pending count).
- Match centre: `scoring-panel` (peek 30 px, tap to open, the summary as lead, the source line
  as foot; its own drawer, chevron and panel styles removed; host keeps `.open` and gains
  `.live`, which sets the live top rule), `picks-panel` (lead: form, split, your pick; body:
  `#picks-pool`; no chevron until the pool shows; closes per fixture), `match-preview` (panel
  dropdown, closes per fixture; the host lost `role="region"`, the dropdown's section carries
  the name) and the teamsheets in `match.page.html` (the status tag now shows beside the
  chevron; before, the global `.section-title > span` rule hid it).
- e2e: `openSection` is now for any dropdown; new `expectPinnedHeading(page, heading)` in
  `e2e/support.ts`; a new desk test (desktop and 390 px) and a pinned teamsheets check at 390 px
  in the match centre test; teamsheets are opened before their contents are checked.
- `apps/web/CLAUDE.md`: a "Dropdowns" paragraph and the desk and pool picks text updated.

## Checks run (Node 24 via npx; Playwright with the preinstalled Chromium via a temporary config)

- `npm test -- --watch=false`: 43 files, 285 tests passed.
- `npm run build`: passed, no warnings.
- Playwright, all specs: 52 passed (after fixing one team sheet locator; rerun of
  `leagues.spec.ts` 13 passed).
- Screenshots: match centre at 390 px closed and with the teamsheets heading pinned; captain's
  desk at 1280 px with the picks heading pinned.

## Not done / next

- The kickoff forecast stays a plain panel. The native `<details>` disclosures (preview
  sources, Withdrawn, manage cards, Appoint a captain) were not moved onto the dropdown.
- The Pavilion preview only renders in API builds, so it was checked by unit tests only.
