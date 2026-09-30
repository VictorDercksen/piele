import { StandingsMeasure } from './standings.page.models';

const MEASURES: readonly StandingsMeasure[] = ['round', 'season', 'marks'];

/** The tab a `table` query parameter names, else the round. */
export function measureFrom(value: string | null): StandingsMeasure {
  return MEASURES.find((measure) => measure === value) ?? 'round';
}
