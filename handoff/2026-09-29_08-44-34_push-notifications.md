# Push notifications

## Request

Push notifications for the web app added to the Home Screen (iPhone, iPad and Android). Event
kinds, confirmed by Victor:

- A duty for you; your evidence accepted or rejected.
- Evidence waiting for your vote; a veto waiting for your ruling.
- Teamsheets available; Pavilion preview available.
- A match you have not picked: a reminder 24 hours before kickoff, and again 1 hour before.

Testing happens on production. Plan decision P5 (push deferred) is updated.

## How it works

- **Device.** More > "Notifications on this device" turns push on (the permission prompt needs
  a tap), off, and chooses per league which kinds arrive: `picks`, `matches`, `duties`,
  `cases`. iPhone/iPad in Safari get Home Screen instructions instead, because iOS offers push
  only to the installed app (iOS 16.4+). Signing out turns push off for that device first.
- **League events** queue a message in the transaction of their feed entry
  (`service.write_record` → `app/push/league_events.py`). Nobody hears about their own action.
  Veto messages go to whoever may rule (captain unless involved, then the stand-in) and name no
  voter.
- **Cron job.** Vercel Cron calls `GET /v1/cron/push` every 5 minutes (production deployments
  only). `app/push/job.py`:
  1. records newly published teamsheets for fixtures inside the publication window;
  2. announces each fixture's teamsheets and first preview once (`push_announcements`), only
     for events seen in the last 6 hours and fixtures still to kick off; one message per
     account per kind per run, grouped across fixtures;
  3. pick reminders per member (`push_reminders`), for fixtures from the season's Superbru
     starting round with both teams known, grouped per member and lead; the 1-hour reminder
     replaces the 24-hour one on the device (same tag);
  4. sends the outbox: leases of 2 minutes, retries on the next runs (3 attempts), 404/410
     deletes the subscription, expired messages and recipients who left the league are dropped.
- **Sending** (`app/push/webpush.py`): RFC 8291 encryption and RFC 8292 VAPID with the existing
  `cryptography`, `pyjwt` and `httpx`; no new dependency. The encryption reproduces the RFC 8291
  appendix A vector exactly (a test). Endpoints must be on a browser push service (FCM, Mozilla,
  Apple, Windows), checked on input and again before sending. An account keeps its 10 newest
  browsers.
- **RLS.** The job sets `piele.job = 'push'`: it may list leagues, read memberships and work the
  push tables; league reads still set each league's context. A league context can queue
  (insert) and read its own league's queued messages (needed by `on conflict do nothing`).

## Files

- Migration: `supabase/migrations/20260929090000_push_notifications.sql`.
- API: `app/push/` (`webpush.py`, `outbox.py`, `league_events.py`, `job.py`, `tables.py`,
  `keys.py`), `app/routers/push.py`, `app/config.py`, `app/main.py`, `app/league/service.py`
  (hook), `app/league/tables.py` (`push_muted`), `vercel.json` (cron), `tests/test_push.py`.
- Web: `src/app/core/push/` (`PushClient`, `PushService`, `PushControlService`, models, device
  checks, specs), `features/more/push-card/`, `more.page.*`, `core/league/league-context.ts`
  (sign-out), `core/api/generated.ts` (regenerated), `index.html` (manifest, apple-touch-icon),
  `public/sw.js`, `public/manifest.webmanifest`, `public/assets/icons/` (rendered from
  `piele-crest.png`; the badge is a rugby-ball silhouette), `vercel.json` (CSP `worker-src`,
  `manifest-src`; `sw.js` no-cache; manifest content type).
- Docs: `docs/production.md` (variables, step 5, release notes), `apps/api/README.md`,
  `README.md`, `piele-application-plan.md` (P5), `apps/api/CLAUDE.md`, `apps/web/CLAUDE.md`.

## Checks

- API: `uv run pytest` against local PostgreSQL 16 with every migration applied: 230 passed,
  2 skipped. The skips are `test_updates.py` round 1 milestone tests that skip when the local
  database already has those rows (pre-existing behaviour). `tests/test_push.py`: 18 tests.
- `job.run` end to end against the local test database with a fake sender: completed in 2.4 s.
- Web (Node 24.21.0): `npm run build` (no warnings), `npm test -- --watch=false` (107 files,
  538 passed), `npm run check:api` (types match), `npm run test:e2e` (71 passed) and
  `npm run test:e2e:production` (3 passed). Playwright ran with the container's Chromium 1194
  through a temporary config that was deleted afterwards.
- Service worker in Chromium: a push delivered through DevTools
  (`ServiceWorker.deliverPushMessage`) showed a notification with the sent title, body, tag and
  link.
- Not run: a real subscription through FCM, Mozilla or Apple (needs a device and the production
  keys), the Vercel Cron trigger, and the migration on the production database.

## To turn it on in production

1. Merge to `master` (the Supabase integration applies the migration).
2. On `piele-api` Production set `PIELE_VAPID_PRIVATE_KEY` (from
   `uv run python -m app.push.keys`), `PIELE_VAPID_SUBJECT` (`mailto:…`) and `CRON_SECRET`
   (32+ characters). Redeploy.
3. Check `/v1/push/key`, then Settings > Cron Jobs; turn notifications on from More on a phone.

## Unresolved

- The cron route answers 503 until the three variables are set; Vercel logs each 5-minute
  failure until then.
- Evidence cases still settle lazily: an automatic accept after 24 hours (and its "Evidence
  accepted" message) happens at the next request that reads duties, cases, marks or the feed.
- Teamsheet and preview messages go to every member with the kind on; members who want fewer
  turn `matches` off.
