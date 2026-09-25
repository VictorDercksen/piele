# Stadium artwork in the match hero

Recorded on 25 September 2026 in Africa/Johannesburg time.

## Request and completed work

The user selected proposal O4 from five stadium-background concepts and requested implementation and a running development server.

Imported all 16 supplied match-night images from `C:/Users/victo/Documents/Codex/2026-09-25/cou-2/outputs/urc-match-night-pack` into `apps/web/public/assets/images/match-nights/`. The original 1536 x 1024 dimensions are preserved as WebP, quality 82, totalling 4.43 MiB. Filenames use existing club IDs. `sources.json` preserves the supplied provenance, original filenames and generated-scene notes.

Extended the existing venue catalogue in `core/competition/stadiums.ts` with artwork for each club's primary ground. Selection follows the fixture's actual venue, so alternate or unknown grounds retain the generic background instead of showing an incorrect home ground. The match artwork preloader now includes the stadium background in coordinated fixture switches.

Updated the shared `features/home/match-hero` component used on the clubhouse and match-centre pages. The upper stadium area is unobstructed. Compact crests, team names and the score sit over a darker lower gradient with restrained team-colour panels. Venue icons and match links remain. Failed background loads fall back to the existing generic scene. The page-wide shell background was not changed.

## Verification

- Angular MCP production build passed without warnings. Initial bundle: 633.20 kB.
- Targeted Vitest tests: 9 passed across stadiums and match-artwork.
- Playwright profile-and-layout tests: 4 passed, including team changes, asset loading, image validation and layouts from 1440px to 320px.
- Playwright season-timeline tests: 8 passed, covering round and fixture selection, keyboard/mobile navigation and existing league journeys.
- Additional browser checks verified all 16 artwork URLs, the match-centre background and fallback after an intentionally failed image request.
- Visually inspected desktop and mobile hero screenshots in `outputs/o4-hero.png` and `outputs/o4-mobile.png`. Preview outputs remain separate from application assets.

## Development server and environment

Angular MCP development server remains running at `http://localhost:4200/` for `piele-web` in `apps/web`.

The initial build failed because installed dependencies lagged behind the pulled package manifest. Ran `npm install --ignore-scripts --no-audit --no-fund` with a workspace-local cache and restored 14 packages. Package manifests and lockfile are unchanged. Restarted the MCP server after restoring dependencies.

The default Playwright config targets 127.0.0.1, while this MCP server listens on localhost. The initial default test command attempted to start a separate server and encountered sandbox filesystem errors. Stopped that attempt and ran tests against the existing server using the ignored `apps/web/.angular/stadium-playwright.config.ts`, which changes only baseURL, test output paths and disables automatic server startup.

Angular MCP `get_best_practices` still returns `Unexpected response type`. Read and followed the repository Angular guide. No deployment or commit was requested or performed. Next step is the user's visual review.
