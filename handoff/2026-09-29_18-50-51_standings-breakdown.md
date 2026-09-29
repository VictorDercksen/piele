# Standings: breakdown toggle, key and labelled bar

## Request

Improve the look and layout of the standings breakdown toggle, legend and table rows/columns, using Spartan components. Options were mocked up in an artifact; the member chose toggle B (segmented control), legend A (chip row with highlight) and rows C (labelled bar).

## Changes

- `standings.page.html`:
  - The "Show breakdown" pill (`hlmToggle`) is replaced by a `hlmToggleGroup` segmented control, "Totals | Breakdown" (`.breakdown-view`, aria-label "Table view").
  - The legend list is replaced by a `hlmToggleGroup` (single, nullable) of key chips (`.breakdown-legend`, aria-label "Breakdown key"). Each chip shows the abbreviation, carries the full name as `title` and as visually hidden text. Pressing a chip highlights that part in every bar (`data-highlight` on `.points-table`); pressing it again clears it. A hint line reads "Tap a key to highlight it."
  - The WP/MP/GSP/BP columns and their `abbr` headings are gone at every width. Under each row a labelled bar spans the member and total columns; each non-zero part prints its value when its width is at least `LABEL_MIN_WIDTH` (8% of the top total) and has a `title` with the full name and value. The visually hidden sentence per row stays.
  - The total heading reads "ROUND PTS" / "SEASON PTS", and "PTS" under 440 px so it no longer wraps.
  - The season rounds count hides while the breakdown shows.
  - The leader row gets `.lead`: rank and total in gilt. Rank uses the serif numerals.
- `standings.page.ts`: `setBreakdown(view)` replaces `toggleBreakdown()`; new `highlight` signal and `setHighlight(part)`; turning the breakdown off clears the highlight. `HlmToggle` import removed.
- `standings.page.rows.ts`: `BREAKDOWN_PARTS` catalogue, `LABEL_MIN_WIDTH`, `breakdownPartFrom()`.
- `standings.page.models.ts`: `BreakdownPart`, `BreakdownPartLabel`; `PointsRow.bar` typed as a record of parts.
- `standings.page.scss`: breakdown styles rewritten for the grid with a second-row bar; 2 px gaps between parts; highlight dims other parts to 0.22 opacity; "you" rows use an inset shadow instead of a border so their content no longer shifts right.
- `src/styles/spartan.scss`: `.breakdown-toggle` rules replaced by `.breakdown-view` (gilt active segment) and `.breakdown-legend` chip styles.
- Tests: `standings.page.spec.ts` and `e2e/superbru.spec.ts` follow the new controls, check segment labels/titles and the highlight.

## Checks run

- `ng build` (Node 24 via `npx node@24`): success, no warnings.
- `ng test --watch=false`: 558 passed.
- Playwright `superbru`, `spartan-controls`, `profile-and-layout` (preinstalled Chromium via a temporary config override): 15 passed.
- Screenshots of the Piele season table at 320, 390 and 1280 px with the breakdown on and with a key highlighted; no horizontal overflow.
- `prettier --write` on the changed files.

## Unresolved / next steps

- At desktop width the bar runs the full row; if that feels too long, cap `.breakdown-bar` width.
- Parts narrower than 8% of the top total show no number; the full values are in the segment title and the screen-reader sentence.
