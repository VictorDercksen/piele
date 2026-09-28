import { Service, inject } from '@angular/core';
import { ApiError } from '../../api/api-error';
import { LeagueData } from '../data/league-data';
import { EvidenceSubmission, NewDuty } from '../league.models';

/** Duty assignments, evidence and the captain's decisions on them. */
@Service()
export class DutyControlService {
  private readonly data = inject(LeagueData);

  createDuty(duty: NewDuty): Promise<void> {
    return this.data.createDuty(duty);
  }

  submitEvidence(submission: EvidenceSubmission): Promise<void> {
    return this.data.submitEvidence(submission);
  }

  /**
   * The captain's override. Refused `already_decided` when the evidence was decided first,
   * for instance by its vote closing just now: the records reload to show the outcome.
   */
  async decideEvidence(
    linkId: string,
    decision: 'accepted' | 'rejected',
    reason: string,
  ): Promise<void> {
    try {
      await this.data.decideEvidence(linkId, decision, reason);
    } catch (error) {
      if (error instanceof ApiError && error.code === 'already_decided') this.data.reload();
      throw error;
    }
  }

  voidDuty(dutyId: string, reason: string): Promise<void> {
    return this.data.voidDuty(dutyId, reason);
  }

  /** A challenge resolved in the member's favour: the overdue clock restarts now. */
  resetClock(dutyId: string, reason: string): Promise<void> {
    return this.data.resetClock(dutyId, reason);
  }
}
