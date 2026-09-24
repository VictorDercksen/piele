# Honours board: timber rail and picture light

Request: The full wooden honours board on Home and Standings felt too heavy for the Floodlights design. The user reviewed three rounds of CSS-only prototypes (nineteen variants, captured from the running app on desktop and 390 px mobile) and chose the "rail and picture light" treatment.

Completed changes: The honours board is now a standard app panel (surface grain over #102022, 1 px border, soft shadow) with a 12 px timber rail along the top edge, a brass picture light mounted on the rail, and a warm light cone falling down the panel. The heading keeps the centred gilt serif lettering; everything else uses the app's ink colour. The arch, lamp glow, thick frame and full timber body are gone. Rows use the existing team-colour "you" highlight and house-marks styling from the page components again, with side padding added to the house-marks box. On Standings the board heading now reads "Superbru points" or "House marks" so it no longer repeats the page title "The pecking order.".

Relevant files: apps/web/src/styles/ui.scss (honours board block), apps/web/src/app/features/standings/standings.page.html. No template structure or TypeScript changed. The .board-light element is reused for the lamp.

Checks run: `npm run build` passed without warnings. `npm test` passed (4 files, 10 tests). `npm run test:e2e` passed 9 of 10; the failure in "all published rounds, playoffs, timezone and selection persistence" expects "FRI 16 APR 2027" but the container's Node 24 ICU renders "FRI, 16 APR 2027". It fails identically on the unmodified code, so it is an environment difference, not a regression. Visual checks passed on Home and Standings at 1440 and 390 px with round 1 data and the round 3 empty state.

Environment notes: The container ships Node 22.22.2, below the Angular CLI minimum; Node 24.21.0 was installed under /opt/node24 for this session only. The pinned Playwright 1.63 expects Chromium build 1243; the pre-installed 1194 build was symlinked in place for the e2e run.

Unresolved issues: None for this change. Consider making the e2e date assertion tolerant of the ICU comma, or pinning the Node version for e2e.

Follow-up: On phones the Home grid becomes a flex column, so the board's global `align-self: start` acted on the horizontal axis and shrank it to content width. `.standings-panel` now sets `align-self: stretch` inside the Home page's 600 px container query. Build, unit tests and 9 of 10 e2e tests pass again; the remaining failure is the same ICU date-format difference described above.
