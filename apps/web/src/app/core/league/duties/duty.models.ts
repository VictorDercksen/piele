import { Duty, DutyEvidence, EvidenceCaseSummary } from '../league.models';

export interface RoundDutyView extends Duty {
  readonly mine: boolean;
  readonly spoon: boolean;
  readonly statusLabel: string;
  /** The pending evidence's case while members vote on it or a veto awaits review. */
  readonly liveCase: EvidenceCaseSummary | null;
}

/** Evidence waiting for the captain, with its duty; `selfReview` when the duty is the member's. */
export interface ReviewView {
  readonly duty: RoundDutyView;
  readonly evidence: DutyEvidence;
  readonly selfReview: boolean;
}
