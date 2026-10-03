"""Builds one SQL block that imports Superbru picks (and optionally members) into a league.

Reads superbru.json from superbru.mjs and prints a PL/pgSQL `do` block for Supabase's
execute_sql. The block:
  - adds members whose Superbru name is not yet in the league (--add-members), as unclaimed
    names, or linked to an existing account with --link "Name=<user uuid>";
  - inserts picks for the league's unclaimed names only (claimed accounts pick in the app);
  - takes every pick of a completed match (no pick there is stored as `missed`) and only the
    locked picks of a match not yet completed;
  - never changes an existing pick (`on conflict do nothing`);
  - writes the audit events the API writes (`membership.created`, `picks.recorded` per fixture);
  - with --dry-run, raises an exception carrying the counts, so nothing is kept.

Usage:
  python build-import-sql.py superbru.json --league-id <uuid> --season-id <uuid>
      --actor-membership-id <uuid> --actor-user-id <uuid> --actor-label "<captain name>"
      [--rounds 1,2] [--add-members] [--link "Name=<uuid>"]... [--dry-run] > import.sql
"""

import argparse
import json
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[4]
DEFAULT_SCHEDULE = REPO / "apps/api/app/competitions/urc_2026_27/schedule.json"


def slug(team: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", team.lower()).strip("-")


def q(text: str) -> str:
    return "'" + text.replace("'", "''") + "'"


def full_name(member: dict) -> str:
    """'Surname, First' from the profile's real name (first word is the first name), else the
    Superbru name."""
    first, _, last = (member.get("real_name") or "").strip().partition(" ")
    if first and last.strip():
        return f"{last.strip()}, {first}"
    return first or member["superbru_name"]


def pick_values(row: dict) -> tuple[str, int | None] | None:
    """(side, margin) to store, or None to leave the pick out."""
    complete = row["game_status"] == "complete"
    if not row["picked_team"]:
        return ("missed", None) if complete else None
    if not complete and row["lock"] != "locked":
        return None
    if row["picked_team"] == "Draw":
        return "draw", 0
    side = "home" if row["picked_team"] == row["home"] else "away" if row["picked_team"] == row["away"] else None
    if side is None:
        sys.exit(f"Unrecognised pick {row['picked_team']!r} in {row['match']}")
    margin = int(row["picked_margin"])
    if not 1 <= margin <= 150:
        sys.exit(f"Margin out of range for {row['superbru_name']} in {row['match']}: {margin}")
    return side, margin


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("superbru_json")
    parser.add_argument("--league-id", required=True)
    parser.add_argument("--season-id", required=True)
    parser.add_argument("--competition-id", default="urc-2026-27")
    parser.add_argument("--schedule", default=str(DEFAULT_SCHEDULE))
    parser.add_argument("--actor-membership-id", required=True)
    parser.add_argument("--actor-user-id", required=True)
    parser.add_argument("--actor-label", required=True)
    parser.add_argument("--rounds", help="comma-separated; default all rounds in the JSON")
    parser.add_argument("--add-members", action="store_true")
    parser.add_argument("--link", action="append", default=[], help='"Superbru name=<user uuid>"')
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    data = json.loads(Path(args.superbru_json).read_text(encoding="utf-8"))
    schedule = json.loads(Path(args.schedule).read_text(encoding="utf-8"))["fixtures"]
    fixtures = {(f["round"], f["homeId"], f["awayId"]): f["id"] for f in schedule}
    rounds = {int(r) for r in args.rounds.split(",")} if args.rounds else {p["round"] for p in data["picks"]}
    links = dict(item.split("=", 1) for item in args.link)
    names = {m["superbru_name"] for m in data["members"]}
    if unknown := set(links) - names:
        sys.exit(f"--link names not in the pool: {sorted(unknown)}")

    picks, skipped = [], 0
    for row in data["picks"]:
        if row["round"] not in rounds:
            continue
        key = (row["round"], slug(row["home"]), slug(row["away"]))
        if key not in fixtures:
            sys.exit(f"No schedule fixture for round {row['round']} {row['match']} (looked for {key[1]} v {key[2]})")
        values = pick_values(row)
        if values is None:
            skipped += 1
            continue
        picks.append((row["superbru_name"], fixtures[key], *values))
    if not picks:
        sys.exit("No picks to import.")
    print(f"-- {len(picks)} candidate picks, {skipped} left out (unlocked or not picked yet)", file=sys.stderr)
    if args.add_members:
        fallback = [m["superbru_name"] for m in data["members"] if m["superbru_name"] not in links and full_name(m) == m["superbru_name"]]
        if fallback:
            print(f"-- WARNING: no real name, full_name would be the Superbru name for: {', '.join(fallback)}", file=sys.stderr)

    members = ",\n".join(
        f"({q(m['superbru_name'])},{q(full_name(m))},{q(links[m['superbru_name']]) + '::uuid' if m['superbru_name'] in links else 'null::uuid'})"
        for m in data["members"]
    )
    pick_rows = ",\n".join(f"({q(n)},{q(f)},{q(s)},{'null::int' if m is None else m})" for n, f, s, m in picks)
    league, actor = args.league_id, args.actor_membership_id
    reason = f"Imported from the Superbru pool {data['pool_name']} (round{'s' if len(rounds) > 1 else ''} {', '.join(map(str, sorted(rounds)))})."
    add_members = f"""
create temp table _ins(id uuid, display_name text, user_id uuid) on commit drop;
with i as (
  insert into piele.league_memberships (league_id, user_id, display_name, full_name)
  select '{league}', n.user_id, n.display_name, n.full_name from _nm n
  where not exists (select 1 from piele.league_memberships m where m.league_id = '{league}' and m.display_name = n.display_name)
  returning id, display_name, user_id)
insert into _ins select id, display_name, user_id from i;
get diagnostics n_m = row_count;
insert into piele.season_memberships (league_id, season_id, membership_id) select '{league}', '{args.season_id}', id from _ins;
insert into piele.audit_events (league_id, actor_membership_id, actor_label, action, entity_type, entity_id, reason, after)
select '{league}', '{actor}', {q(args.actor_label)}, 'membership.created', 'league_membership', i.id, {q(reason)},
       jsonb_build_object('displayName', i.display_name, 'fullName', n.full_name, 'emailSet', false)
from _ins i join _nm n using (display_name);""" if args.add_members else ""

    sql = f"""do $$
declare n_m int := 0; n_p int; n_unmatched int;
begin
create temp table _nm(display_name text, full_name text, user_id uuid) on commit drop;
insert into _nm values
{members};
create temp table _pk(display_name text, fixture_id text, side text, margin int) on commit drop;
insert into _pk values
{pick_rows};
{add_members}
-- Pool members the league does not know get no picks; report them.
select count(distinct pk.display_name) into n_unmatched from _pk pk
where not exists (select 1 from piele.league_memberships m where m.league_id = '{league}' and m.display_name = pk.display_name);
create temp table _owned(display_name text, fixture_id text, side text, margin int) on commit drop;
with p as (
  insert into piele.picks (competition_id, fixture_id, membership_id, league_id, side, margin, is_default, recorded_by_user_id)
  select {q(args.competition_id)}, pk.fixture_id, m.id, '{league}', pk.side, pk.margin, false, '{args.actor_user_id}'
  from _pk pk join piele.league_memberships m
    on m.league_id = '{league}' and m.user_id is null and m.status = 'active' and m.display_name = pk.display_name
  on conflict do nothing
  returning membership_id, fixture_id, side, margin)
insert into _owned select m.display_name, p.fixture_id, p.side, p.margin from p join piele.league_memberships m on m.id = p.membership_id;
get diagnostics n_p = row_count;
insert into piele.audit_events (league_id, actor_membership_id, actor_label, action, entity_type, entity_id, reason, before, after)
select '{league}', '{actor}', {q(args.actor_label)}, 'picks.recorded', 'picks', null, {q(reason)},
       jsonb_build_object('fixtureId', fixture_id, 'picks', jsonb_object_agg(display_name, null)),
       jsonb_build_object('fixtureId', fixture_id, 'picks', jsonb_object_agg(display_name, case when side in ('home', 'away') then side || ' ' || margin else side end))
from _owned group by fixture_id;
{"raise exception" if args.dry_run else "raise notice"} '{"DRY RUN, rolled back: " if args.dry_run else ""}members added %, picks added %, pool names not in the league %', n_m, n_p, n_unmatched;
end $$;"""
    print(sql)


if __name__ == "__main__":
    main()
