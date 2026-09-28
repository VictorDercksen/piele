import { Service, inject } from '@angular/core';
import { ApiError } from '../../api/api-error';
import { LeagueData } from '../data/league-data';
import { CaseChoice, EvidenceCase, VetoRuling } from '../league.models';

/** The member's responses to evidence cases, rulings on vetoes and the stand-in reviewer. */
@Service()
export class CaseControlService {
  private readonly data = inject(LeagueData);

  /** Accepts the evidence; the accept that makes a majority accepts it for the league. */
  accept(caseId: string): Promise<void> {
    return this.respond(caseId, 'accept', '');
  }

  /** Vetoes the evidence with a reason: voting stops until an uninvolved reviewer rules. */
  veto(caseId: string, reason: string): Promise<void> {
    return this.respond(caseId, 'veto', reason);
  }

  /**
   * Upholds (rejects the evidence) or dismisses (reopens voting) the pending veto of the case
   * as the reviewer saw it: a case changed since is refused `stale_case`.
   */
  review(
    evidenceCase: Pick<EvidenceCase, 'id' | 'version'>,
    ruling: VetoRuling,
    reason: string,
  ): Promise<void> {
    return this.reloadOnConflict(
      this.data.reviewCase(evidenceCase.id, ruling, reason, evidenceCase.version),
    );
  }

  /** Captain or admin: names the stand-in reviewer, or clears it with null. */
  setStandIn(memberId: string | null): Promise<void> {
    return this.data.setStandInReviewer(memberId);
  }

  private respond(caseId: string, choice: CaseChoice, reason: string): Promise<void> {
    return this.reloadOnConflict(this.data.respondToCase(caseId, choice, reason));
  }

  /**
   * A 409 means the case moved on (voting closed, the veto was ruled on, the case changed):
   * the records reload so the page shows where it stands, and the refusal passes on.
   */
  private async reloadOnConflict(action: Promise<void>): Promise<void> {
    try {
      await action;
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) this.data.reload();
      throw error;
    }
  }
}
