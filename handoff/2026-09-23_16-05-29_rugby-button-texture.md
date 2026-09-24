# Rugby button texture

Request: Add rugby-ball grip texture to appropriate buttons. Subsequent instructions require rounded shapes and the loading ball's colour palette, exclude tabs, and explicitly include Upload evidence.

Completed: Added a small repeating SVG grip asset and shared off-white, teal and navy button tokens based on assets/images/urc-ball.webp. Main actions have pill corners, teal/navy end panels, inset dashed stitching, and hover/pressed/disabled treatment. Secondary icon controls and file selection use a simpler rounded grip surface. Applied to profile save/onboarding, match centre, evidence, voting and shell controls. Removed the home duty action's local square-corner override. Spoon cards keep their timber artwork but use the same ball buttons. Tab controls remain untextured. No business logic changes.

Files: apps/web/public/assets/editorial/rugby-grip.svg, src/styles.scss, src/styles/ui.scss, shell.scss, home.page.scss, match-hero.scss, profile-editor.scss and evidence-dialog.scss under apps/web.

Validation: Production build passed without warnings. All 10 existing Playwright tests passed, including desktop through 320 px, profile workflows, evidence/voting, round scoping and keyboard navigation. After the final corner fix and finer grip adjustment, reran the production build and a focused Playwright check. Computed border-radius is 999px for home Upload evidence, duty-register Upload evidence, Submit evidence, match centre and shell controls. Both standings tabs have background-image none. Inspected desktop duty and evidence-dialog screenshots. Temporary verification script/screenshots are under ignored apps/web/test-results.

Unresolved: None. Existing unrelated and earlier UI work remains uncommitted. No commit created.
