# Production deployment runbook

The product is The Pavilion; Piele is the name of its first league. The infrastructure below still carries the Piele names until the operator makes the renames in [Rename to The Pavilion](#rename-to-the-pavilion).

Production is the `master` branch. Staging is the `staging` branch. Changes reach production through a pull request from `staging` (or a branch based on it) into `master`. CI (`.github/workflows/ci.yml`) must pass first.

## What deploys where

| Piece | Staging (`staging`) | Production (`master`) |
| --- | --- | --- |
| Web, Vercel project `piele-web` | Preview environment | Production environment |
| API, Vercel project `piele-api` | Preview environment | Production environment |
| Preview agent, Vercel project `piele-agent` (not created yet) | Preview environment | Production environment |
| Database, Supabase | `piele-staging` (eu-west-2, currently paused for the free-plan limit) | `piele-production`, ref `lnifzhrdvuqskwiblmqh` (eu-west-2) |
| Migrations | Supabase GitHub integration, branch `staging` | Supabase GitHub integration, branch `master` |

All three `vercel.json` files set `ignoreCommand`, so Vercel builds only `staging` and `master`. This replaces the Ignored Build Step in the dashboard, which only allowed `staging`.

## Configured in the repository

- Web: SPA rewrite for deep links, real 404s for missing files, and security headers (Content-Security-Policy, HSTS, `nosniff`, Referrer-Policy, Permissions-Policy). The CSP allows scripts only from the site itself and API calls to any HTTPS origin.
- Web build: `scripts/write-environment.mjs` fails a production build that enables sample league data or uses a non-HTTPS API URL.
- API: with `ENVIRONMENT=production` it refuses to start without HTTPS `ALLOWED_ORIGINS` and a `DATABASE_URL`, and turns off `/docs`, `/redoc` and `/openapi.json`. Every response has `Cache-Control: no-store`, `nosniff` and a request ID.
- Database: migration `20260924080000_runtime_role.sql` creates the restricted `piele_api` role (no login until an operator sets a password, no `BYPASSRLS`, grants on the `piele` schema only).
- TLS: `apps/api/certs/supabase-prod-ca-2021.crt` is Supabase's public root certificate. Add `sslmode=verify-full&sslrootcert=certs/supabase-prod-ca-2021.crt` to `DATABASE_URL` to verify the server certificate.
- Preview agent: `apps/agent` is an eve project. It needs `PIELE_API_URL` and the same `PIELE_AGENT_TOKEN` as the API in its environment; see [apps/agent/README.md](../apps/agent/README.md). Its session routes accept only the project's own Vercel OIDC tokens. Its schedule checks every 15 minutes without a model call and starts a writing session only when a fixture's teamsheets are first published; the 15-minute cron needs a paid Vercel plan.
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
| `PIELE_AGENT_TOKEN` | Optional. A random value of 32+ characters (sensitive) shared only with the preview agent. Leave unset until the agent is deployed; the `/v1/agent` routes answer 503 without it. |

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
4. Storage: create a private bucket named `evidence` (no public access, no RLS policies for anon or authenticated). The API's service role key is the only writer and signer. Profile photos live in the same bucket under `avatars/`, league emblems under `emblems/<league id>/`.
5. Bootstrap a league against the production database, as the runtime role: from `apps/api` with the production `DATABASE_URL` in the environment, run `uv run python -m app.league.bootstrap --captain-email <the captain's Google or sign-up email>`. The members file's `league`, `slug` and `competitionId` (Piele, `piele`, `urc-2026-27`) are the defaults; pass `--members-file`, `--slug`, `--name` and `--competition` for another league. It refuses to run when a league with that slug exists (Piele already does: migration `20260926160000_multi_league.sql` gave the existing league the slug `piele`). Every league has a join code. The captain (or the admin) finds the join link, `https://<web origin>/join/<code>`, on the captain's desk, and can copy it, rotate the code (the old link stops working) or close joining there; share the link and each member signs in and claims their own Superbru name in that league. The captain can reserve a name for a specific email from More > captain's desk (claimed automatically at that address's next verified sign-in), release a name the wrong account claimed, remove a member with a reason (their open duties are voided, their records kept; an unclaimed name without records is deleted) and reinstate a removed member, and set the league's emblem (a preset or an uploaded image) and accent colour.
6. Anyone with the join link can claim an unclaimed name in that league, so keep the link within the league until everyone has claimed theirs and then close joining or rotate the code from the captain's desk, or keep Google in Testing mode with the members as test users. Unclaimed names are visible only through a valid join code. The captain's desk shows who has claimed what. Every league endpoint requires a verified token of that league's member or the admin.
7. The admin. One account holds global admin rights: it opens every league, has the captain's rights in each, and runs the management centre. The API never grants it. After the admin has signed in once (which creates the account row), set it with the migration role in the Supabase SQL editor:

   ```sql
   update piele.users set is_admin = true where email = '<admin email>';
   ```

   Check that exactly one row changed. Remove it with `is_admin = false`. The admin can read a league without belonging to it, but anything recorded as done by a member (creating duties, recording standings, evidence) needs a membership in that league; the API answers `409 admin_not_a_member` until then.
8. Management centre. Signed in as the admin, open `https://<web origin>/manage` (the API's `/v1/admin` routes; every other account gets `403 admin_only`). It lists every league, archived ones included, with its captain, member counts and join code, and creates a league: name, slug, competition, time zone, season name, the members (full name and Superbru name), the captain (by email, or the admin), an optional preset emblem and accent colour, and whether to add the admin as a member outside the season. Leagues can still be created with the bootstrap command in step 5; both use the same code and refuse a taken slug. From the same page the admin renames a league or changes its time zone, archives it (every row is kept, but it leaves everyone's league list and its links and join code stop working) or restores it, appoints any member who has claimed their name as captain, and adds themselves to a league outside the season ("Add me"), after which their own actions there are recorded under that membership. Every action is in the league's audit trail with the label `admin`. Uploaded emblems live in the `evidence` bucket under `emblems/<league id>/`; preset emblems ship with the web app.

## Rename to The Pavilion

The code, package names and build output already use The Pavilion (`pavilion-web`, `pavilion-api`, `pavilion-agent`, output folder `dist/pavilion-web/browser`). These renames are outside the repository and are made by the operator:

1. GitHub: rename the repository `VictorDercksen/piele` to `VictorDercksen/pavilion`. GitHub redirects the old URL. Afterwards re-check the Vercel Git link of each project, the Supabase GitHub integration's branch mapping and the Claude Code repository scope for this project.
2. Vercel: rename the projects `piele-web`, `piele-api` and `piele-agent` to `pavilion-web`, `pavilion-api` and `pavilion-agent`. `piele-agent` does not exist yet; create it as `pavilion-agent`. Renaming changes the default `*.vercel.app` URLs, so in the same release update:
   - `ALLOWED_ORIGINS` on the API (the web origin),
   - `PIELE_API_URL` on the web (the API origin),
   - `PIELE_API_URL` on the agent (the API origin),
   - the Supabase Auth Site URL and Redirect URLs (`https://<web origin>/sign-in`) in both Supabase projects,
   - the smoke check origins and the staging URLs in the root README.

   Adding custom domains at the same time avoids changing these twice.
3. Supabase: rename the projects `piele-staging` and `piele-production` to `pavilion-staging` and `pavilion-production`. Cosmetic only: project refs, connection strings and keys do not change.

These stay as they are, on purpose:

- Environment variables keep the `PIELE_*` prefix (`PIELE_API_URL`, `PIELE_SUPABASE_URL`, `PIELE_SUPABASE_PUBLISHABLE_KEY`, `PIELE_SAMPLE_LEAGUE_DATA`, `PIELE_AGENT_TOKEN`, `PIELE_TEST_DATABASE_URL`, `PIELE_WEB_PORT`). Renaming them means re-entering every Vercel variable in both environments.
- The database schema `piele` and the runtime role `piele_api`. Renaming a schema and a role under row level security on a live database has no product benefit and real risk.
- The storage bucket `evidence`.
- The asset `piele-crest.png`, which becomes the Piele league's emblem.

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
