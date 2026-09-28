import { Service, inject } from '@angular/core';
import { LeagueData } from '../data/league-data';

/** Steward changes to the league's join code. */
@Service()
export class JoinCodeControlService {
  private readonly data = inject(LeagueData);

  /** A new join code; the old link stops working. Resolves to the new code. */
  rotateJoinCode(): Promise<string> {
    return this.data.rotateJoinCode();
  }

  /** Closes joining: the join link stops working until a new code is made. */
  closeJoinCode(): Promise<void> {
    return this.data.closeJoinCode();
  }
}
