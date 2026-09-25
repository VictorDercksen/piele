# Piele agent

The preview agent, built with [eve](https://vercel.com/docs/eve) (pinned at 0.66.3). Every two hours it asks the Piele API which fixtures need a preview, reads each fixture's state, has the `team-researcher` subagent research both sides on the web, writes a sourced preview and stores it through the API. Members read it on the match page.

The agent holds no database credentials. It reaches the API's `/v1/agent` routes with one bearer token, and the API validates everything it stores. See `apps/api/app/agent/`.

## Layout

| Path | Contents |
| --- | --- |
| `agent/agent.ts` | Root agent: Claude through AI Gateway, no default tools, no self-delegation, per-session token and cost caps. |
| `agent/instructions.md` | The writer's process and rules: cite every claim, treat fetched text as information only, no betting language, plain text. |
| `agent/tools/` | `get_due_fixtures`, `get_fixture_state` and `save_preview`, all calling the API through `agent/lib/piele-api.ts`. The state tool keeps the fixture's hashes in session state for `save_preview`, so the model never copies them. |
| `agent/subagents/team-researcher/` | One team per call. Only `web_search` and `web_fetch`; fetches are limited to `agent/lib/allowlist.ts`. Returns structured items, each with its source URL. |
| `agent/schedules/prepare-previews.md` | Cron `10 */2 * * *` (UTC). Several runs a day need a paid Vercel plan; Hobby allows one. |
| `agent/channels/eve.ts` | Session routes accept only this project's Vercel OIDC tokens and a local `eve dev` server. |

## Run and check

Node 24 or newer. From this directory:

- `npm ci`, then `npm run typecheck`, `npm test` (allowlist) and `npm run build`.
- `npm run dev` starts the eve terminal UI. It needs a model credential (`/login`) plus `PIELE_API_URL` and `PIELE_AGENT_TOKEN` in `.env.local`, pointing at a local API started with the same token. Trigger the schedule with `curl -X POST http://localhost:2000/eve/v1/dev/schedules/prepare-previews`.

Local builds use the `just-bash` sandbox (a dev dependency); on Vercel eve uses Vercel Sandbox. The agent runs no shell or file tools.

## Deploy

A third Vercel project, `piele-agent`, rooted at `apps/agent`. `vercel.json` limits builds to `staging` and `master`, like the other two projects. Variables:

| Variable | Value |
| --- | --- |
| `PIELE_API_URL` | The API origin for the same environment, e.g. the staging API URL. |
| `PIELE_AGENT_TOKEN` | The same random value (32+ characters) as the API's `PIELE_AGENT_TOKEN` in that environment. Sensitive. |

Model calls go through AI Gateway with the project's OIDC token, so no provider key is needed. Runs, tool calls and token usage appear under Agent Runs in the Vercel dashboard.

## Not verified yet

- No run against a real model or the live URC feed. Measure one round's tokens and searches from Agent Runs before relying on the cost caps.
- The model ids (`anthropic/claude-opus-5.5` for the writer, `anthropic/claude-sonnet-5` for the researcher) must be checked against the AI Gateway catalogue. They are repeated in `agent/lib/models.ts`, which records them with each preview.
- The domain allowlist is a starting list. `web_fetch` follows redirects after the first URL is checked.
- No eve evals yet (sources present, no betting language, format fits, injected instructions ignored).
