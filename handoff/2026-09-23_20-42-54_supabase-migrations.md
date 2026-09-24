# Supabase migrations replace Alembic

Request: After merging the match centre into `staging`, the user asked whether migrations run automatically (they did not) and chose to switch to Supabase migrations so the Supabase GitHub integration applies them on push. User decision; it supersedes the plan's "Alembic owns migrations" default.

## Completed

- New `supabase/config.toml` (minimal: project_id, Postgres 17, migrations enabled) and `supabase/migrations/20260923184500_external_snapshots.sql` at the repository root. The SQL creates the private `piele` schema, `piele.external_snapshots`, its expiry index, and enables row level security with no policies.
- `apps/api/app/matchcentre/cache.py` now maps the table to schema `piele`.
- Removed `apps/api/alembic.ini`, `apps/api/migrations/` and the `alembic` dev dependency (uv.lock updated). Removed `MIGRATION_DATABASE_URL` from `.env.example`.
- Updated README.md, apps/api/README.md (new Migrations section) and apps/api/CLAUDE.md. The plan document still describes Alembic; the API guide records the superseding decision.

## Checks run

- `uv sync` then `uv run pytest`: 20 passed.
- `CreateTable(external_snapshots)` compiles to `CREATE TABLE piele.external_snapshots (...)`, matching the SQL migration.
- No Supabase CLI or database was reachable from this container, so the SQL file was not executed here.

## Next steps for the user

1. In the Supabase dashboard for `piele-staging`, connect the GitHub repository (Integrations > GitHub), set the production branch to `staging` and the Supabase directory to `supabase`. The integration then applies the pending migration.
2. Confirm the `piele` schema is not listed under Settings > API > Exposed schemas (default is `public, graphql_public`).
3. Add `ODDS_API_KEY` to the `piele-api` Vercel project's Preview environment and redeploy.
