import { defineTool } from 'eve/tools';
import { z } from 'zod';
import { pieleApi } from '../lib/piele-api';

interface DueFixtures {
  generatedAt: string;
  fixtures: {
    fixtureId: string;
    round: number;
    kickoffUtc: string;
    homeId: string;
    awayId: string;
    reason: 'first_preview' | 'teamsheet_changed' | 'final_refresh';
    latestRevision: number | null;
  }[];
}

export default defineTool({
  description:
    'List the URC fixtures that need a Piele preview now, soonest kickoff first, with the reason for each.',
  inputSchema: z.object({}),
  label: { start: () => 'Check which fixtures need a preview' },
  async execute(_input, ctx) {
    return pieleApi<DueFixtures>('/fixtures/due', { signal: ctx.abortSignal });
  },
});
