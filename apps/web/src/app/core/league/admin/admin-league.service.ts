import { Service, inject } from '@angular/core';
import { AdminData } from './admin-data';
import { CaptainCandidate, CompetitionOption } from './admin.models';

/** The management centre's leagues (`/manage`, the admin only), archived included. */
@Service()
export class AdminLeagueService {
  private readonly data = inject(AdminData);

  /** Every league: active first, then by name. */
  readonly leagues = this.data.leagues;
  readonly loading = this.data.loading;
  /** A safe message when the list could not be loaded. */
  readonly error = this.data.error;

  /** Loads the league list. */
  load(): Promise<void> {
    return this.data.load();
  }

  /** The competitions a new league can play, loaded once. */
  competitions(): Promise<readonly CompetitionOption[]> {
    return this.data.competitions();
  }

  /** The league's active, claimed members, who can be appointed captain. */
  captainCandidates(id: string): Promise<readonly CaptainCandidate[]> {
    return this.data.captainCandidates(id);
  }
}
