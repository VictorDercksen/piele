import { Service, inject } from '@angular/core';
import { LeagueData } from '../data/league-data';

/** The season's Superbru rules. */
@Service()
export class RulesService {
  private readonly data = inject(LeagueData);

  readonly rules = this.data.rules;
}
