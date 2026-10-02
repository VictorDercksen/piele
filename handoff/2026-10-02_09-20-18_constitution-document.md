# Constitution document served as static files

## Request
Serve the league's adopted constitution (a static 7-page A4 HTML document, from `C:\Users\victo\Desktop\piele-urc-26-27-editable\`) from the web app's static files, and make the More page's "Constitution" entry open it in a new tab.

## Changes
- Copied `index.html`, `styles/` and `assets/` (fonts, team crests, jerseys, Superbru artwork) to `apps/web/public/documents/constitution/`. `piele-crest.png` was not copied; the document now points at the app's own `/assets/images/piele-crest.png`.
- Removed the `.toolbar` block (Print / Save PDF button with `onclick`) from the copied document so it has no inline script, which the CSP (`script-src 'self'`) would block. The `.toolbar` CSS rules were left alone. No wording changed.
- More page: the Season "Constitution" row is now a plain anchor to `/documents/constitution/index.html` (`target="_blank" rel="noopener noreferrer"`) with the external-link icon, like the schedule-source row. The in-app `/constitution` route and its feature were left untouched.
- README: one sentence in the More page paragraph.

## Files
- `apps/web/public/documents/constitution/**` (new, about 1.6 MB)
- `apps/web/src/app/features/more/more.page.html`
- `README.md`

## Checks
- Script: every relative src/href/url() in the copied index.html and CSS resolves to a copied file; no copied asset is unreferenced.
- grep: no `<script` and no `onclick` in the copied index.html.
- `npm run setup` was needed first (`ai` and `@ai-sdk/angular` were declared but not installed in node_modules).
- `npm run build`: passed.
- `npm test`: 627 passed, 1 failed (`breadcrumbs.spec.ts` "gives a page opened directly its parent and main pages none", 5000 ms timeout in the full run, twice). The spec passes alone (5/5 with `npx ng test --watch=false --include ...`), so it is a load-related timeout, not caused by this change. Not investigated further.
- Not run: e2e, production CSP e2e, visual check in a browser.

## Next steps
- Consider `npm run test:e2e:production` to confirm the document loads under the CSP.
- The More page template still imports no unused items (icons still used elsewhere).
