# Backend agent guide

## Start and finish

- User instructions take precedence. Stay within the requested scope, preserve unrelated work, and do not add speculative frameworks, services, or schema. Do not deploy or use production credentials during local implementation.
- Read the latest timestamped Markdown file in [../../../handoff/](../../../handoff/) before work. Before ending, write `YYYY-MM-DD_HH-mm-ss_<feature>.md` there using Africa/Johannesburg time. Record the request, changes, files, actual checks/results, unresolved issues, and next steps. Preserve prior handoffs and exclude secrets.
- **The Pavilion** is the app. **Piele** is its first league. Keep `PIELE_*`, the `piele` schema, and `piele_api` role names.
- Product decisions are in `../../../piele-application-plan.md`. Consult the relevant section for domain changes. Report missing sources rather than inventing requirements. Frontend rules: [../web/CLAUDE.md](../web/CLAUDE.md). Local setup, bootstrap, Supabase, and deployment configuration: [README.md](README.md).

## Stack and structure

FastAPI, Pydantic, SQLAlchemy Core, Psycopg, Supabase PostgreSQL/Auth/private Storage, and bounded stateless Vercel functions. Dependencies are exact-pinned in `pyproject.toml` with committed `uv.lock`. Keep route handlers thin and business logic in testable services. APIs live under `/v1` with explicit request/response contracts.

| Task | Start here |
| --- | --- |
| App/config/database | `app/main.py`, `config.py`, `db.py`. Exact-origin CORS, request IDs, `Cache-Control: no-store`, lazy engine. |
| Member authentication and authority | `app/league/auth.py`, `context.py`. Reuse verified request dependencies. |
| League operations | `app/league/service.py`, `tables.py`, models, and `app/routers/league.py`. Evidence cases: `app/league/cases.py`. Audit/feed changes belong in the same transaction. |
| Account, join, admin | `app/routers/account.py`, `admin.py`. League creation is shared with `app/league/bootstrap.py`. |
| House marks and media | `app/league/marks.py` is authoritative. `storage.py` issues scoped grants, validates stored media, and deletes replaced uploads. |
| Competitions | `app/competitions/__init__.py` registry, `base.py` contracts, competition folders such as `urc_2026_27`. Add a folder/registry entry rather than hard-coding another competition into shared code. |
| Match data | `app/matchcentre`, `app/routers/matches.py`. One `MatchCentreService` per competition. Cache keys include competition ID. Season results are a cached URC snapshot (`season_results`); past seasons are bundled per competition (`history.json`, written by `scripts/import_urc_history.py`). |
| Previews and dispatch | `app/agent`, `app/routers/agent.py`. Form: `app/agent/form.py`. Player internationals: `app/agent/internationals.py`. The worker is `../agent`, with its own README. |
| Push notifications | `app/push` (`webpush.py` encryption and VAPID, `outbox.py`, `league_events.py`, `job.py`) and `app/routers/push.py`. League events queue in `service.write_record`'s transaction; the cron job adds competition events and pick reminders and sends. |
| Schema | `../../supabase/migrations/` is the sole migration history. Keep `app/league/tables.py` aligned. |
| Verification | `tests/`, especially `test_database.py`, plus frontend OpenAPI generation. |

## Authorization and transactions

- Verify Supabase token signature, issuer, audience, and expiry. Never trust client roles, identity, ownership, or membership IDs. Validate membership IDs inside the path league.
- Use the existing dependencies in `context.py`:
  - `account_dependency`: verified account, no league.
  - `actor_dependency`: active path league and membership, with the global-admin read exception.
  - `steward_dependency`: captain or admin.
  - `admin_dependency`: global admin, no implicit league context.
  - `competition_member_dependency`: membership in a league on that competition, or admin.
- The operator alone sets `users.is_admin` through SQL. The admin may read leagues without membership. Member-attributed writes still call `require_membership(actor)` and return `409 admin_not_a_member` when absent.
- Captain authority comes from the league's single captain membership, not a mutable role field. A future member-to-member transfer requires transactional recipient acceptance. Direct admin appointment is already implemented.
- A request transaction sets verified transaction-local `piele.auth_subject`, `piele.auth_email`, and then `piele.league_id`. Never leak identity through pooled connections. Admin operations must set target-league context before reading/writing its records.
- Use explicit transactions, constraints, optimistic versions, and idempotency where mutations race. Keep audit records append-only. Include admin attribution in audit events without inventing a membership.
- Do not hold database transactions across provider network calls. The round-updates route authenticates in a short transaction because the runtime pool is small.

## Persistence, configuration, and media

- Persist authoritative state in PostgreSQL/private Storage, never function memory/filesystem. Required background work uses durable jobs, leases, and bounded retries. Process-memory caching is only the no-database development fallback for external snapshots.
- Runtime uses restricted `piele_api` with league-scoped RLS. Migration credentials are separate and unavailable to the API. Keep `piele` private and unexposed through the Data API.
- Add SQL migrations to `../../supabase/migrations/`. The Supabase GitHub integration applies them. Do not use Alembic or run migrations on startup/requests. New tables require explicit RLS policies even though default privileges grant runtime access.
- Use exact CORS origins, a small pool through the Supabase transaction pooler, verified TLS, and disabled prepared statements where required. Production settings require `DATABASE_URL` and HTTPS CORS origins and disable interactive docs.
- Keep secrets server-side. Never log credentials, tokens, signed media URLs, raw ballots, or private payloads. Do not publicly cache sensitive responses.
- Media bytes bypass the API through narrowly scoped grants after ownership checks. Validate actual signatures/type and size, not client MIME claims. Keep media private, clean up replaced uploads, and reject arbitrary remote photo URLs.
- Profile updates affect only the authenticated account. Validate favourite teams through the competition catalogue. Photo is account-wide under `avatars/<user id>/`. Favourite team and notification read state belong to league membership. Emblems use approved `preset:<key>` values or `emblems/<league id>/` uploads. Return authorized signed references only.

## Domain invariants

- Accounts can belong to several leagues, at most one membership per league. Account reads claim names reserved for the verified email. Join codes resolve one league using transaction-local `piele.join_code`. Rotating/closing a code invalidates it. Never put join codes in audit records.
- Missing/archived leagues return `unknown_league`. Unlisted or withdrawn members get `not_a_member`. Removing members withdraws active season membership and voids live duties while retaining accrued marks and historical records. Only unclaimed names without references may be deleted. Reinstatement creates a new active season membership, but historical standings update by member rather than duplicating them, and picks belong to the account (or the unclaimed name), not to a season membership.
- Use `actor.competition` for teams, schedules, round bounds, labels, and next-round deadlines. Unknown competitions/rounds return explicit errors. Preserve fixture source, external ID, season, and retrieval time. Imports are idempotent and retain last good data on partial failure. Unknown dates remain nullable. Public fixture access grants no Superbru account access.
- Store UTC instants and display league time explicitly. Reschedules cannot silently move confirmed duties/deadlines. Spoon duties default to the next round's first kickoff.
- Accepted member evidence completes a duty at submission time. Captain-recorded evidence uses the entered completion time. Captains cannot decide their own evidence. Challenges never pause accrual. A successful challenge resets the overdue clock. Future Superbru sync proposes Spoon duties for confirmation rather than creating them automatically.
- Every evidence link opens a 24-hour case. The electorate is frozen at opening: active claimed members except the subject and submitter; none accepts at once. A later claim does not join; a released name's uncast ballot leaves live cases. First event wins: majority accept accepts, a veto (with reason) goes to review, expiry auto-accepts at `closes_at`. The uninvolved captain reviews, else the stand-in, else only a membership-less admin. A dismissed veto reopens voting on the original timer. The captain override closes the case. No scheduler: `cases.settle_due` runs lazily once per transaction, before any duty lock, ahead of duty, case, marks and feed reads/writes; locked case writes re-check `closes_at`. Never return voter identities; case feed entries carry no actor.
- Keep house marks and Superbru points separate. Pending constitutional interpretations are not enforceable rules. Voluntary participation cannot trigger default marks. Keep ballot choices private and apply the season-closure media retention workflow when implemented.

## Picks, rules, and previews

- Members record home/away/draw picks before kickoff. Margins are 1 to 150, zero for a draw, and absent for missed picks. Captain/admin corrections may occur at any time. Default picks allow home/away only while the season rule enables them. A partial steward update leaves omitted members untouched.
- A pick belongs to an account, a competition and a fixture (`piele.picks`), so every league of the account on that competition reads the same pick and the captain or admin of any of them may correct or delete it; the audit event goes to the acting league only. A name nobody has claimed holds league-local picks until it is claimed. A claim moves the name's picks to the account; where the account already picked the fixture, its pick wins. A release copies the account's picks on the league's competition back to the name, so the league keeps them. The link from a pick to its pick confirmation duty is league-local (`piele.pick_duty_links`).
- Hide the pool from everyone until kickoff: before it a member, the captain and the admin (with or without a membership) see no one else's pick, only `myPick`; from kickoff everyone sees it. `picksHiddenBeforeKickoff` is informational and does not change this. Exclude withdrawn members.
- Superbru scoring, ranks, round/season tables, and badges are derived only in frontend `core/league/superbru.ts`. The API persists picks, results, and recorded-total overrides. Read results from full-time milestones, then cached scores. Do not fetch providers or recompute scoring during a league read.
- Store only season-rule differences from `DEFAULT_RULES`, merge on read, and validate booleans, numeric bounds, starting round, and champion membership. Rules changes, creation, and admin updates use the same helpers. Pick-confirmation duties link `pickFixtureIds` and create missed records when necessary.
- Previews are append-only revisions keyed by competition/fixture. Agent auth uses a separate constant-time-checked `PIELE_AGENT_TOKEN`. Dispatch after both teamsheets publish, with a 45-minute lease and at most three claims. Member reads require competition membership. Keep notification milestones append-only and notification read high-water marks non-decreasing.
- Match chat (`app/chat`, `app/routers/chat.py`): a question is two short transactions with the provider reads and the agent's stream between them, never one held across them; the answer is stored in the second, however the stream ends. Limits are counted in the database (`piele.chat_turns`, kept when a thread is cleared), and the pool reaches the model only through `service.fixture_picks`. Never log questions, answers, the context or the token. The API calls the agent with the same `PIELE_AGENT_TOKEN`. The context's form comes from the season snapshot and bundled history (read in `gather`, no transaction); internationals are read in the first transaction. A player's Test team comes only from `piele.player_internationals`, never from birth country; nicknames come from `app/chat/glossary.py`, whose `UNIONS` keys must match `UNIONS` in `../agent/agent/lib/internationals.ts`.
- Player internationals (`piele.player_internationals`, keyed by club and normalised name) are written only from a saved preview's research, matched to the side's teamsheet, in the preview's transaction and only for a new run. Rows with `origin = 'operator'` are set by SQL and never overwritten; `piele_api` cannot delete rows or write operator rows.
- Push messages go to accounts, never to their own actor, and respect the member's muted categories (`duties`, `cases`, `picks`, `matches`) per league. Queue with a dedup key; the job announces a competition event once and a pick reminder once per member, fixture and lead (24h, 1h). The job sets `piele.job = 'push'` in every transaction and a league's context for league reads. `GET /v1/cron/push` checks `CRON_SECRET` in constant time. Never log subscription endpoints or keys.

## Implemented limits

Do not describe sample UI or proposals as completed backend features. Superbru sync, cases and voting other than evidence cases, token invitations, accepted captain transfers, member-initiated leave, Jev, Machine picks, and results entry are not built (form reads the URC feed and bundled history, not entered results). The live URC lineup query and private Storage REST shapes remain unverified against live services.

## Verification

Run from `apps/api`:

| Check | Command/action |
| --- | --- |
| Domain and route tests | `uv run pytest` |
| Local server | `uv run uvicorn app.main:app --reload --port 8000` |
| Real PostgreSQL/RLS | Set `PIELE_TEST_DATABASE_URL` to a migrated test database as restricted `piele_api`, then run pytest. CI uses PostgreSQL 17. Record skipped database checks. |
| Shared contract change | From `../web`, run `npm run generate:api`, review generated types/domain adaptations, then `npm run check:api` and relevant frontend checks. |

Test applicable cross-league denial, admin/member attribution, profile ownership, transaction races, import completeness, timezone boundaries, and failed storage. Use readable errors and request IDs without private payloads. Report actual commands/results and unresolved failures. A passing unit suite is not evidence that skipped database or live-provider integration checks passed.
