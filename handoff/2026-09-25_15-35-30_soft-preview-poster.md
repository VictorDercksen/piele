# Softer Piele preview poster

Recorded on 25 September 2026 in Africa/Johannesburg time.

## Request

Mock up the Piele preview poster without team emblems, with subtler background colours that fade out and have no definite border. The user approved the full-page mockup and asked for a PR.

## Completed

- `match-preview.html`: removed the crests on either side of the title. "Piele's read." now sits centred alone above the summary.
- `match-preview.scss`: the ground photo, dark overlay and club colour glows (22%, previously 38%) moved to a `::before` layer. That layer is masked to fade out on every side into the panel, and the poster's border is removed. On phones the layer is inset to match the panel padding. The side cards lost their border and backdrop blur. Each has a faint club-tinted gradient fading downwards and a 2 px club-coloured line along the top, fading out to the right.
- `preview-view.ts`: dropped `crest` from `PreviewSideView`, now unused, and the `CLUB_BANNERS` import. Tests updated.
- The branch was fast-forwarded to `master` after #24 merged.

## Checks run

- `npm run build`: passed without warnings.
- `npm test -- --watch=false`: 70 tests passed across 20 files.
- Playwright development suite: 19 passed. Production suite: 3 passed. Both ran against the installed Chromium through temporary configs.
- Screenshots with mocked preview data at 1440, 390 and 320 px: no horizontal overflow.

## Open items

None.
