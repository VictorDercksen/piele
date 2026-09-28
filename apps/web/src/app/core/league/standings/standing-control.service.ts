import { Service, inject } from '@angular/core';
import { LeagueData } from '../data/league-data';
import { StandingEntry } from '../league.models';

/** Steward overrides of the round totals derived from the picks. */
@Service()
export class StandingControlService {
  private readonly data = inject(LeagueData);

  /** Replaces a round's recorded totals (overrides); members left out lose theirs. */
  recordStandings(roundId: number, entries: readonly StandingEntry[]): Promise<void> {
    return this.data.recordStandings(roundId, entries);
  }

  /** Clears one member's recorded total for a round. */
  clearStanding(roundId: number, memberId: string): Promise<void> {
    return this.data.clearStanding(roundId, memberId);
  }
}
