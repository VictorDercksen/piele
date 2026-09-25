# Preview agent: DeepSeek models and a force-run endpoint

Recorded on 2026-09-25 in Africa/Johannesburg time. Branch `claude/preview-agent-handoff-8qqer6` (PR #19), from `master` at `9628462`.

## What happened in production after PR #18

- 10:00 UTC: the first scheduled run claimed the 8 round 1 fixtures and started 8 sessions. AI Gateway refused every model call: no credit card on the team.
- 10:30 UTC: card added; refused again, "Free tier users do not have access to this model".
- 10:45 UTC: credits bought. Team research (Sonnet 5) ran for 6 fixtures at $0.72–0.86 each, then every call to Opus 5.5 got a 429, "No access to this model at this time". No preview was saved. About $4.7 spent.
- The claims were cleared by hand twice (SQL on `piele.preview_dispatches`) to retry sooner.

## Changes

1. **Models.** The writer and the team researcher both use `deepseek/deepseek-v4-pro` ($0.66 / $1.98 per million tokens; AI Gateway doubles it 01:00–04:00 and 06:00–10:00 UTC on weekdays). User decision.
2. **Force run.** `POST /previews/run` on `piele-agent`, behind `PIELE_AGENT_TOKEN`: no body claims whatever is due and starts the sessions at once; `{ fixtureId }` limits it to one fixture; `{ fixtureId, force: true }` claims that fixture even with a preview, inside a lease or after its attempts (still needs both teamsheets and a kickoff ahead). The API's `POST /v1/agent/dispatches` takes the same optional body. Shared code in `agent/lib/dispatch.ts`; token and body checks in `agent/lib/run-request.ts`.

## Checks run

- `uv run pytest` with PostgreSQL 16 and all migrations: 101 passed; without a database: 62 passed, 39 skipped.
- `apps/agent`: typecheck, `npm test` (5 passed), `npm run build` (0 errors, 0 warnings; both agents on `deepseek/deepseek-v4-pro`).
- Local end to end (API + `eve dev`): no token 401, bad body 422, unknown fixture 404, no body started 8 sessions, a repeat started none, a forced fixture started attempt 2.

## Not verified

- DeepSeek has not run this agent yet: tool calls, the researcher's structured output and `save_preview` validation are tested by the first production run.
- Whether the production URL of `piele-agent` is behind Vercel Authentication (the project was created with standard protection); if it is, `/previews/run` needs a protection bypass or a custom domain.
- The token is a sensitive Vercel variable and cannot be read back; to call the endpoint, use the value set on 25 September or set a new one on both projects.
