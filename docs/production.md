# Production deployment runbook

Production is the `master` branch. Staging is the `staging` branch. Changes reach production through a pull request from `staging` (or a branch based on it) into `master`. CI (`.github/workflows/ci.yml`) must pass first.

## What deploys where

| Piece | Staging (`staging`) | Production (`master`) |
| --- | --- | --- |
| Web, Vercel project `piele-web` | Preview environment | Production environment |
| API, Vercel project `piele-api` | Preview environment | Production environment |
| Database, Supabase | `piele-staging` (eu-west-2, currently paused for the free-plan limit) | `piele-production`, ref `lnifzhrdvuqskwiblmqh` (eu-west-2) |
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

1. Done: `piele-production` (ref `lnifzhrdvuqskwiblmqh`, eu-west-2) exists and both migrations are applied. The free plan allows two active projects, so `piele-staging` is paused; restore it (pausing another project) before rehearsing on staging.
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
| `SUPABASE_SERVICE_ROLE_KEY` | The production service role key (sensitive). Needed for evidence upload grants and playback. |
| `SUPABASE_STORAGE_BUCKET` | `evidence` (create it as a private bucket first) |
| `SUPABASE_JWT_SECRET` | Only if the project still signs tokens with the legacy shared secret; leave unset for JWT signing keys (JWKS) |

`piele-web`, Production environment:

| Variable | Value |
| --- | --- |
| `PIELE_API_URL` | The production API origin, e.g. `https://piele-api.vercel.app` |
| `PIELE_SUPABASE_URL` | `https://<production-ref>.supabase.co` |
| `PIELE_SUPABASE_PUBLISHABLE_KEY` | The production publishable key |

Do not set `PIELE_SAMPLE_LEAGUE_DATA` in Production. Never copy staging credentials into Production or production credentials into Preview.

In both projects, clear Settings > Git > Ignored Build Step; `vercel.json` now owns it. Decide on custom domains before the first release, because `ALLOWED_ORIGINS` and `PIELE_API_URL` must match them exactly.

### 4. Sign-in, membership and evidence storage

1. Supabase > Authentication > Providers: enable Email (keep "Confirm email" on) and Google. Google needs an OAuth client in Google Cloud with the Supabase callback URL (`https://<ref>.supabase.co/auth/v1/callback`) as an authorised redirect URI; paste its client ID and secret into the provider.
2. Authentication > URL Configuration: set the Site URL to the production web origin and add `https://<web origin>/sign-in` (and the staging origin's `/sign-in`) to Redirect URLs. OAuth returns to `/sign-in?returnUrl=…`.
3. Settings > JWT Keys: projects on JWT signing keys need nothing more; the API verifies against `/auth/v1/.well-known/jwks.json`. A project still on the legacy secret needs `SUPABASE_JWT_SECRET` on the API.
4. Storage: create a private bucket named `evidence` (no public access, no RLS policies for anon or authenticated). The API's service role key is the only writer and signer. Profile photos live in the same bucket under `avatars/`.
5. Bootstrap the league once against the production database, as the runtime role: from `apps/api` with the production `DATABASE_URL` in the environment, run `uv run python -m app.league.bootstrap --captain-email <the captain's Google or sign-up email>`. It refuses to run twice. Then share the web link: each member signs in and claims their own Superbru name. The captain can reserve a name for a specific email from More > captain's desk, and release a name the wrong account claimed.
6. Any signed-in account can claim an unclaimed name, so keep the link within the league until everyone has claimed theirs, or keep Google in Testing mode with the members as test users. The captain's desk shows who has claimed what. Every league endpoint requires a verified member token.

## Each release

1. Open a pull request from `staging` into `master`. Wait for CI.
2. Merge. Vercel builds both projects and the Supabase integration applies new migrations. Migrations must be additive so the running code keeps working while they apply.
3. Run `npm run smoke -- --web <production web origin> --api <production API origin>`. All checks must pass.
4. Bring `staging` level with `master` if the release was merged from another branch.

## Rollback

- Code: Vercel > project > Deployments > previous production deployment > Instant Rollback, for each project affected.
- Database: migrations are forward-only. Write a new migration that reverses the change and release it the same way. Restore from a Supabase backup only for data loss, and follow the plan's retention rules for purged media once that exists.

## Not yet production-ready

H1 (deployment), the sign-in and membership core of H2 and the duties, marks and evidence core of H3 are in place. Still outstanding for the plan's H8 launch gate: invitations by token and captain transfer (H2), pause intervals, corrections and a real phone upload and playback proof against a live bucket (H3), cases and voting (H4), competition administration and the Superbru sync that proposes Spoon duties (H5), closure, media retention and operations (H7), a restore rehearsal and the acceptance tests in plan section 12.
