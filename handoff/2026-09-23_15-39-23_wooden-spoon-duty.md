# Wooden Spoon duty styling

Request: Give everything related to Spoon duty a wooden spoon and beer treatment. User clarified that "bear" meant "beer".

Completed:
- Generated a worn-walnut still life containing a wooden spoon and a mug of amber beer.
- Added a shared Spoon theme with wood grain, warm amber controls, cream text and timber borders.
- Applied it conditionally to the home duty card, duty register cards, evidence dialog and duty notifications.
- Artwork sits beside content on wide cards and above content on narrower cards. The art size stays bounded so both objects remain visible on tall register cards.
- Kept ordinary duties in the existing rugby theme. The home heading now only refers to the Spoon for Spoon duties.
- Derive the presentation-only spoon flag from the word "Spoon" in each existing duty title. No persistence or API schema change.
- Extended the existing evidence browser journey to assert Spoon cards/dialogs and an unthemed pick-confirmation duty.

Relevant files:
- apps/web/src/app/core/league/round-view.service.ts
- apps/web/src/app/features/home/home.page.html and home.page.scss
- apps/web/src/app/features/duties/duties.page.html and duties.page.scss
- apps/web/src/app/features/duties/evidence-dialog/evidence-dialog.html
- apps/web/src/app/core/layout/notifications-dialog/notifications-dialog.html
- apps/web/src/styles/ui.scss
- apps/web/e2e/season-timeline.spec.ts
- apps/web/public/assets/editorial/spoon-and-beer.png

Checks:
- Production build passed without warnings, initial bundle 377.78 kB.
- Unit tests: 10 passed.
- Browser suite: 10 passed, including evidence submission and ordinary duty isolation.
- Additional screenshots and layout checks at 1800, 1440, 900, 390 and 320px. Inspected home cards, register, evidence dialog and notifications. No page errors or horizontal overflow.
- git diff --check passed.
- Angular best-practices MCP returned an unexpected response error. Local frontend guide followed.

No unresolved implementation issues. Dev server remains at localhost:4300. No commit or deployment.

## Image generation

Mode: built-in imagegen.
Final saved asset: apps/web/public/assets/editorial/spoon-and-beer.png.
The same image supplies both the decorative still life and the left-hand timber grain via CSS background framing.

Prompt:

Use case: photorealistic-natural. Asset type: decorative still-life artwork for a rugby clubhouse Spoon duty card. Landscape 1536x1024. Top-down editorial photograph on a dark worn walnut wooden pub table, deeply tactile visible natural grain, scratches and warm brown patina. On the RIGHT HALF of the frame ONLY place one large rustic wooden cooking spoon diagonally with its broad oval bowl near upper center-right and long handle toward lower center, alongside a single clear handled beer mug filled with golden amber beer, modest creamy white foam, cold condensation on glass and a faint wet ring on wood. Objects entirely inside frame, with margins. LEFT HALF is completely empty unadorned dark walnut grain. Warm side light catches the spoon grain and amber beer, moody shadows, realistic understated rugby club pub atmosphere, premium editorial still life, no people, no logos, no text, no labels, no watermarks, no extra objects. Wooden spoon and beer must both be immediately recognizable. Not a cartoon, not a UI screenshot.
