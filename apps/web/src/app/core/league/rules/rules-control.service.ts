import { Service, inject } from '@angular/core';
import { LeagueData } from '../data/league-data';
import { LeagueRules } from '../league.models';

/** Steward changes to the season's rules. */
@Service()
export class RulesControlService {
  private readonly data = inject(LeagueData);

  saveRules(change: Partial<LeagueRules>): Promise<void> {
    return this.data.saveRules(change);
  }
}
