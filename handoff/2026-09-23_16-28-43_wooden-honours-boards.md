# Wooden honours boards

Request: All standings tables, including The Pecking Order, should resemble dark wooden honours boards with downward lighting, a rounded top and a visibly thicker outer frame.

Completed: Home standings panel and full standings (points and House marks) now share an honours-board treatment. Shallow arched top, 13 px desktop / 10 px mobile raised timber surround, thin brass inner edge, darker recessed wood face, decorative brass picture light with a warm downward pool, and serif gold headings. Reused the wood-only left portion of existing spoon-and-beer.png as a CSS background. The current member's team accent and highlight remain visible. Empty standings also appear inside the board. Tabs remain untextured. Data, rankings and round logic unchanged.

Files: apps/web/src/styles/ui.scss, src/app/features/home/home.page.html and home.page.scss, src/app/features/standings/standings.page.html and standings.page.scss.

Validation: Angular devserver compilation succeeded. Production build passed without warnings. All 10 existing Playwright tests passed. Additional temporary Playwright verification checked home and full boards at 1440, 900, 390 and 320 px with no document or board horizontal overflow, House marks toggle, absent points-rank cells in marks view, empty-round state and untextured tabs. Visually inspected desktop home/full boards and 320 px home/full screenshots. Temporary scripts and captures are in ignored apps/web/test-results.

Unresolved: None. Earlier UI work remains uncommitted. No commit created.
