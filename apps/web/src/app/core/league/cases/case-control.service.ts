import { Service, inject } from '@angular/core';
import { LeagueData } from '../data/league-data';
import { VetoRuling } from '../league.models';

/** The member's responses to evidence cases, rulings on vetoes and the stand-in reviewer. */
@Service()
export class CaseControlService {
  private readonly data = inject(LeagueData);

  /** Accepts the evidence; the accept that makes a majority accepts it for the league. */
  accept(caseId: string): Promise<void> {
    return this.data.respondToCase(caseId, 'accept', '');
  }

  /** Vetoes the evidence with a reason: voting stops until an uninvolved reviewer rules. */
  veto(caseId: string, reason: string): Promise<void> {
    return this.data.respondToCase(caseId, 'veto', reason);
  }

  /** Upholds (rejects the evidence) or dismisses (reopens voting) the pending veto. */
  review(caseId: string, ruling: VetoRuling, reason: string): Promise<void> {
    return this.data.reviewCase(caseId, ruling, reason);
  }

  /** Captain or admin: names the stand-in reviewer, or clears it with null. */
  setStandIn(memberId: string | null): Promise<void> {
    return this.data.setStandInReviewer(memberId);
  }
}
