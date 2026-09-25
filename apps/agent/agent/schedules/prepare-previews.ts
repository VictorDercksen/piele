import { defineSchedule } from 'eve/schedules';
import previews from '../channels/previews';
import { claimFixtures, sessionPrompt } from '../lib/dispatch';

/**
 * Every 15 minutes (UTC), without a model call: claim the fixtures whose teamsheets are
 * both published and that have no preview yet, then start one writing session per claim.
 * The API holds each claim for a lease, so overlapping ticks never start two sessions for
 * a fixture, and retries a session that saved nothing a limited number of times.
 * POST /previews/run (channels/previews.ts) does the same on demand.
 */
export default defineSchedule({
  cron: '*/15 * * * *',
  run({ to, waitUntil, appAuth }) {
    waitUntil(
      (async () => {
        const dispatches = await claimFixtures();
        await Promise.all(
          dispatches.map((dispatch) =>
            to(previews, { fixtureId: dispatch.fixtureId, attempt: dispatch.attempt }).send(sessionPrompt(dispatch), {
              auth: appAuth,
            }),
          ),
        );
      })(),
    );
  },
});
