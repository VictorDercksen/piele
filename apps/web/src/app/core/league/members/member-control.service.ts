import { Service, inject } from '@angular/core';
import { LeagueData } from '../data/league-data';
import { NewMember } from '../league.models';

/** Steward changes to the team sheet. */
@Service()
export class MemberControlService {
  private readonly data = inject(LeagueData);

  addMember(member: NewMember): Promise<void> {
    return this.data.addMember(member);
  }

  updateMember(memberId: string, email: string | null): Promise<void> {
    return this.data.updateMember(memberId, email);
  }

  /** Undo a wrong claim so the right account can take the name. */
  releaseMember(memberId: string): Promise<void> {
    return this.data.releaseMember(memberId);
  }

  /**
   * Takes a member off the team sheet: open duties are voided, standings and marks stay. An
   * unclaimed name without records is deleted instead.
   */
  withdrawMember(memberId: string, reason: string): Promise<void> {
    return this.data.withdrawMember(memberId, reason);
  }

  /** Puts a withdrawn member back on the team sheet in the active season. */
  reinstateMember(memberId: string): Promise<void> {
    return this.data.reinstateMember(memberId);
  }
}
