import { defineState } from 'eve/context';

export interface FixtureInputs {
  readonly inputsHash: string;
  readonly teamsheetHash: string;
}

/**
 * Hashes of the fixture state each preview is written from, by fixture id. Set by
 * get_fixture_state and read by save_preview, so the model never copies them.
 */
export const fixtureInputs = defineState(
  'piele.fixture-inputs',
  (): Record<string, FixtureInputs> => ({}),
);
