# First version: frontend restructure and minimal API

Recorded on 2026-09-23 in Africa/Johannesburg time. Paths are relative to the `piele` repository root.

## Request

Read the handoffs, clean up the frontend (remove the design-suggestion code, create proper components, folders and services), implement a first version, and set up a minimal backend so Supabase and Vercel can be configured. The plan is `piele-application-plan.md`.

## Completed changes

### Frontend (`apps/web`)

- Removed the design studio: `concepts.ts`, the Journal and Matchday branches of the match hero and their styles, the prototype "View as" bar, the `?demo=1` flag, `season-preview.ts` and the `league-preview` god component with its four stylesheets.
- Replaced the single-page `page()` switch with Angular Router. `app.routes.ts` has lazy routes: `/welcome` (onboarding), `/profile`, and inside the `Shell` layout `/`, `/rounds`, `/standings`, `/duties`, `/decisions`, `/more`, `/constitution`, `/captain`. Page titles come from route `data`. Navigation is links, not buttons.
- Folders: `src/app/core` (competition, league, profile, api, feedback, layout with shell, season timeline and notifications dialog), `src/app/features/<page>` (home with match hero, rounds, standings, duties with evidence dialog, decisions with vote dialog, more, constitution, captain, profile), `src/app/shared/icon`.
- Services: `CompetitionService` (URC snapshot, rounds before the current one are now `Completed`), `SelectedRoundService` (round in the `?round=` query parameter), `RoundViewService` (round-scoped league view), `ProfileStore` plus `profile-photo.ts`, `ToastService`, `ApiService` (`GET /v1/health`).
- League data seam: abstract `LeagueData` with `EmptyLeagueData` (production) and `SampleLeagueData` (development, labelled "Sample league records"). Sample records are the former demo duties, standings, polls and reviews attached to real rounds 1 to 3. Members are compared by ID, not by display name.
- Environments: `src/environments/environment.ts` (production, empty API/Supabase values, no sample data) and `environment.development.ts` (API `http://127.0.0.1:8000`, sample data), wired through `fileReplacements`.
- Guards: `profileRequired` redirects to `/welcome?returnUrl=…` (validated in-app path), `profileMissing`, `captainOnly` (navigation only).
- Styles: SCSS was mechanically flattened, stripped of dead concept selectors and split per component. Shared primitives are in `src/styles/ui.scss` (added to `angular.json` styles). The shell stylesheet was rewritten by hand. A computed-style comparison of the old and new app at 1440, 1000, 700, 390 and 320 px on Home, Rounds, Duties and Decisions found only content-driven differences. That comparison ran before two later shell edits (the round subtitle text and the order of the nav hover and selected rules), which were not re-compared.
- Behaviour changes: the fake voter initials on polls were removed (ballot privacy). Constitution and Captain's desk are pages reached from More (desktop nav gained "More"). Evidence and vote dialogs use typed reactive forms.
- `vercel.json` for the web project: `npm ci`, `npm run build`, output `dist/piele-web/browser`, SPA rewrite for paths without a file extension.
- `playwright.config.ts` reads `PIELE_WEB_PORT` (default 4200). Port 4200 on this machine was serving a different project (CtrlFleet), which `reuseExistingServer` would have tested silently.
- `scripts/import-urc.mjs` now writes to `src/app/core/competition/urc-fixtures.ts`.

### Backend (`apps/api`)

- uv project (`pyproject.toml`, `uv.lock`), exact pins: fastapi 0.141.1, pydantic-settings 2.15.0, sqlalchemy 2.0.54, psycopg[binary] 3.3.6. Dev: pytest, httpx, uvicorn, alembic.
- `app/main.py` (`create_app`, exact-origin CORS from `ALLOWED_ORIGINS`, `X-Request-ID`, `Cache-Control: no-store`), `app/config.py`, `app/db.py` (transaction pooler: psycopg driver, `prepare_threshold=None`, pool 1, `sslmode=require` default), `app/routers/health.py` (`GET /v1/health` reports `unconfigured`, `ok` or 503 `error`).
- Alembic scaffold reading `MIGRATION_DATABASE_URL`, no revisions.
- `.env.example` works without a database. `README.md` covers local run, Supabase connection strings and Vercel setup (Root Directory `apps/api`, no `vercel.json` needed per the Vercel FastAPI doc of 2026-08-27).

### Repository

- `apps/web/README.md` no longer describes a design preview.
- Root `package.json`: `api`, `test:api`, `setup:api` scripts. `.gitignore`: `.pytest_cache/`. README rewritten. `apps/web/CLAUDE.md` and `apps/api/CLAUDE.md` updated to describe the current state.

## Checks run

- `ng build` (production): passed, no warnings, initial bundle 364.72 kB.
- `ng test --watch=false`: 4 files, 10 tests passed.
- `PIELE_WEB_PORT=4300 npx playwright test`: 7 passed, three consecutive runs after scoping the profile upload locator. One earlier run failed because the home page's evidence input matched an unscoped `input[type=file]` locator.
- `uv run pytest` in `apps/api`: 7 passed, 1 Starlette deprecation warning about httpx.
- Local end-to-end: API on port 8000 with `ALLOWED_ORIGINS=http://127.0.0.1:4300`; the More page showed "League API: Online · database not configured".
- Not done: no Supabase project, no Vercel deployment, no commit.

## Unresolved and next steps

1. Create the Supabase project and the two Vercel projects (see `apps/api/README.md` and root README). Set the production `apiUrl`, `supabaseUrl` and `supabasePublishableKey` in `apps/web/src/environments/environment.ts` after the API URL exists.
2. `sslmode=require` encrypts but does not verify the certificate. The plan asks for verification where supported.
3. The Vercel rewrite pattern has not been exercised on a real deployment. Check a deep link such as `/duties?round=2` and a missing asset after the first deploy.
4. H2 (identity): Supabase Auth, JWT verification in FastAPI, `GET /v1/me`, and an HTTP `LeagueData` implementation.
5. The previous handoffs' `npm audit` findings in the Spartan CLI chain are unchanged. No Spartan Helm components were generated.
