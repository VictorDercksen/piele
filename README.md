# The Pavilion

The Pavilion is a private rugby league clubhouse. Its first league is Piele, which predicts URC 26/27 on Superbru. Angular frontend (Floodlights design), a Python FastAPI backend and a preview agent, deployed as Vercel projects against Supabase PostgreSQL.

The product was called Piele until September 2026; Piele is now the name of the first league only. Environment variables (`PIELE_*`), the `piele` database schema, the `piele_api` role and the `piele-crest.png` asset keep their names. The infrastructure renames the operator still has to make are listed in [docs/production.md](docs/production.md#rename-to-the-pavilion).

## Run

From this directory:

- Node 24 (`.nvmrc`; `nvm use` picks it up). Angular CLI needs Node 22.22.3+, 24.15+ or 26.
- `npm run setup` and `npm start` run the frontend at http://localhost:4200.
- `npm run setup:api` and `npm run api` run the API at http://127.0.0.1:8000. See [apps/api/README.md](apps/api/README.md).

Members sign in with Google or an email and password (Supabase Auth); a new member opens the league's join link and claims their own Superbru name from that league's unclaimed names; an account can belong to several leagues and switches between them by URL (`/<league slug>/...`). First-time visitors then choose a favourite team. The home page shows the featured match, the member's next duty, standings and the league feed (this round or the whole season). The duty register lists each duty's deadline, house marks and evidence trail; members upload evidence videos, and the captain creates and voids duties, resets a duty's clock when a challenge is upheld, records evidence for members, decides evidence and manages the team sheet (reservations and releases) from the captain's desk. The development build uses labelled sample league records without sign-in; the production build talks to the league API.

The frontend uses Angular 22.1.7 with CLI 22.1.8. Use a compatible Node 22.22.3+, 24.15+ or 26 release. The API needs Python 3.12+ and uv.

## Structure

- `apps/web`: Angular app. `src/app/core` holds services, layout and data sources, `src/app/features` holds one folder per page, `src/app/shared` holds reusable components. Read its `AGENTS.md` and `CLAUDE.md` before changes.
- `apps/api`: FastAPI app with `GET /v1/health`; the competition routes under `/v1/competitions/{competitionId}` (`matches/{fixtureId}`: teamsheets, kickoff forecast and live score timeline for one fixture, cached in PostgreSQL; `rounds/{round}/scores`: live scores for a round; `matches/{fixtureId}/preview`: the Pavilion match preview; `rounds/{round}/updates`: teamsheets, previews, kick-offs and results for the notifications panel); the account routes `GET /v1/me` (the account and its leagues) and `GET`/`POST /v1/join/{code}` (join a league by its code); the league endpoints under `/v1/leagues/{leagueId}` (me, members, Superbru standings, duties, marks, evidence, feed) behind Supabase Auth token verification; and the preview agent's token-protected `/v1/agent` routes. See [apps/api/README.md](apps/api/README.md) for the bootstrap command and Storage setup.
- `apps/agent`: the preview agent, an eve project that researches each fixture and stores a sourced match preview through the API's `/v1/agent` routes. See [apps/agent/README.md](apps/agent/README.md).
- `backtest`: the planned Jev backtest over past URC seasons (Phase F). Not implemented yet; see [backtest/README.md](backtest/README.md).
- `docs`: operating instructions, starting with the production runbook.
- `supabase`: SQL migrations applied to the Supabase project by its GitHub integration on pushes to the connected branch. Application tables live in the private `piele` schema.
- `fixtures`: Official public URC schedule snapshot and provenance.

The schedule contains 144 regular-season fixtures and seven playoff slots for 2026/27, checked on 23 September 2026. Times display in the league's time zone (SAST for Piele, the default). Playoff teams and kickoffs remain TBC. This is a local snapshot, not live synchronization; live scores and results come from the API during and after each match. The frontend polls a round's scores every 30 seconds while one of its matches is in play and the tab is visible.

Favourite team and photo are saved to the member's league account (photos in the private Storage bucket), so they follow the member to every device; the sample-data development build keeps them in the browser. The display name is the member's Superbru nickname from the league. Evidence videos upload directly to a private Supabase Storage bucket with an API-issued grant.

The asset pack contains 12 team jerseys. Edinburgh, Leinster, Lions and Ospreys use illustrated supporter-shirt SVGs. These are visual placeholders, not official season kit reproductions.

## Deploy

Vercel projects in team `victor-4043s-projects`, linked to this repository. The projects still carry their Piele names until the operator renames them to `pavilion-web`, `pavilion-api` and `pavilion-agent` (see [Rename to The Pavilion](docs/production.md#rename-to-the-pavilion)):

| Project | Root | Staging URL |
| --- | --- | --- |
| `piele-web` | `apps/web` | https://piele-web-git-staging-victor-4043s-projects.vercel.app (Vercel login required) |
| `piele-api` | `apps/api` | https://piele-api-git-staging-victor-4043s-projects.vercel.app/v1/health |
| `piele-agent` | `apps/agent` | Not created yet. See [apps/agent/README.md](apps/agent/README.md). |

Staging is Vercel's Preview environment for the `staging` branch and uses the Supabase project `piele-staging` (London). Production is the `master` branch with its own Supabase project. Each `vercel.json` limits builds to these two branches. Setup, releases and rollback are in [docs/production.md](docs/production.md).

The web build runs `scripts/write-environment.mjs`, which creates the browser config from the `PIELE_API_URL`, `PIELE_SUPABASE_URL`, `PIELE_SUPABASE_PUBLISHABLE_KEY` and `PIELE_SAMPLE_LEAGUE_DATA` variables. API variables are described in [apps/api/README.md](apps/api/README.md). Local staging secrets live in `apps/api/.env.staging`, which Git ignores.

The More page reports whether the frontend can reach the API and whether the API reaches the database.

## Verify

- `npm run build`, `npm test` and `npm run test:e2e` for the frontend. If another app uses port 4200, set `PIELE_WEB_PORT` (for example `PIELE_WEB_PORT=4300`) before `test:e2e`.
- `npm --prefix apps/web run test:e2e:production` after a build checks the production bundle under the `vercel.json` headers and rewrites.
- `npm run test:api` for the backend. Database tests run when `PIELE_TEST_DATABASE_URL` is set; see [apps/api/README.md](apps/api/README.md).
- `npm run test:agent`, plus `typecheck` and `build` in `apps/agent`, for the preview agent.
- `npm run smoke -- --web <origin> --api <origin>` checks a deployed environment.

CI (`.github/workflows/ci.yml`) runs all of these except the smoke check on pull requests into `staging` and `master`, and applies `supabase/migrations` to PostgreSQL 17 before the API tests.

From `apps/web`, `node scripts/import-urc.mjs` validates and converts the saved official fixture response. See `fixtures/README.md` for the source query.
