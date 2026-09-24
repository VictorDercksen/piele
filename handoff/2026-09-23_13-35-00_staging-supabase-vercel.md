# Staging on Supabase and Vercel

Recorded on 2026-09-23 in Africa/Johannesburg time. Paths are relative to the `piele` repository root.

## Request

Set up Supabase and Vercel for staging only. Decisions: staging is Vercel's Preview environment for the `staging` branch (Production stays reserved for `master`), London region, web previews behind Vercel login, API open.

## Completed

- Paused by the user: Supabase project `pofadder-bowl`, to stay within the free-plan limit of two active projects.
- Supabase project `piele-staging`, ref `kuvrhmiaynamccukrziv`, region eu-west-2, org "Pofadder Bowl". Database password and connection strings are in `apps/api/.env.staging` (Git-ignored, local only). Runtime uses the transaction pooler `aws-0-eu-west-2.pooler.supabase.com:6543`. `aws-1` does not serve this project.
- Vercel team `victor-4043s-projects`: projects `piele-web` (root `apps/web`, Angular) and `piele-api` (root `apps/api`, FastAPI), linked to `VictorDercksen/piele`, production branch `master`. Both have an Ignored Build Step that builds only `staging`: `[ "$VERCEL_GIT_COMMIT_REF" != "staging" ]`.
- Deployment protection: Vercel Authentication stays on for `piele-web`. It is disabled for `piele-api`.
- Preview environment variables scoped to the `staging` branch:
  - `piele-api`: `ENVIRONMENT=staging`, `ALLOWED_ORIGINS` (the web staging URL), `DATABASE_URL` (sensitive), `SUPABASE_URL`, `SUPABASE_JWT_AUDIENCE`.
  - `piele-web`: `PIELE_API_URL`, `PIELE_SUPABASE_URL`, `PIELE_SUPABASE_PUBLISHABLE_KEY`, `PIELE_SAMPLE_LEAGUE_DATA=true`.
- Code: `apps/web/scripts/write-environment.mjs` writes `environment.ts` from those variables on Vercel builds only. Fixed invalid JSON in `apps/web/vercel.json`. `apps/api/vercel.json` sets region `lhr1`. `.gitignore` covers `supabase/.temp/`. Commits `9d6dbbf` and `7950c9a` on `staging`.
- On first link Vercel created production deployments of commit `9d6dbbf`. The web one failed (no variables). The API one was live at `piele-api.vercel.app` without database settings and was deleted.

## Checks run

- psycopg connection to the transaction pooler: `select version()` returned PostgreSQL 17.6.
- Web staging build log: "Wrote environment for preview.", initial bundle 364.86 kB.
- `GET https://piele-api-git-staging-victor-4043s-projects.vercel.app/v1/health` with the web origin: 200, `{"status":"ok","environment":"staging","database":"ok"}`, CORS allow-origin matched, served from `lhr1`.
- `https://piele-web-git-staging-victor-4043s-projects.vercel.app/duties`: 302 to Vercel login, as intended.
- `https://piele-api.vercel.app/v1/health`: 404 after the deletion.
- The user opened the web staging URL while logged in to Vercel and confirmed the app works.
- Not checked by the agent: the SPA deep-link rewrite after login and the More page's API status on staging.

## Vercel email about a failed production deployment

Vercel emailed "Production deployment failed" for `piele-web`, branch `staging`, commit `9d6dbbf`. This is the one-off production deployment Vercel created when the project was first linked. It failed because the production environment has no variables, as intended. Pushes to `staging` now create Preview deployments only, and the Ignored Build Step skips every other branch, so no further production builds run. The failed deployment record remains in the `piele-web` project and can be deleted.

## Next steps

1. Check a deep link such as `/duties?round=2` and the More page's API status on staging.
2. The runtime uses the `postgres` role. The plan requires a restricted non-owner role without `BYPASSRLS` before real data.
3. When production is set up: create a production Supabase project, add Production variables, remove the Ignored Build Step and decide on domains.
4. Supabase Auth redirect URLs must include the web staging URL when sign-in is built.
