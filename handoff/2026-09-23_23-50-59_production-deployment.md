# Production deployment preparation

Recorded on 2026-09-23 in Africa/Johannesburg time. Paths are relative to the repository root.

## Request

Check what remains of the plan, implement most of what production deployment needs, and open the first pull request into production (`master`). Work started from `staging` on branch `claude/production-deployment`.

## Remaining plan work (summary)

H1's deployment work is completed by this change, except the real phone upload/playback proof. Plan phases H2 to H8 (authentication and invitations, duties and evidence, cases and voting, competition administration, the Superbru adapter, closure and operations, launch readiness) are not started.

## Completed

- `apps/web/vercel.json` and `apps/api/vercel.json`: `ignoreCommand` builds only `staging` and `master`, replacing the dashboard Ignored Build Step. Web gains CSP, HSTS, `nosniff`, Referrer-Policy and Permissions-Policy headers.
- `apps/web/angular.json`: production turns off critical CSS inlining, whose `onload` handler the CSP blocks.
- `apps/web/scripts/write-environment.mjs`: production builds fail with sample data enabled or a non-HTTPS API URL.
- `apps/web/scripts/serve-dist.mjs`, `playwright.production.config.ts`, `e2e-production/production.spec.ts`, script `test:e2e:production`: serve the build with vercel.json headers/rewrites and check deep links, 404s, CSP violations and photo upload.
- API: production settings validation (HTTPS origins, DATABASE_URL), docs off in production, `nosniff` and `no-referrer` headers, relative `sslrootcert` resolution, Supabase root CA in `apps/api/certs/`.
- `supabase/migrations/20260924080000_runtime_role.sql`: `piele_api` role (NOLOGIN until an operator sets a password, NOBYPASSRLS), schema grants, default privileges, RLS policy on `external_snapshots`.
- `apps/api/tests/test_database.py`: runtime-role integration tests, skipped without `PIELE_TEST_DATABASE_URL`.
- `.github/workflows/ci.yml`: web build, unit, e2e and production e2e; API tests against PostgreSQL 17 with migrations applied.
- `scripts/smoke-deployment.mjs` (root script `smoke`) and `docs/production.md` runbook. README, API README, `.env.example` and both CLAUDE.md files updated.

## Checks run

- `uv run pytest` with `PIELE_TEST_DATABASE_URL` against local PostgreSQL 16 after applying both migrations: 26 passed.
- `ng build` (Node 22.23.2; the container's 22.22.2 is below the CLI minimum): passed, initial 408.01 kB, no warnings.
- `ng test --watch=false`: 12 passed. `playwright test` (dev server, port 4300): 13 passed. `test:e2e:production`: 3 passed. With critical CSS inlining re-enabled the production suite failed on the CSP violation, as intended.
- Smoke script against local API and dist server: all checks passed except "Bundle targets this API", expected because the local build has an empty API URL.
- Not run: CI on GitHub (runs on the PR), anything against Vercel or Supabase, TLS `verify-full` against the Supabase pooler (port 6543 is unreachable from this container).
- Playwright 1.63 expects Chromium revision 1243; the container has 1194 in `/opt/pw-browsers`. Tests ran with `PLAYWRIGHT_BROWSERS_PATH` pointing at a scratch directory that symlinks 1194 into the 1243 layout (`chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell` -> `headless_shell`). Nothing in the repository depends on this.

## Pull request

PR #1, `claude/production-deployment` into `master`: https://github.com/VictorDercksen/piele/pull/1. Open, not merged. Merging deploys to Production, so the setup below comes first.

## Production Supabase project (done later in this session)

- Supabase connector connected. Org "Pofadder Bowl" is on the free plan (two active projects). `pofadder-bowl-league` (eu-central-1) and `piele-staging` were active; `pofadder-bowl` was already paused. User decision: pause `piele-staging`. It is paused, so staging API health will fail until it is restored.
- Created `piele-production`, ref `lnifzhrdvuqskwiblmqh`, eu-west-2. URL `https://lnifzhrdvuqskwiblmqh.supabase.co`. Browser key: the `default` publishable key (`sb_publishable_...`, from the dashboard or the connector's `get_publishable_keys`).
- Applied both migrations through the connector, then renamed their versions in `supabase_migrations.schema_migrations` to `20260923184500` and `20260924080000` to match the files, so the GitHub integration treats them as applied.
- The CA certificate downloaded by the user from the production project's Database settings is byte-identical to `apps/api/certs/supabase-prod-ca-2021.crt` (Supabase Root 2021 CA, expires 2031-04-26).
- Verified: `piele_api` exists with NOLOGIN, no BYPASSRLS, not superuser; insert privilege on `piele.external_snapshots`; RLS on with one policy. Security advisors: no findings.
- Not done: the `piele_api` password (deliberately left out of the chat log; set it in the SQL editor when putting DATABASE_URL into Vercel), the GitHub integration on `master`, the Exposed schemas check, Auth URL configuration, TLS `verify-full` rehearsal (staging is paused, so rehearse on production before merging).

## Blocked: Vercel Production variables

The Vercel connector is read-only and no `VERCEL_TOKEN` is set. The user adds a Vercel access token with write access for team `victor-4043s-projects` as the environment variable `VERCEL_TOKEN` in a new session, or sets the variables by hand per `docs/production.md`. Also clear the dashboard Ignored Build Step in both projects.

Decisions still needed from the user:
1. Domains: default `piele-web.vercel.app` / `piele-api.vercel.app` or custom. `ALLOWED_ORIGINS` and `PIELE_API_URL` must match exactly.
2. Production web access: keep Vercel Authentication until sign-in exists, or public.
