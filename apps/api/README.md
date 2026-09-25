# Piele API

FastAPI backend for Piele. Routes live under `/v1`:

- `GET /v1/health` reports the environment and database status.
- `GET /v1/memberships/unclaimed` and `POST /v1/memberships/claim`: any verified sign-in lists the Superbru names nobody has claimed and claims one.
- League endpoints, all requiring a Supabase access token from an active member (`Authorization: Bearer …`): `GET /v1/me` (includes the member's favourite team and a short-lived photo URL), `POST /v1/me/photo/uploads` (photo upload grant) and `PUT /v1/me/profile` (own favourite team and photo); `GET /v1/members`, `POST /v1/members`, `PATCH /v1/members/{id}` (reserve a name for an email) and `POST /v1/members/{id}/release` (captain); `GET /v1/duties?round=`, `POST /v1/duties` and `POST /v1/duties/{id}/void` and `POST /v1/duties/{id}/reset-clock` (captain), `GET /v1/duties/default-deadline`; `GET /v1/marks`; `POST /v1/evidence/uploads` (upload grant), `POST /v1/evidence` (publish a submission), `POST /v1/evidence/links/{id}/decision` (uninvolved captain), `GET /v1/evidence/assets/{id}/playback`; `GET /v1/feed?round=`. Every mutation writes its audit event and feed entry in the same transaction. See `app/league/`.
- `GET /v1/matches/{fixtureId}` returns the match centre for one published fixture: teamsheets from the public URC feed and the kickoff-hour forecast from Open-Meteo. Each section carries its own `status` (`ok`, `not_published`, `too_early`, `past` or `unavailable`), so a provider outage never fails the request. Weather is fetched only inside the week before kickoff, teamsheets from three days out. Responses are cached in the `piele.external_snapshots` table (weather 3 h, teamsheets 6 h once published) or in process memory when no database is configured. The fixture list comes from `app/data/urc_fixtures.json`, written by `apps/web/scripts/import-urc.mjs`.

## Run locally

Requires Python 3.12+ and [uv](https://docs.astral.sh/uv/).

```bash
cd apps/api
uv sync                      # creates .venv from uv.lock
cp .env.example .env         # works as-is without a database
uv run uvicorn app.main:app --reload --port 8000
```

Open http://localhost:8000/v1/health or http://localhost:8000/docs.

## Test

```bash
uv run pytest
```

`tests/test_database.py` needs PostgreSQL with the migrations applied and connects as the runtime role. It is skipped unless `PIELE_TEST_DATABASE_URL` is set:

```bash
for f in ../../supabase/migrations/*.sql; do psql -v ON_ERROR_STOP=1 -f "$f"; done
psql -c "alter role piele_api with login password 'local'"
PIELE_TEST_DATABASE_URL="postgresql://piele_api:local@127.0.0.1:5432/postgres?sslmode=disable" uv run pytest
```

## Authentication, membership and evidence

Members sign in with Supabase Auth (Google or email and password) in the web app. The API verifies each access token's signature, issuer, audience and expiry (`app/league/auth.py`), then resolves the account's league membership inside the request transaction with transaction-local row level security context (`app/league/context.py`). A signed-in account without a membership gets `403 not_a_member` and claims its own Superbru name from the unclaimed list. A name the captain reserved for an email (`invited_email`) is claimed automatically, and only, by a verified sign-in with that address. The captain can release a wrong claim. Captain authority is the league's `captain_membership_id`, never a role column.

Bootstrap the league once per database with the captain's sign-in email, which reserves the captain's name; members come from `app/data/league_members.json` (Superbru nicknames as display names) and claim their own names after signing in:

```bash
uv run python -m app.league.bootstrap --captain-email captain@example.com
```

Evidence videos go straight from the browser to a private Supabase Storage bucket (`SUPABASE_STORAGE_BUCKET`, default `evidence`) using a signed upload grant the API issues after checking membership, type and size. The API needs `SUPABASE_SERVICE_ROLE_KEY` for grants, object checks and short-lived playback URLs. Create the bucket as private in the dashboard; nothing creates it automatically.

Profile photos use the same bucket under `avatars/<user id>/`. The web app crops the photo to a 384 px JPEG and uploads it with a grant from `POST /v1/me/photo/uploads`; `PUT /v1/me/profile` accepts only a path under the caller's own prefix, checks the stored object's size and JPEG signature (not the uploader's type claim), and removes the replaced photo. The favourite team is checked against the club catalogue and stored on `piele.users`, so it follows the member to every device.

House marks: one mark per full 168 hours a duty stays overdue, stopping at the accepted completion time or actual season closure (`app/league/marks.py`). A challenge never pauses accrual; when one is resolved in the member's favour the captain resets the clock, which clears the elapsed time and restarts it from that moment. The API is the only calculator; the web app formats its values.

## Connect Supabase

1. Create a project at https://supabase.com/dashboard. Pick the region closest to where the Vercel function will run, and store the database password in a password manager.
2. Open **Connect** on the project page and copy the **Transaction pooler** connection string (port 6543) into `DATABASE_URL`, replacing `[YOUR-PASSWORD]`. The API uses this at runtime.
3. Copy the project URL (`https://<ref>.supabase.co`) into `SUPABASE_URL`.
4. Put these in `apps/api/.env` (uncomment the database line), run the app and check that `/v1/health` reports `"database": "ok"`.

The runtime URL should use the restricted `piele_api` role, not `postgres`. The migration creates the role without a password. Enable it once per project in the SQL editor with `alter role piele_api with login password '<generated>';`, then connect through the pooler as `piele_api.<project-ref>`.

`sslmode=require` encrypts without checking the server certificate. To verify it, add the query parameters `sslmode=verify-full&sslrootcert=certs/supabase-prod-ca-2021.crt`. The relative path resolves against this directory.

## Migrations

Schema changes are SQL files in the repository root's `supabase/migrations/`, the single migration history. The Supabase GitHub integration applies them to the linked project on pushes to the connected branch; nothing runs at API startup. Application tables live in the private `piele` schema, which must stay out of the Data API's exposed schemas. The first migration, `20260923184500_external_snapshots.sql`, creates the provider cache table.

To apply migrations by hand, install the Supabase CLI and run `supabase link` then `supabase db push` from the repository root.

## Deploy to Vercel

1. In Vercel, choose **Add New > Project** and import this repository.
2. Set **Root Directory** to `apps/api`. Vercel detects FastAPI from `pyproject.toml`, installs dependencies from `pyproject.toml` and `uv.lock`, and loads `app` from `app/main.py`. No `vercel.json` or `requirements.txt` is needed.
3. Under **Environment Variables**, set:
   - `ENVIRONMENT` (`production` or `staging`). `production` refuses to start without HTTPS `ALLOWED_ORIGINS` and `DATABASE_URL`, and hides `/docs`.
   - `ALLOWED_ORIGINS`: the exact Angular origin(s), e.g. `https://piele-web.vercel.app`
   - `DATABASE_URL`: the transaction pooler string (port 6543)
   - `SUPABASE_URL`
   - `SUPABASE_JWT_AUDIENCE` only if it differs from `authenticated`

   Give Preview a staging Supabase project, not production credentials.
4. Deploy, then open `https://<deployment>/v1/health`. For production, follow [docs/production.md](../../docs/production.md).
