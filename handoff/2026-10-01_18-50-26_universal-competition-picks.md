# Picks: one per account, competition and fixture

Recorded in Africa/Johannesburg time. Branch `claude/universal-competition-picks`, from `master` at `c0e667b`.

## Request

"Picks for the same type of competition should be universal for all leagues." A member of several leagues on one competition makes one pick per match on Superbru, so every league of theirs on that competition now reads the same pick.

## Changes

1. **Migration `20261002090000_universal_picks.sql`.** `piele.picks` is rebuilt. A pick belongs to an account (`user_id`), or to an unclaimed name (`membership_id`, `league_id`) until the name is claimed. It is keyed by `competition_id` and `fixture_id`. Legacy rows are copied; where two leagues held a pick for one account and fixture, the most recently updated wins. Duty links move to the new league-local `piele.pick_duty_links`. Row level security: the account's own picks in any context, the push job, and inside a league context the picks of its names and of its members' accounts.
2. **API (`app/league/service.py`, `tables.py`).** Reads join picks to the league's enrolled members by account or name, on the season's competition. Saves take an advisory lock per owner, competition and fixture. A claim moves the name's picks to the account, and the account's own pick wins on a clash. A release copies the account's picks on the league's competition back to the name. Audit events stay in the league where the change was made. The API contract is unchanged, so the web app needs no change.
3. **Push (`app/push/job.py`).** A member who picked in another league on the same competition gets no reminder.
4. **Tests.** `test_league.py`: the league-isolation test is split; new tests cover sharing between leagues, claim merging and release. `test_push.py`: a pick in another league stops the reminder. `test_database.py`: the picks constraint and row level security tests match the new table.
5. **Docs.** README, `apps/api/CLAUDE.md`, `apps/api/README.md`, and a decision row in `docs/multi-league-architecture.md`.

## Checks run

- Local PostgreSQL 16 with every migration applied from scratch, then `uv --directory apps/api run pytest -q` with `PIELE_TEST_DATABASE_URL`: 375 passed. Baseline before the change: 371 passed.
- Migration data copy, checked on a scratch database with legacy rows: a two-league collision kept the newer pick, the unclaimed name's pick stayed league-local, both duty links were copied, and the legacy table was dropped. Row level security showed league B only its members' picks and no rows without a context.

## Unresolved

- Between the migration and the API deploy, the previous API's picks routes fail. Deploy the API right after Supabase applies the migration.
- Season rules stay per league. A default pick recorded in a league that allows defaults is also read by a league that does not.
- A pick confirmation duty in one league records a `missed` pick on the account when there is none, and the member's other leagues read it.
- A release copies all of the account's picks on the competition to the name, including those made through another league.

## Next steps

- Optional: tell the member in the pick form that the pick is shared with their other leagues on the competition. The API would need to report those leagues.
