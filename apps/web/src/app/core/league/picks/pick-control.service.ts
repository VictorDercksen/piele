import { Service, inject } from '@angular/core';
import { LeagueData } from '../data/league-data';
import { NewPick, StewardPick } from '../league.models';

/** The member's own picks and the steward's pick corrections. */
@Service()
export class PickControlService {
  private readonly data = inject(LeagueData);

  /** The member's own pick for a fixture, before its kickoff. */
  savePick(fixtureId: string, pick: NewPick): Promise<void> {
    return this.data.savePick(fixtureId, pick);
  }

  /** Steward: records or corrects the listed members' picks at any time; others stay. */
  recordPicks(fixtureId: string, picks: readonly StewardPick[]): Promise<void> {
    return this.data.recordPicks(fixtureId, picks);
  }

  /** Steward: removes a member's pick. */
  removePick(fixtureId: string, memberId: string): Promise<void> {
    return this.data.removePick(fixtureId, memberId);
  }

  /** Steward: records the changed picks, then removes the cleared ones one by one. */
  async correctPicks(
    fixtureId: string,
    record: readonly StewardPick[],
    remove: readonly string[],
  ): Promise<void> {
    if (record.length) await this.recordPicks(fixtureId, record);
    for (const memberId of remove) await this.removePick(fixtureId, memberId);
  }
}
