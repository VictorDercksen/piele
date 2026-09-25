import { defineSchedule } from 'eve/schedules';
import previews from '../channels/previews';
import { pieleApi } from '../lib/piele-api';

interface Dispatches {
  generatedAt: string;
  dispatches: {
    fixtureId: string;
    round: number;
    kickoffUtc: string;
    homeId: string;
    awayId: string;
    reason: 'first_preview' | 'retry';
    attempt: number;
  }[];
}

/**
 * Every 15 minutes (UTC), without a model call: claim the fixtures whose teamsheets are
 * both published and that have no preview yet, then start one writing session per claim.
 * The API holds each claim for a lease, so overlapping ticks never start two sessions for
 * a fixture, and retries a session that saved nothing a limited number of times.
 */
export default defineSchedule({
  cron: '*/15 * * * *',
  run({ to, waitUntil, appAuth }) {
    waitUntil(
      (async () => {
        const { dispatches } = await pieleApi<Dispatches>('/dispatches', { method: 'POST' });
        await Promise.all(
          dispatches.map(({ fixtureId, attempt, round, kickoffUtc }) =>
            to(previews, { fixtureId, attempt }).send(
              `Write the Piele preview for fixture ${fixtureId} (round ${round}, kickoff ${kickoffUtc} UTC).`,
              { auth: appAuth },
            ),
          ),
        );
      })(),
    );
  },
});
