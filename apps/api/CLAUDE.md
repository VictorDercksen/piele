# CLAUDE.md

Adapted from CtrlFleet/src/fc-app-web/CLAUDE.md for the Piele Python backend. This is the backend guide for all coding agents.

## Session handoffs

Before starting work, read the latest Markdown handoff in [../../../handoff/](../../../handoff/), selected by the timestamp in its filename. Before ending each session, write a new handoff there named `YYYY-MM-DD_HH-mm-ss_<feature>.md`, using Africa/Johannesburg local time and a short kebab-case feature name. Record the request, completed changes, relevant files, checks actually run and their results, unresolved issues and next steps. Distinguish completed work from proposed work. Preserve previous handoffs and never include secrets.

## Project and current state

Piele administers a private URC league. The authoritative implementation plan is ../../../piele-application-plan.md relative to this directory. User decisions take precedence over proposed defaults. This directory currently reserves the API application root. No Python service, database, authentication or deployment is implemented yet. Do not claim otherwise.

## Planned stack and structure

Use Python FastAPI, Pydantic request/response models, SQLAlchemy, Psycopg and Alembic with Supabase PostgreSQL. Vercel runs bounded stateless API functions. Supabase Auth and private Storage are proposed services in the plan. Do not carry over Angular, Firebase or CtrlFleet microservice conventions from the source guide.

Use app/ for application code, thin route handlers, domain services for business rules, migrations/ for the single Alembic history and tests/ for domain, authorization and database integration coverage. APIs live under /v1. Define explicit typed contracts and generate frontend client types from OpenAPI. Use readable validation errors and request IDs without exposing private payloads.

## Non-negotiable rules

1. Validate identity and active league membership on every domain request. Verify token signature, issuer, audience and expiry. Never trust client-supplied roles, user IDs or league ownership.
2. Captain authority comes from the league's single captain membership. Transfer requires the recipient's acceptance in a transaction. Do not use a mutable role field as a substitute.
3. Use explicit transactions, database constraints, optimistic versions and idempotency where mutations can race. Keep route handlers thin and business logic testable.
4. Use a restricted runtime database role and league-scoped RLS. Set verified transaction-local actor context so pooled connections do not leak identity. Runtime and migration credentials are separate.
5. Keep secrets in server configuration. Never emit tokens, signed media URLs, raw ballots or credentials in logs. Sensitive responses are not publicly cached.
6. Persist authoritative state in PostgreSQL and private Storage, never process memory or the function filesystem. Use durable jobs with leases and bounded retries, not in-process background tasks for required work.
7. Media bytes bypass the API using narrowly scoped upload grants after ownership checks. Validate actual media type and size. Profile photos require ownership checks and replacement cleanup. Do not make private member media public.
8. Profile updates affect only the authenticated user. Validate favourite_team_id against the competition team catalogue. Return safe display metadata and authorized avatar references. Do not trust client MIME claims or arbitrary remote photo URLs.
9. Persist fixture source, external ID, season and retrieval time. Import idempotently and preserve last known good data on partial failure. Keep unknown dates and kickoffs nullable. Public fixture imports do not grant access to Superbru accounts.
10. Store timestamps in UTC and display league time explicitly. A fixture reschedule cannot silently change a captain-confirmed house deadline or existing duty.
11. Superbru points and house marks remain separate. Pending constitutional interpretations are not enforceable rules. Voluntary participation cannot trigger default marks.
12. Keep audit records append-only. Ballot choices remain private. Retain only authorized media and apply the plan's season-closure retention workflow when that feature exists.
13. Do not add unrelated frameworks, speculative abstractions, services or schema. Do not deploy or use production credentials as part of local implementation.

## Configuration and verification

Configure exact CORS origins. Use a small runtime connection pool with the Supabase transaction pooler, disable prepared statements where required and verify TLS. Use a direct/session connection for migrations. Never run migrations on every request or function startup.

When bootstrapping the API, pin dependencies and add explicit project commands. No backend test command exists yet. Use pytest for domain logic, authorization, transaction races and real PostgreSQL integration tests as those features are built. Verify OpenAPI contracts with the Angular client. Test cross-league denial, profile ownership, import completeness, timezone boundaries and failed-storage behaviour relevant to the change. Record actual commands and outcomes rather than claiming unrun checks passed.

Frontend guidance lives at ../web/CLAUDE.md. Shared contract changes must be reflected in both applications. Scope work to the user's request and preserve reversible local work.
