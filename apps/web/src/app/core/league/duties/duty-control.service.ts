import { Service, inject } from '@angular/core';
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

  decideEvidence(linkId: string, decision: 'accepted' | 'rejected', reason: string): Promise<void> {
    return this.data.decideEvidence(linkId, decision, reason);
  }

  voidDuty(dutyId: string, reason: string): Promise<void> {
    return this.data.voidDuty(dutyId, reason);
  }

  /** A challenge resolved in the member's favour: the overdue clock restarts now. */
  resetClock(dutyId: string, reason: string): Promise<void> {
    return this.data.resetClock(dutyId, reason);
  }
}
