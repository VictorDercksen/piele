# Plan: match chat knows form, nicknames and internationals

Working spec for this change. Branch `claude/chat-form-internationals`. Delete this file when the handoff is written; the handoff replaces it.

## Problem

Two chat answers on 1 October 2026 (Round 2) showed three gaps:

1. "Are the Springboks back for the Stormers?" The chat could not map "Springboks" to South Africa and has no data on which players are test players. The URC feed's `nationalTeam` field still fails server-side (checked 1 October 2026: `players { player_data { nationalTeam } }` returns "Internal server error"; `customPlayers { nationalTeam }` returns nulls). Birth country is not the test team.
2. "Is the Lions team much different after last week's big win?" The chat has no results. `build_state` reports form as unavailable. The Lions beat Leinster 27-26 in Round 1.
3. The chat prompt forbids "general rugby history" and anything not in the documents, so it cannot use a nickname or a past result even when asked directly.

## Facts checked on 1 October 2026

- `matchstats(season_id: [202601], limit: 400) { match_id home_team_id away_team_id home_score away_score match_status match_datetime venue }` returns all 151 fixtures of 2026/27 in one call; finished ones have `match_status: "result"`. `match_datetime` is UTC (`2026-09-25 18:45:00` matches the schedule's `2026-09-25T18:45:00.000Z`). Team ids are the catalogue's `source_id`s. Unplayed play-off rows have team id 0 and name `TBD`.
- The same query for 202101 to 202501 returns 151 results per season (2025/26 last row: Leinster 36-7 Bulls, 19 June 2026, Croke Park).
- Cloudflare answers 403 to httpx's default user agent from this container; curl works. Any script that calls the feed must send a browser-like `User-Agent` (check what `app.main`'s HTTP factory sends and match it).

## Design

### A. Results and form (API)

1. **Current season, live.** New provider function `providers/results.py::fetch_season_results(client, url, season_id)` with the query above. Parses rows with `match_status == "result"` and both team ids known into `{fixtureId, homeSourceId, awaySourceId, homeScore, awayScore, kickoffUtc, venue}`. `MatchCentreService.season_results(now)` caches it as snapshot `{competition_id}:results:season` (TTL: 30 minutes when any fixture kicked off in the last 4 hours, else up to 6 hours, never shorter than 10 minutes; failure TTL 10 minutes). The competition supplies the feed season id (`202601` for `urc_2026_27`); add it to the competition contract (`base.py`) rather than hard-coding. Results map to catalogue club ids through `source_id`; unknown ids are dropped.
2. **Past seasons, static.** `apps/api/scripts/import_urc_history.py` fetches seasons 202101 to 202501 once and writes `apps/api/app/competitions/urc_2026_27/history.json`: `{"source": "...graphql", "retrievedAt": "...", "seasons": [{"seasonId": "202501", "label": "2025/26", "results": [{"matchId", "homeId", "awayId", "homeScore", "awayScore", "kickoffUtc", "venue"}]}]}` with catalogue club ids. Rows with unknown teams are dropped and counted in the script output. The competition exposes `history()` (loaded once, cached like `schedule()`). The JSON is committed.
3. **Form builder.** New pure module `app/agent/form.py`: `build_form(competition, fixture, current, history, limit=5)` returns
   ```
   {"status": "ok",
    "home": {"recent": [Result...], "season": {"played","won","drawn","lost","pointsFor","pointsAgainst"}},
    "away": {...},
    "headToHead": [Meeting...]}
   ```
   `Result` = `{"kickoffUtc", "season" ("2026/27" etc.), "opponentId", "opponent" (club name), "atHome", "for", "against", "outcome": "won"|"lost"|"drawn", "venue"}`, most recent first, current season then history, only matches that kicked off before this fixture's kickoff. `season` counts the current season only. `Meeting` = `{"kickoffUtc", "season", "homeId", "home", "awayId", "away", "homeScore", "awayScore", "venue"}`, last 5 meetings of these two clubs, any season. If the season snapshot is unavailable, form still uses history and current-season results are marked `"currentSeason": "unavailable"`.
4. **State.** `build_state` replaces the hard-coded unavailable form with `build_form(...)` from `centre.season_results(now)` and `competition.history()`. Module docstring updated.
5. **Chat.** `service.gather()` always fetches form (independent of teamsheets) and sets `facts["form"]`. `context.py` adds a `form` section after `teamsheets` (before forecast): per side the recent results as lines like `- Sat 26 Sep 2026 (2026/27): won 27-26 v Leinster Rugby at home, 10bet Ellis Park`, the season record, then head-to-head lines. It cites the URC match centre source (add `MATCH_CENTRE` to sources whenever form or teamsheets are present). In `build()`'s trimming, form is dropped (as a whole section) before the preview and teamsheets.

### B. Names glossary (API)

`app/chat/glossary.py`:
- `UNIONS`: the test unions as `{"South Africa": ("Springboks", "Boks", "Bokke"), "New Zealand": ("All Blacks",), "Australia": ("Wallabies",), "Argentina": ("Pumas", "Los Pumas"), "France": ("Les Bleus",), "Italy": ("Azzurri",), "Ireland": (), "Wales": ("Welsh",), "Scotland": (), "England": ("Red Rose",), "Georgia": ("Lelos",), "Fiji": ("Flying Fijians",), "Samoa": ("Manu Samoa",), "Tonga": ("ʻIkale Tahi", "Sea Eagles"), "Japan": ("Brave Blossoms",), "United States": ("Eagles",), "Canada": ("Canucks",), "Uruguay": ("Los Teros",), "Portugal": ("Os Lobos",), "Spain": ("Leones",), "Romania": ("Oaks",), "Namibia": ("Welwitschias",), "Chile": ("Cóndores",), "Germany": (), "Netherlands": (), "Hong Kong China": (), "Zimbabwe": ("Sables",), "Kenya": ("Simbas",)}`. Only widely used nicknames; no invented ones.
- Club aliases from the competition catalogue: `name` and `short_name`, plus former sponsor names known from the history file (`home_team_name`/`away_team_name` seen in past seasons, e.g. "Emirates Lions", "Cell C Sharks"). Collect them in the history script as `clubNames: {clubId: [names...]}` in `history.json`.
- `context.py` renders a `names` document (always present, last before `member`): one line per union with nicknames, one line per club in this fixture with its other names, and a sentence that a player's test team is the union the player has played for, which may differ from the country of birth. No citation (it is reference text, not a sourced fact).

### C. Player internationals (API + agent)

1. **Migration** `supabase/migrations/20261001150000_player_internationals.sql`:
   ```
   create table piele.player_internationals (
     club_id text not null,
     player_key text not null,          -- normalised name, see below
     name text not null,
     union_name text not null,
     caps integer check (caps between 1 and 250),
     caps_as_of date,
     last_test_on date,
     source_url text not null,
     source_title text not null,
     source_publisher text,
     origin text not null default 'researcher' check (origin in ('researcher', 'operator')),
     checked_at timestamptz not null default now(),
     primary key (club_id, player_key)
   );
   ```
   RLS enabled with policies letting `piele_api` select, insert and update; delete revoked from `piele_api`. Follow the style of `20261001100000_chat_messages.sql` and `20260926130000_notifications.sql`. Mirror in a SQLAlchemy table (new module `app/agent/internationals.py`; keep `app/league/tables.py` aligned only if tables live there by convention — check).
2. **Normalisation**: `player_key(name)` = NFKD, accents stripped, lower case, apostrophes and hyphens kept as written but whitespace collapsed. Same function used for matching teamsheet names.
3. **Writes**: `PreviewSubmission.research.{home,away}` gains optional `internationals: list[International]` (max 30, default empty), where `International` = `{name: Name, union: one of UNIONS keys, caps: int 1..250 | None, capsAsOf: date | None, lastTestOn: date | None, url: WebUrl, title: Title, publisher: Name | None}` (strict, extra forbidden). On `POST /v1/agent/previews`, after the preview is stored, upsert each international whose `player_key` matches a player in that side's current teamsheet (read through `centre.teamsheets`, before the transaction, never inside it). Unmatched names are skipped. Upsert sets `club_id` to the side's club, `checked_at = now`, and never overwrites a row with `origin = 'operator'`. The research jsonb keeps the internationals as submitted.
4. **State route**: `GET /v1/agent/fixtures/{id}/state` adds per side `internationals`: the stored rows for that club whose `player_key` matches a player in the side's teamsheet, as `{name, union, caps, capsAsOf, lastTestOn, checkedAt, origin}`. Read in a short transaction after `build_state` (no transaction across provider calls). Not part of `stateHash`.
5. **Chat**: `service.begin()` loads all rows for the home and away club ids inside transaction one and puts them in `facts["internationals"] = {"home": [...], "away": [...]}` (with source url, title, publisher). `context.py` adds an `internationals` section after `teamsheets`: per side, when teamsheets are published, the selected players with a record, e.g. `- 6 Siya Kolisi (starting): South Africa (Springboks), 90 caps as of 2026-09-27, last Test 2026-09-27 [n]`; when not published, the club's players on record, headed as such. Each row cites its own source URL. Players without a record are not listed; the header says "Players not listed have no international record here, which does not mean they are uncapped." Trimming: this section is dropped with research-level priority (before form).
6. **Agent** (`apps/agent`):
   - `team-researcher/agent.ts` output schema gains `internationals` (array, maxItems 30, items with `name`, `union` enum = the UNIONS keys, optional `caps` integer, `capsAsOf`, `lastTestOn` (YYYY-MM-DD strings), `url`, `title`, optional `publisher`; required `name`, `union`, `url`, `title`). The API also accepts research without it.
   - `team-researcher/instructions.md`: new "Internationals" duty: for the selected players, list those who have played Test rugby, with the union and, where a page shows them, caps and the date of their latest Test; use names exactly as in the selection; reuse the known internationals in the request and only search for players not covered or checked more than 30 days ago; one or two searches per team ("<team> Springboks", "<team> internationals return", the union's latest squad announcement) rather than one per player; never infer a test team from birthplace or surname.
   - `lib/fixture-inputs.ts`: pass each side's known `internationals` from the state to the researcher request.
   - `tools/save_preview.ts` and its types: pass research `internationals` through unchanged.
   - Writer `instructions.md`: the state now carries `form` (recent results, season record, head-to-head) and `internationals`; use form for the "Form and momentum" factor and cite the URC source for it.

### D. Chat prompt (`apps/agent/agent/lib/chat/instructions.ts`)

- `<context_rules>`: list the new documents (form with recent results and head-to-head, internationals, names).
- Answering rule 1: for a nickname or a national side, use the names document; for "is X an international / are the Boks back", use the internationals document plus the teamsheet changes; for "last week", "form" or "record against", use the form document.
- Rule 4 becomes: results of these two clubs in the form document, including past meetings, are in scope; other fixtures and anything not in the documents are not.
- New boundary: a player's test team comes only from the internationals document; birth country is not the test team; a player not listed is "not recorded as an international in the documents", never "uncapped".
- "Back from Test duty" may be stated only when the player's last Test date is in the internationals document and is within the last eight weeks before kickoff and the player is in this teamsheet.
- Two new examples: the Springboks question answered from internationals and changes; the "last week's big win" question answered from form plus changes.

### E. Not in scope

Web UI changes (the teamsheet flag still shows birth country), a results-entry UI, Superbru scoring changes, seeding `player_internationals` by hand, the backtest.

## Work split

| Worker | Scope | Files |
| --- | --- | --- |
| W1 | A and B (API) | `apps/api/app/matchcentre/providers/results.py`, `matchcentre/service.py`, `competitions/base.py`, `competitions/urc_2026_27/*`, `app/agent/form.py`, `app/agent/state.py`, `app/chat/glossary.py`, `app/chat/context.py`, `app/chat/service.py`, `apps/api/scripts/import_urc_history.py`, tests |
| W3 | C.6 and D (agent, TypeScript) | `apps/agent/**` |
| W2 | C.1 to C.5 (API), after W1 | migration, `app/agent/internationals.py`, `app/agent/models.py`, `app/routers/agent.py`, `app/chat/service.py`, `app/chat/context.py`, tests |
| Orchestrator | Review, full test runs, docs (`apps/api/CLAUDE.md`, READMEs), handoff | |

## Checks

- `uv --directory apps/api run pytest` without a database, and with `PIELE_TEST_DATABASE_URL` against local PostgreSQL 16 with all migrations applied as `piele_api`.
- `apps/agent`: `npm ci`, `npm run typecheck`, `npm test`, `npm run build` (Node 24 if available).
- Context render check: build the chat document for Edinburgh v Stormers and Lions v Ospreys with fixture data from tests and read it.
