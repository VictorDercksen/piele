import { EvidenceCase } from '../league.models';

/** An evidence case decorated for display. */
export interface CaseView extends EvidenceCase {
  /** The duty is the current member's own. */
  readonly mine: boolean;
  readonly spoon: boolean;
  /** Open for voting or waiting for a reviewer. */
  readonly live: boolean;
  /** Short status tag, such as `VOTING OPEN`. */
  readonly statusLabel: string;
  /** How a closed case ended, such as "Accepted by a majority of members". Null while live. */
  readonly outcome: string | null;
  /** When voting closes, on the league's clock. */
  readonly closes: string;
}
