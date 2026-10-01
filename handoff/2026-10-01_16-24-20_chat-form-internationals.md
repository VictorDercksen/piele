# Match chat: form, nicknames and player internationals

Recorded on 2026-10-01 in Africa/Johannesburg time. Branch `claude/chat-form-internationals`, from `master` at `bb505f5`.

## Request

Two chat answers in Round 2 fell short. "Are the Springboks back for the Stormers?" got "the documents do not label players as Springboks". "Is the Lions team much different after last week's big win?" got "the documents do not state last week's result". The user asked for the chat to:

- relate nicknames such as Springboks to the national side;
- know the Test team each player plays for, which is not necessarily the country of birth;
- see the teams' previous results.

The fix was planned and then implemented by orchestrated subagents.

## Findings that shaped the design (checked 1 October 2026)

- The URC feed's `nationalTeam` field still fails. `players { player_data { nationalTeam } }` returns "Internal server error", and `customPlayers { nationalTeam }` returns nulls. Birth country is the only player country the feed has.
- `matchstats(season_id: [...])` returns a whole season with scores in one call:
  - 151 results each for 2021/22 to 2025/26 (seasons 202101 to 202501);
  - the current season is 202601, which has 8 results so far.
- `match_datetime` is UTC. Team ids are the catalogue's `source_id`s.
- From this container, Cloudflare refuses httpx when it goes through the outbound proxy; curl and urllib work. The history script has `--direct` for this, and TLS is still verified. The app's own client in production was not affected before and is unchanged.

## Changes

1. **Form (API).**
   - **Source:** `app/matchcentre/providers/results.py` feeds `MatchCentreService.season_results(now)`, a snapshot cached at `{competition}:results:season`.
   - **Cache timing:** the snapshot lives 30 minutes around matches and up to 6 hours otherwise.
   - **Failures:**
     - An empty feed mid-season counts as a failure.
     - After a failed refresh, the last good results are served with their original `fetchedAt` and flagged stale.
     - After 24 hours they become unavailable.
   - **Past seasons:** stored in `app/competitions/urc_2026_27/history.json`, written by `scripts/import_urc_history.py`. All 755 rows mapped to catalogue clubs. `Competition` gains `feed_season_id`, `history()` and `club_by_source_id()`.
   - **Form builder:** `app/agent/form.py` `build_form` gives each side's last five results, this season's record and the last five meetings. It uses only matches before this kickoff and never the fixture itself.
   - **Where it goes:** into the fixture state (`form`, inside `stateHash`) and a new chat `form` document.
2. **Names (API).**
   - `app/chat/glossary.py` holds `UNIONS`: 28 Test unions with widely used nicknames, for example South Africa: Springboks, Boks, Bokke.
   - `club_aliases` gives each club's short name and feed names.
   - The chat gets a `names` document.
   - The feed only uses current names for past seasons, so former sponsor names (for example "Emirates Lions") are not there.
3. **Player internationals (API).**
   - **Table:** migration `20261001150000_player_internationals.sql` creates `piele.player_internationals`, keyed by club and normalised name. It holds union, caps, the date the caps figure dates from, the date of the latest Test, the source, and an origin of `researcher` or `operator`.
   - **RLS:** `piele_api` may select, insert researcher rows and update researcher rows. It cannot delete, and cannot touch or create operator rows.
   - **Saving:**
     - `POST /v1/agent/previews` accepts `research.{home,away}.internationals`: at most 30, optional, with a strict model.
     - Names that match the side's teamsheet are stored in the preview's transaction, and only for a new `runId`.
     - The teamsheet is read before the transaction, and a failure never costs the preview.
   - **Merge rules:** the latest Test date only moves forward, and caps are replaced only by a figure that is at least as recent.
   - **Readers:**
     - The fixture state returns each side's records for selected players, with sources, outside `stateHash`.
     - The chat reads them in its first transaction and renders an `internationals` document with one citation per record.
   - **Chat context:** `DROP_ORDER` is research, internationals, form, preview, teamsheets. Source URLs now have `<`, `>` and `|` escaped.
4. **Agent.**
   - **Chat prompt** (`lib/chat/instructions.ts`):
     - the new documents;
     - results of the two clubs are in scope;
     - a player's Test team comes only from the internationals document;
     - "not recorded as an international" is used, never "uncapped";
     - "back from Test duty" only with a last Test within eight weeks of kickoff;
     - two new examples, with fictional players so nothing real is invented.
   - **Researcher:**
     - It gains an `internationals` output and duty.
     - `get_fixture_state` now builds each side's researcher request in code (`researcherRequests`, `lib/fixture-inputs.ts`). The request holds the known records, marked for recheck after 30 days, and the selected players without a record.
   - **Before saving:** `save_preview` drops items the API would refuse, rather than letting them fail the whole preview.
   - **Writer instructions:** use the state's form and internationals, and cite known records by their source.
5. **Other.** `apps/web/src/app/core/api/generated.ts` is regenerated (additive schema only). `apps/api/CLAUDE.md`, `apps/api/README.md` and `apps/agent/README.md` are updated.

## Checks run

- **API with the database:** `uv run pytest` against local PostgreSQL 16 with all migrations applied, as `piele_api`, with `PGUSER`, `PGPASSWORD` and `PGDATABASE` set as CI does: 371 passed.
- **API without a database:** 197 passed, 174 skipped.
- **Agent:** with Node 24.21.0, `npm run typecheck`, `npm test` (30 passed) and `npm run build` all pass.
- **Rendered chat context:** read for Lions v Ospreys, using real history and the sample season. It holds the 27-26 win over Leinster on 26 September and five head-to-head meetings.
- **Independent review:** a reviewer subagent checked the whole branch. Its findings are all fixed with tests:
  - RLS on operator rows;
  - records moving backwards;
  - empty or stale season snapshots;
  - known records the writer could not cite;
  - unescaped source URLs;
  - weaker agent validators;
  - a rescheduled fixture appearing in its own form.
- **Key parity:** `player_key` matches between Python and TypeScript on 4,476 cases.

## Not verified

- No run against a real model, AI Gateway or a deployed API.
- No live run of the researcher's internationals duty. The table is empty until previews are next written, so the Springboks question only improves after that.

## Deploy order

1. Apply the migration.
2. Deploy the API.
3. Deploy the agent.

A new agent against an old API gets a 422 on every preview, because `ResearchResult` forbids unknown fields. An old agent against the new API is fine, and so is the new API before the migration: the reads and writes fall back to empty.

## Next steps

1. Deploy in the order above. Check one preview's research for `internationals` and the rows in `piele.player_internationals`.
2. Re-ask both Round 2 questions in staging.
3. Optionally seed or correct rows by SQL with `origin = 'operator'`; the researcher never overwrites them.
4. The web teamsheet still shows a birth-country flag. Consider showing the Test union from `player_internationals` instead.
5. Former club sponsor names, if wanted, need a hand-kept list in `app/chat/glossary.py`.
6. Refresh `history.json` after each season with `scripts/import_urc_history.py`, and add the next competition's `feed_season_id`.
