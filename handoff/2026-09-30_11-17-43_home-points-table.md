# Home board: shared points table

## Request

Make the Home "pecking order" table the same as the Standings page table, falling back to the season table when the round has no results. Restyle the full standings link, the season rank button and the house marks (options chosen from a mock-up: L2 table footer, S3 season pill, H1 tally card). Resolve the duplicate link in the season fallback (R1: drop the pill, put the member's season rank in the footer). Add the Totals / Breakdown toggle to the Home table through one shared component.

## Changes

- New `shared/points-table/` (`PointsTable`): Totals / Breakdown switch, key chips, table label, rows, badges, override tag and breakdown bars moved out of the Standings page. Inputs: `rows`, `scope` (`round` | `season`), optional `limit`; with a limit, the member's own row is pinned below the top rows (`.pinned`, dashed rule). The breakdown choice still uses `StandingsPreferences`, so both screens share it.
- `points-table.models.ts` / `points-table.rows.ts` (+ spec) moved from `standings.page.models.ts` / `standings.page.rows.ts`; the page keeps only `StandingsMeasure` and `measureFrom`.
- Standings page: Round and Season tabs render `<app-points-table>`; House marks tab unchanged. Points-table styles moved to the component; base row styles stay on the page for the marks table.
- Home `StandingsSummary`: round table (top 4 + pinned own row) once the round has results, else the season table with a "Round NN · no results yet" tag. Footer row "Top 4 of N | Full round standings" (season fallback: "You are 2nd of N · X pts | Full season standings"). Season pill only in the round state. House marks as a tally card (5 sticks, 10 past five marks).
- `styles/ui.scss`: removed the dead `.leaderboard li strong` selector and the global `.house-marks` padding override.

## Checks run

- `ng build` (Node 24 via `npx node@24`): success, no warnings.
- `ng test --watch=false`: 114 files, 565 passed (new `points-table.spec.ts`, `standings-summary.spec.ts`).
- Playwright `superbru` and `profile-and-layout` (preinstalled Chromium, temporary config): 10 passed.
- Screenshots of the Home board at 1440, 390 and 320 px in round, season-fallback and breakdown states; no horizontal overflow.

## Unresolved / next steps

- `StandingService.standings` is no longer used by any component (only its spec).
