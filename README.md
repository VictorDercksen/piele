# Piele

Private league application for Piele URC 26/27. Angular frontend (Floodlights design) and a Python FastAPI backend, deployed as two Vercel projects against Supabase PostgreSQL.

## Run

From this directory:

- `npm run setup` and `npm start` run the frontend at http://localhost:4200.
- `npm run setup:api` and `npm run api` run the API at http://127.0.0.1:8000. See [apps/api/README.md](apps/api/README.md).

First-time visitors choose a name and favourite team. The development build shows labelled sample league records (standings, duties, votes and a captain's desk) for rounds 1 to 3. The production build shows only the published URC schedule until the league API supplies records.

The frontend uses Angular 22.1.7 with CLI 22.1.8. Use a compatible Node 22.22.3+, 24.15+ or 26 release. The API needs Python 3.12+ and uv.

## Structure

- `apps/web`: Angular app. `src/app/core` holds services, layout and data sources, `src/app/features` holds one folder per page, `src/app/shared` holds reusable components. Read its `AGENTS.md` and `CLAUDE.md` before changes.
- `apps/api`: FastAPI app with `GET /v1/health`, Supabase pooler configuration and an Alembic scaffold.
- `fixtures`: Official public URC schedule snapshot and provenance.

The schedule contains 144 regular-season fixtures and seven playoff slots for 2026/27, checked on 23 September 2026. Times display in SAST. Playoff teams and kickoffs remain TBC. This is a local snapshot, not live synchronization.

Profiles and photos persist only in this browser. There is no authentication or server upload yet.

The asset pack contains 12 team jerseys. Edinburgh, Leinster, Lions and Ospreys use illustrated supporter-shirt SVGs. These are visual placeholders, not official season kit reproductions.

## Deploy

Create two Vercel projects from this repository:

1. **Web**: Root Directory `apps/web`. `apps/web/vercel.json` sets the build, output directory and deep-link rewrite. Before deploying, set `apiUrl`, `supabaseUrl` and `supabasePublishableKey` in `apps/web/src/environments/environment.ts`. These are public browser values. Never put service keys or database URLs there.
2. **API**: Root Directory `apps/api`. Set its environment variables as described in [apps/api/README.md](apps/api/README.md), including the web origin in `ALLOWED_ORIGINS`.

The More page reports whether the frontend can reach the API and whether the API reaches the database.

## Verify

- `npm run build`, `npm test` and `npm run test:e2e` for the frontend. If another app uses port 4200, set `PIELE_WEB_PORT` (for example `PIELE_WEB_PORT=4300`) before `test:e2e`.
- `npm run test:api` for the backend.

From `apps/web`, `node scripts/import-urc.mjs` validates and converts the saved official fixture response. See `fixtures/README.md` for the source query.
