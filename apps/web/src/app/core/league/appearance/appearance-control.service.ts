import { Service, inject } from '@angular/core';
import { LeagueData } from '../data/league-data';
import { AppearanceChange, LeagueAppearance } from '../league.models';

/** Steward changes to how the league looks. */
@Service()
export class AppearanceControlService {
  private readonly data = inject(LeagueData);

  /** Saves the league's emblem and accent colour and resolves to how the league now looks. */
  saveAppearance(change: AppearanceChange): Promise<LeagueAppearance> {
    return this.data.saveAppearance(change);
  }
}
