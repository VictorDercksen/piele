# Constitution as a native page

## Request
Replace the static constitution document (last commit) with the full amended constitution as a normal in-app page at `/<league>/constitution`; remove the static copy and the More page new-tab link.

## Changes
- `/constitution` now renders the whole document from a typed catalogue: header lines (Piele URC 26/27, adoption date, Amendment 1 pending), a contents list with fragment links, then Articles 1-9, Addendum A (A1-A4 and the trigger table) and the record of adoption, in the document's order and wording.
- `**...**` markers in the content strings become `<strong>` through `emphasisSegments`; no innerHTML.
- Not carried over: cover artwork, crests, jerseys, mastheads, footers, the "Superbru terminology and design references" block, the "United Rugby Championship Predictor" honour strip, blank signature fields. The old "SEASON DOCUMENT / NOT ADOPTED" tag, summary and "Voluntary ceremonies" line are gone.
- Addendum A table is a stacked list under 600 px; terms grid is one column under 480 px.
- Fix: bold spans showed a stray space after them (template whitespace around the `@if`). Segments now render through `app-emphasis-text` (`emphasis-text.ts|spec.ts`), whose template is one line under `// prettier-ignore`; the page spec also asserts the real DOM has no stray space.
- Deleted `apps/web/public/documents/`; the More page row is back to the routerLink form (arrow icon); README sentence now says the More page links to the constitution page.

## Files
- New: `apps/web/src/app/features/constitution/constitution.content.ts`, `constitution.models.ts`, `emphasis.ts`, `emphasis.spec.ts`, `constitution.page.spec.ts`
- Rewritten: `constitution.page.ts|html|scss`
- Changed: `apps/web/src/app/features/more/more.page.html` (identical to master again), `README.md`
- Deleted: `apps/web/public/documents/**`
- New: this handoff

## Checks
- `npm run build`: passed, no warnings.
- `npm test` (after the whitespace fix): 127 files, 641 tests, all passed (breadcrumbs timeout did not recur).
- Wording fidelity script (throwaway, outside the repo): 133 distinct source strings checked against the content catalogue with markers stripped, 0 missing.
- Not run: e2e, production CSP e2e, visual check in a browser (light/dark, 320 px).

## Next steps
- Look at the page in a browser on a phone width and in both themes.
- Fragment links use routerLink plus a click handler that scrolls, since the router has no anchor scrolling.
