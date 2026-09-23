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
- Not run: CI on GitHub (runs on the PR), anything against Vercel or Supabase (blocked from this container), TLS `verify-full` against the Supabase pooler.

## Next steps for the user

Follow `docs/production.md`: rehearse the runtime role and `verify-full` on staging, create the production Supabase project, set Vercel Production variables, clear the dashboard Ignored Build Step, decide domains and production access, then merge and run the smoke check. Bring `staging` level with `master` after the merge.
