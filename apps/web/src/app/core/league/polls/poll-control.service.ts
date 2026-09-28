import { Service, inject } from '@angular/core';
import { LeagueData } from '../data/league-data';

/** The member's votes in league polls. */
@Service()
export class PollControlService {
  private readonly data = inject(LeagueData);

  castVote(pollId: string, choice: string): Promise<void> {
    return this.data.castVote(pollId, choice);
  }
}
