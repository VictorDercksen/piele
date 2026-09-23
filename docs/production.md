# Production deployment runbook

Production is the `master` branch. Staging is the `staging` branch. Changes reach production through a pull request from `staging` (or a branch based on it) into `master`. CI (`.github/workflows/ci.yml`) must pass first.

## What deploys where

| Piece | Staging (`staging`) | Production (`master`) |
| --- | --- | --- |
| Web, Vercel project `piele-web` | Preview environment | Production environment |
| API, Vercel project `piele-api` | Preview environment | Production environment |
| Database, Supabase | `piele-staging` (eu-west-2) | Dedicated production project, same region |
| Migrations | Supabase GitHub integration, branch `staging` | Supabase GitHub integration, branch `master` |

Both `vercel.json` files set `ignoreCommand`, so Vercel builds only `staging` and `master`. This replaces the Ignored Build Step in the dashboard, which only allowed `staging`.

## Configured in the repository

- Web: SPA rewrite for deep links, real 404s for missing files, and security headers (Content-Security-Policy, HSTS, `nosniff`, Referrer-Policy, Permissions-Policy). The CSP allows scripts only from the site itself and API calls to any HTTPS origin.
- Web build: `scripts/write-environment.mjs` fails a production build that enables sample league data or uses a non-HTTPS API URL.
- API: with `ENVIRONMENT=production` it refuses to start without HTTPS `ALLOWED_ORIGINS` and a `DATABASE_URL`, and turns off `/docs`, `/redoc` and `/openapi.json`. Every response has `Cache-Control: no-store`, `nosniff` and a request ID.
- Database: migration `20260924080000_runtime_role.sql` creates the restricted `piele_api` role (no login until an operator sets a password, no `BYPASSRLS`, grants on the `piele` schema only).
- TLS: `apps/api/certs/supabase-prod-ca-2021.crt` is Supabase's public root certificate. Add `sslmode=verify-full&sslrootcert=certs/supabase-prod-ca-2021.crt` to `DATABASE_URL` to verify the server certificate.
- Smoke check: `npm run smoke -- --web <origin> --api <origin>` from the repository root.

## One-time setup, in order

### 1. Rehearse on staging

1. Merge the deployment changes into `staging`. The Supabase integration applies the runtime-role migration to `piele-staging`.
2. In the `piele-staging` SQL editor, run `alter role piele_api with login password '<generated password>';`. Store the password in a password manager.
3. In `piele-api` > Settings > Environment Variables (Preview, branch `staging`), change `DATABASE_URL` to
   `postgresql://piele_api.<staging-ref>:<password>@aws-0-eu-west-2.pooler.supabase.com:6543/postgres?sslmode=verify-full&sslrootcert=certs/supabase-prod-ca-2021.crt`
   and redeploy.
4. Check `/v1/health` reports `"database": "ok"` and `"snapshotCache": "database"`. If TLS verification fails, the response is 503 and the function log names the error type. Fall back to `sslmode=require` and report it; do not use `sslmode=disable`.
5. Run `npm run smoke -- --web <staging web URL> --api <staging API URL> --environment staging` with `VERCEL_AUTOMATION_BYPASS_SECRET` set, because the staging web is behind Vercel Authentication.

### 2. Create the production database

1. Create a Supabase project, for example `piele-production`, in eu-west-2 (London), next to the API's `lhr1` region. The free plan allows two active projects; `pofadder-bowl` is paused.
2. Settings > API: confirm `piele` is not in Exposed schemas.
3. Integrations > GitHub: connect this repository, Supabase directory `supabase`, production branch `master`. Migrations then apply on each push to `master`. To apply them before the first merge instead, run `supabase link --project-ref <ref>` and `supabase db push` from the repository root.
4. After the migrations run, set the `piele_api` password as in step 1.2, with a different password.
5. Auth > URL Configuration: set the Site URL to the production web origin (needed once sign-in is built).

### 3. Configure Vercel Production variables

`piele-api`, Production environment:

| Variable | Value |
| --- | --- |
| `ENVIRONMENT` | `production` |
| `ALLOWED_ORIGINS` | The production web origin, e.g. `https://piele-web.vercel.app` |
| `DATABASE_URL` | Runtime role URL for the production project, as in step 1.3 (sensitive) |
| `SUPABASE_URL` | `https://<production-ref>.supabase.co` |

`piele-web`, Production environment:

| Variable | Value |
| --- | --- |
| `PIELE_API_URL` | The production API origin, e.g. `https://piele-api.vercel.app` |
| `PIELE_SUPABASE_URL` | `https://<production-ref>.supabase.co` |
| `PIELE_SUPABASE_PUBLISHABLE_KEY` | The production publishable key |

Do not set `PIELE_SAMPLE_LEAGUE_DATA` in Production. Never copy staging credentials into Production or production credentials into Preview.

In both projects, clear Settings > Git > Ignored Build Step; `vercel.json` now owns it. Decide on custom domains before the first release, because `ALLOWED_ORIGINS` and `PIELE_API_URL` must match them exactly.

### 4. Decide production access

The application has no sign-in yet (plan phase H2). Profiles live in each browser and production shows only the published URC schedule. Either keep Vercel Authentication on the production web deployment until sign-in exists, or make it public knowingly. The API serves only health and public match-centre data.

## Each release

1. Open a pull request from `staging` into `master`. Wait for CI.
2. Merge. Vercel builds both projects and the Supabase integration applies new migrations. Migrations must be additive so the running code keeps working while they apply.
3. Run `npm run smoke -- --web <production web origin> --api <production API origin>`. All checks must pass.
4. Bring `staging` level with `master` if the release was merged from another branch.

## Rollback

- Code: Vercel > project > Deployments > previous production deployment > Instant Rollback, for each project affected.
- Database: migrations are forward-only. Write a new migration that reverses the change and release it the same way. Restore from a Supabase backup only for data loss, and follow the plan's retention rules for purged media once that exists.

## Not yet production-ready

This release completes plan phase H1's deployment work. The plan's H8 launch gate still needs authentication and invitations (H2), duties and private evidence (H3), cases and voting (H4), competition administration (H5), closure and operations (H7), a restore rehearsal and the acceptance tests in plan section 12.
