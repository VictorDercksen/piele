# Notifications panel: pool starvation and missing kick-offs

Follow-up to `2026-09-26_10-33-16_notifications-panel-rework.md` after PR #31 reached production.

## Request

Two reports from production during Round 1: a match kicked off without a notification, and every notification showed as unread again on each reopening of the app.

## Cause, from the production API logs and database

- The runtime engine has a pool of one connection (`apps/api/app/db.py`, deliberate for the transaction pooler). `GET /v1/rounds/{round}/updates` ran under `actor_dependency`, which holds the request transaction, and then called the match centre, whose PostgreSQL snapshot cache opens its own connection from the same pool. Every such request waited the 30-second pool timeout, logged `QueuePool limit of size 1 overflow 0 reached`, and while it waited every other request queued behind it: `PUT /v1/me/notifications` and `GET /v1/rounds/2/updates` returned 500, and `/v1/rounds/1/scores` reads of the snapshot cache failed and fell back to the provider.
- So the read state was never saved (the panel showed the optimistic state until the next load, then `/me` returned nothing read), and the round events were unreliable. The migration itself had applied: `piele.users` has both columns and `piele.fixture_milestones` exists on `piele-production`.
- Independently, kick-off depended on the score feed reporting `live`, `half_time` or `full_time`. During the URC feed's Cloudflare block the ESPN fallback carries states, but any feed gap hid the kick-off although the time is known from the schedule.
- The database tests had used `MemorySnapshotCache`, which never touches the pool, so they could not show the stall.

## Completed

- `apps/api/app/matchcentre/updates.py`: `round_updates` now takes the engine and an `authorise` callback. It resolves the member and reads milestones and previews in one short transaction, calls the providers with no transaction open, then records new milestones in a second transaction. `build_events` takes `now` and reports `kicked_off` once the published kickoff has passed unless the feed says `postponed` or `cancelled`; the feed can only bring it forward.
- `apps/api/app/league/context.py`: `claims_dependency` (token only, no connection) and `engine_dependency`, used by the route in `apps/api/app/routers/matches.py`, which resolves the actor through `resolve_actor` inside the callback. Other routes are unchanged.
- `apps/api/tests/test_updates.py`: kick-off from the schedule; a database test that builds the app with the real `PostgresSnapshotCache` on the one-connection pool and requires the route to answer in under ten seconds.
- Web `core/league/notifications.service.ts`: times compare as instants (`at` in epoch milliseconds, `Date.parse` in `isUnread`) instead of as strings, so an offset or precision difference between the API's timestamps cannot misplace an item; `withScheduledKickoffs` adds a kick-off for every followed fixture whose time has passed when the API has not reported one (same key, so read state carries over); kick-off wording is "kicked off" with the kickoff time and venue, which stays true after the match; a read state the API refuses is kept and sent again with the next refresh, so a transient failure no longer loses "Mark all read".
- `apps/api/README.md` describes the kick-off rule and the two-transaction shape.

## Checks run

- `uv run pytest` in `apps/api` against a fresh local PostgreSQL 16 with all migrations: 118 passed (2 new, including the pool test, which took well under a second).
- `npx ng test --watch=false` in `apps/web`: 87 passed (2 new). `npx ng build`: complete, no warnings.
- Production logs read through the Vercel tools for the three hours after the merge; production schema checked through the Supabase tools (read-only queries).

## Next steps

- Watch `/v1/rounds/*/updates` and `/v1/me/notifications` in the production logs after deploy; the pool timeout message should not reappear.
- Other routes that mix `actor_dependency` with the match centre would have the same problem; none exist today, and the README now says why.
