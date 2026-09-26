import { Competition } from './competition.models';
import { URC_2026_27 } from './urc-2026-27';

/** The competition a league plays when nothing names another (the first league's). */
export const DEFAULT_COMPETITION_ID = 'urc-2026-27';

/** Every competition the app can show, by id. A new competition is one more entry. */
export const COMPETITIONS: ReadonlyMap<string, Competition> = new Map(
  [URC_2026_27].map((c) => [c.id, c]),
);

/** The registered competition with this id. Throws for an unknown id. */
export function competition(id: string): Competition {
  const found = COMPETITIONS.get(id);
  if (!found) throw new Error(`Unknown competition: ${id}`);
  return found;
}
