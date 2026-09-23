# Supabase and Vercel setup review

Recorded on 2026-09-24 in Africa/Johannesburg time, in a Claude Code cloud session on branch `claude/supabase-vercel-setup-blg7oy`.

## Request

The user connected the Supabase connector and asked what can be set up with Supabase and Vercel.

## Findings

Supabase organization "Pofadder Bowl" (free plan) holds three projects. `piele-staging` (ref `kuvrhmiaynamccukrziv`, eu-west-2, Postgres 17, healthy) is the Piele project. `pofadder-bowl-league` and `pofadder-bowl` (inactive) are unrelated and were not touched.

`piele-staging` already has one migration, `20260923184500 external_snapshots`. It creates a private `piele` schema and a `piele.external_snapshots` cache table with RLS enabled and no policies. This migration is not in this repository: `apps/api` holds only `CLAUDE.md` and `AGENTS.md`, with no Alembic history. It likely comes from unpushed local work. Push that work before anyone adds further schema, so Alembic stays the single migration owner.

The security advisor reports only the intentional "RLS enabled, no policy" notice for that table. The performance advisor reports the unused `ix_external_snapshots_expires_at` index, which is expected on an empty table. No storage buckets exist. There is no public schema content.

Vercel has no connector, CLI or token in this session, so no Vercel project was created or inspected.

## Completed changes

- `apps/web/vercel.json`: Angular framework preset, `npm ci`, `npm run build`, output `dist/piele-web/browser`, SPA fallback rewrite to `index.html`, and basic security headers.
- `apps/web/package.json`: `engines.node` set to `^22.22.3 || ^24.15.0 || >=26.0.0`, matching the Angular CLI minimum. Vercel reads this to choose the Node runtime. The lockfile was left unchanged: regenerating it with npm 10 dropped platform entries, so that change was reverted.

No Supabase changes were made.

## Checks run

- `npm ci` in `apps/web` passed.
- The production build failed under Node 22.22.2 because Angular CLI requires 22.22.3 or later. It passed under Node 24 through `npx node@24`, producing `dist/piele-web/browser/index.html`.
- Unit and browser tests were not run. No application code changed.

## Next steps (proposed, not done)

1. Vercel web project: import the repo in Vercel with root directory `apps/web`. The committed `vercel.json` supplies the build settings. It serves the current prototype only.
2. Supabase Auth for staging (dashboard): email OTP with no public sign-up (plan P2), redirect allowlist for the Vercel domains, and SMTP for invited members.
3. Supabase Storage: private buckets for evidence videos and profile photos, created through migrations when the API upload flow exists (plan P1, P6).
4. API: bootstrap FastAPI and Alembic in `apps/api`, bring in the existing `external_snapshots` migration, then add a second Vercel project rooted at `apps/api`. Server secrets (pooler database URL, cron secret) go in Vercel environment variables, never in the repo.
5. Production: create a separate Supabase production project when release is near. The plan requires staging and production separation.
6. To let Claude operate Vercel directly, connect a Vercel connector or add a `VERCEL_TOKEN` environment secret.
