import { Service, inject } from '@angular/core';
import { LeagueData } from './data/league-data';

/** Where the league's records come from and whether they are loading or failed to load. */
@Service()
export class LeagueRecordsService {
  private readonly data = inject(LeagueData);

  /** Sample records are illustrative and must be labelled as such. */
  readonly sample = this.data.source === 'sample';
  readonly source = this.data.source;
  readonly loading = this.data.loading;
  readonly error = this.data.error;

  reload(): void {
    this.data.reload();
  }
}
