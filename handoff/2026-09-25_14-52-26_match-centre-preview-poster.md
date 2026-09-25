# Match centre preview redesign and layout

Recorded on 25 September 2026 in Africa/Johannesburg time.

## Request

Make the Piele Preview on the match centre page less bland, offering five designs to choose from. Make the preview sources a dropdown that is closed by default. Improve the arrangement of the teamsheets, kickoff forecast and Piele Preview.

## Completed

- Five preview designs were built and screenshotted: broadcast, programme, momentum, tale of the tape and poster. The user chose **poster**. The other four were removed, and the exploration commit stays in the branch history.
- Poster design (`features/match/match-preview`): ground photo under a dark scrim, washed in the home club's accent from the left and the away club's from the right. Both crests flank a "Piele's read." title, with the summary centred beneath. Each side has a glass card with a mood chip, a five-step mood meter and numbered factors in the club accent.
- `previewView` accepts optional home and away club ids and adds `accent`, `crest` and `mood.step` (1 to 5) to each side. `MatchPreview` takes `homeClub` and `awayClub` inputs, which the page passes from `fixture.homeAsset` and `fixture.awayAsset`.
- Sources sit in a native `<details>` disclosure, closed by default, showing the count and a chevron.
- Layout (`match.page.html/.scss`): the preview and kickoff forecast share the top row (1.8fr and 1fr). The forecast stretches to the row's height with its reading centred in the sky. Teamsheets run full width below. Without a preview (builds without Supabase), the forecast becomes a full-width strip with its facts in one row. Below 900 px the order is preview, forecast, teamsheets.
- The preview now renders only once match centre data has loaded, not in the centre's failed or loading state.

## Checks run

- `npm test -- --watch=false`: 70 tests passed across 20 files, including new tests for the closed sources disclosure, mood meter fill and club artwork.
- `npm run build`: passed without warnings.
- Playwright, full development suite: 19 passed. It ran against the installed Chromium through a temporary config, because the pinned headless shell is not installed in this container.
- Manual screenshots at 1440, 390 and 320 px with mocked preview data: no horizontal overflow, and sources start closed.
- The container's Node 22.22.2 is below the Angular CLI minimum, so the checks ran under Node 22.22.3.

## Open items

- The e2e suite does not cover the preview, because it only renders in builds with Supabase sign-in.
