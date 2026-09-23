# Piele API

FastAPI backend for Piele. Routes live under `/v1`. Only `GET /v1/health` exists so far.

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
2. Open **Connect** on the project page and copy two connection strings, replacing `[YOUR-PASSWORD]`:
   - **Transaction pooler** (port 6543) goes in `DATABASE_URL`. The API uses this at runtime.
   - **Session pooler** (port 5432), or the direct connection if your network supports IPv6, goes in `MIGRATION_DATABASE_URL`. Only Alembic uses this.
3. Copy the project URL (`https://<ref>.supabase.co`) into `SUPABASE_URL`.
4. Put these in `apps/api/.env` (uncomment the two database lines), run the app and check that `/v1/health` reports `"database": "ok"`.

Later, the runtime URL should use a restricted database role instead of `postgres`, per the plan. Migrations run manually, never at startup:

```bash
uv run --env-file .env alembic upgrade head
```

There are no migration revisions yet.

## Deploy to Vercel

1. In Vercel, choose **Add New > Project** and import this repository.
2. Set **Root Directory** to `apps/api`. Vercel detects FastAPI from `pyproject.toml`, installs dependencies from `pyproject.toml` and `uv.lock`, and loads `app` from `app/main.py`. No `vercel.json` or `requirements.txt` is needed.
3. Under **Environment Variables**, set:
   - `ENVIRONMENT` (`production` or `preview`)
   - `ALLOWED_ORIGINS`: the exact Angular origin(s), e.g. `https://piele-web.vercel.app`
   - `DATABASE_URL`: the transaction pooler string (port 6543)
   - `SUPABASE_URL`
   - `SUPABASE_JWT_AUDIENCE` only if it differs from `authenticated`

   Do not set `MIGRATION_DATABASE_URL` on Vercel. Give Preview a staging Supabase project, not production credentials.
4. Deploy, then open `https://<deployment>/v1/health`.
