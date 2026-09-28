import { Duty, DutyEvidence } from '../league.models';

export interface RoundDutyView extends Duty {
  readonly mine: boolean;
  readonly spoon: boolean;
  readonly statusLabel: string;
}

/** Evidence waiting for the captain, with its duty; `selfReview` when the duty is the member's. */
export interface ReviewView {
  readonly duty: RoundDutyView;
  readonly evidence: DutyEvidence;
  readonly selfReview: boolean;
}
