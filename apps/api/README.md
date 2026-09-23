# Piele API

FastAPI backend for Piele. Routes live under `/v1`:

- `GET /v1/health` reports the environment and database status.
- `GET /v1/matches/{fixtureId}` returns the match centre for one published fixture: teamsheets from the public URC feed, pre-match prices from The Odds API and the kickoff-hour forecast from Open-Meteo. Each section carries its own `status` (`ok`, `not_published`, `too_early`, `past`, `not_covered` or `unavailable`), so a provider outage never fails the request. Odds and weather are fetched only inside the week before kickoff, teamsheets from three days out. Responses are cached in the `external_snapshots` table (sports list 24 h, odds 6 h, weather 3 h, teamsheets 6 h once published) or in process memory when no database is configured. The fixture list comes from `app/data/urc_fixtures.json`, written by `apps/web/scripts/import-urc.mjs`.

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

## Connect Supabase

1. Create a project at https://supabase.com/dashboard. Pick the region closest to where the Vercel function will run, and store the database password in a password manager.
2. Open **Connect** on the project page and copy the **Transaction pooler** connection string (port 6543) into `DATABASE_URL`, replacing `[YOUR-PASSWORD]`. The API uses this at runtime.
3. Copy the project URL (`https://<ref>.supabase.co`) into `SUPABASE_URL`.
4. Put these in `apps/api/.env` (uncomment the database line), run the app and check that `/v1/health` reports `"database": "ok"`.

Later, the runtime URL should use a restricted database role instead of `postgres`, per the plan.

## Migrations

Schema changes are SQL files in the repository root's `supabase/migrations/`, the single migration history. The Supabase GitHub integration applies them to the linked project on pushes to the connected branch; nothing runs at API startup. Application tables live in the private `piele` schema, which must stay out of the Data API's exposed schemas. The first migration, `20260923184500_external_snapshots.sql`, creates the provider cache table.

To apply migrations by hand, install the Supabase CLI and run `supabase link` then `supabase db push` from the repository root.

## Deploy to Vercel

1. In Vercel, choose **Add New > Project** and import this repository.
2. Set **Root Directory** to `apps/api`. Vercel detects FastAPI from `pyproject.toml`, installs dependencies from `pyproject.toml` and `uv.lock`, and loads `app` from `app/main.py`. No `vercel.json` or `requirements.txt` is needed.
3. Under **Environment Variables**, set:
   - `ENVIRONMENT` (`production` or `preview`)
   - `ALLOWED_ORIGINS`: the exact Angular origin(s), e.g. `https://piele-web.vercel.app`
   - `DATABASE_URL`: the transaction pooler string (port 6543)
   - `SUPABASE_URL`
   - `SUPABASE_JWT_AUDIENCE` only if it differs from `authenticated`
   - `ODDS_API_KEY`: The Odds API key for match prices (free tier: 500 requests a month). Optional `ODDS_SPORT_KEY` overrides the sport discovered by title, `ODDS_REGIONS` defaults to `uk`.

   Give Preview a staging Supabase project, not production credentials.
4. Deploy, then open `https://<deployment>/v1/health`.
