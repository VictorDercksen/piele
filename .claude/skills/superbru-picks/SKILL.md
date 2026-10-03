---
name: superbru-picks
description: Scrape a Superbru URC predictor pool (members, real names, picks per round with lock status) and import the picks, and optionally missing members, into a league of this application's production database. Use when asked to pull, sync, import or backfill Superbru picks or pool members for a league, or to fill in a round's picks for members who are not registered in the app.
---

# Superbru picks into a league

Reads a Superbru pool with headless Chromium and writes the picks into `piele.picks` for one league, the same way the captain's pick recording in the API does (`apps/api/app/league/service.py`, `record_picks` and `add_member`).

## Known pools and leagues

| App league | League id | Season id | Superbru pool |
|---|---|---|---|
| URC 26/27 | `a7697531-0bb9-47d8-8106-7a8b1be25ba1` | `9512fb34-e830-46be-b0bc-e3f570b17ad8` | `13339710` "!!URC 26/27!!" (shown as "URC 26/27") |
| Piele | `d543faf1-47bf-4258-bc92-ca47ab8434c9` | `470d7ab6-b952-47e0-bb90-063ad60d37dc` | `13345943` "Piele URC 26/27" |

Production Supabase project: `lnifzhrdvuqskwiblmqh`. The captain of URC 26/27 is Victor Dercksen: membership `2c0cafc7-4ed2-49ad-ae2a-8379679dcf68`, user `4fab5f14-69af-4529-8244-61ca5adf79e8`. He is also captain of Piele: membership `3ecf8d81-9faa-4499-ab9d-07f77eeb6d89`. For another league, read these from `piele.leagues`, `piele.seasons` and `piele.league_memberships`, and run `--list-pools` to find the pool. Ask the user to confirm a pool you have not used before.

## Before starting

1. Check `SUPERBRU_EMAIL` and `SUPERBRU_PASSWORD` are set without printing them. Stop if either is missing. Never echo, log or write them, and keep them out of screenshots, traces and HAR files.
2. Playwright resolves from the working directory, `apps/web/node_modules` (`npm run setup`), or the global npm root.
3. In a Claude Code cloud session, Chromium fails with `net::ERR_CERT_AUTHORITY_INVALID` because the agent proxy re-signs HTTPS. Run `bash scripts/trust-proxy-ca.sh --verify` once per container. That covers browser navigation. `--names` sends requests from Node, which has its own trust store, so also set `NODE_EXTRA_CA_CERTS` to the same bundle (`/root/.ccr/ca-bundle.crt`) in the command that runs the scraper. Never use `ignoreHTTPSErrors`, `--ignore-certificate-errors` or anything else that turns TLS verification off, and never bypass `HTTPS_PROXY`. If the script is blocked by a permission check, stop and ask the user to approve it. Don't look for another way in.
4. Put all output in the scratchpad, not the repository.

## Scrape

```
node .claude/skills/superbru-picks/scripts/superbru.mjs --list-pools
node .claude/skills/superbru-picks/scripts/superbru.mjs --pool 13339710 --out <scratch>/sb [--rounds 2] [--names]
```

- If the script says login did not complete (captcha, "verify it's you" or other extra check), stop and tell the user.
- Confirm the member count against the pool's stated player count in the output. If they differ, tell the user before importing.
- `--names` reads each member's real name from their profile dialog, one request per member. Use it only when members will be added.
- Rows in `superbru.json` carry `game_status` (`complete` or `scheduled`), `lock` (`locked`, `unlocked` or empty for played matches), `picked_team` (`Draw` for a draw), `not_picked_yet`, and `no_row` for a member with no pick row.
- Requests go one at a time with pauses. Don't add parallelism or crawl other pages.

## Import rules

These were agreed with the user. Ask before departing from them.

1. Picks are written only for the league's unclaimed names (`user_id is null`). Members registered in the app make their own picks there, so leave them alone and report any gaps instead.
2. A completed match: every pick is final. A member with no pick gets `missed`.
3. A match not yet completed: only `locked` picks. Unlocked picks ("Pick not locked. Player may still change it.") and "Not picked yet" are left out. Re-run after the match to fill them in.
4. An existing pick is never changed (`on conflict do nothing`). Corrections go through the user.
5. New members (`--add-members`) get `full_name` as "Surname, First" from the real name on their profile, split at the first space, keeping Superbru's spelling and casing. Without a real name the Superbru name is used.
6. A new member whose Superbru name matches a claimed account in another league of the same person: ask the user whether to link it (`--link "Name=<user uuid>"`). Check the account's stored picks against Superbru first as evidence.
7. No feed entries and no push notifications. The audit trail records each import (`membership.created`, `picks.recorded` per fixture).

## Build and run the SQL

```
python .claude/skills/superbru-picks/scripts/build-import-sql.py <scratch>/sb/superbru.json \
  --league-id <league> --season-id <season> \
  --actor-membership-id <captain membership> --actor-user-id <captain user> --actor-label "<captain display name>" \
  [--rounds 2] [--add-members] [--link "Name=<uuid>"] --dry-run > <scratch>/dry.sql
```

1. Run the `--dry-run` SQL with Supabase `execute_sql`. It always fails on purpose with `DRY RUN, rolled back: members added N, picks added N, pool names not in the league N`. Check those numbers make sense. A pool name not in the league means a member must be added first, or the names differ.
2. Tell the user what will be written (counts per match, `missed` picks, picks left out) and get a go-ahead for the production write.
3. Rebuild without `--dry-run` and run it. Matches are mapped to fixtures by round and team slug (`apps/api/app/competitions/urc_2026_27/schedule.json`). The builder exits if a match has no fixture.

## Verify

```sql
select p.fixture_id, count(*) picks, count(*) filter (where p.side = 'missed') missed
from piele.picks p join piele.league_memberships m on m.id = p.membership_id
where m.league_id = '<league>' and p.competition_id = 'urc-2026-27'
  and p.fixture_id in (<round fixture ids>)
group by 1 order by 1;
```

Compare against the scrape. Round standings (`piele.round_standings`) are entered by the captain and are not derived from picks.

## Finish

Delete the scratch output (it holds members' real names). The scripts never save cookies. Report: members found against the expected count, picks written per match, `missed` picks, picks left out as unlocked or not picked yet, and registered members whose picks are missing in the app.
