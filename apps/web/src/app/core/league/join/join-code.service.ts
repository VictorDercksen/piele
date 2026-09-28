import { Service, inject } from '@angular/core';
import { LeagueData } from '../data/league-data';

/** The league's join code for its steward. */
@Service()
export class JoinCodeService {
  private readonly data = inject(LeagueData);

  /** Null for members, or when joining is closed. */
  readonly joinCode = this.data.joinCode;
}
