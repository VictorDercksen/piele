import { defineTool } from 'eve/tools';
import { z } from 'zod';
import { fixtureInputs } from '../lib/fixture-inputs';
import { pavilionApi } from '../lib/pavilion-api';

// Where the state's facts come from, so the preview can cite them like any other source.
const STATE_SOURCES = [
  { url: 'https://www.unitedrugby.com/', title: 'URC match centre teamsheets', publisher: 'United Rugby Championship' },
  { url: 'https://open-meteo.com/', title: 'Kickoff forecast', publisher: 'Open-Meteo' },
];

interface FixtureState {
  fixtureId: string;
  teamsheetStatus: string;
  teamsheetHash: string | null;
  stateHash: string;
  [key: string]: unknown;
}

export default defineTool({
  description:
    "Get one fixture's structured state: both published teamsheets, changes from each side's " +
    'previous teamsheet, regular starters missing, ages, bench split, rest days, travel and ' +
    'the kickoff forecast. Write the preview from this and the team research only.',
  inputSchema: z.object({ fixtureId: z.string().regex(/^\d{1,12}$/) }),
  label: { start: ({ fixtureId }) => `Read the state of fixture ${fixtureId}` },
  async execute({ fixtureId }, ctx) {
    const { stateHash, teamsheetHash, ...state } = await pavilionApi<FixtureState>(
      `/fixtures/${fixtureId}/state`,
      { signal: ctx.abortSignal },
    );
    if (!teamsheetHash) {
      return { ...state, note: 'Teamsheets are not published. Do not write a preview for this fixture.' };
    }
    fixtureInputs.update((known) => ({
      ...known,
      [fixtureId]: { inputsHash: stateHash, teamsheetHash },
    }));
    return { ...state, sources: STATE_SOURCES };
  },
});
