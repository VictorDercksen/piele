import { CaseResolution, CaseStatus } from '../league.models';

/** The status tag of a case, shared by the decisions page, the captain's desk and duty cards. */
export const CASE_STATUS_LABELS: Record<CaseStatus, string> = {
  open: 'VOTING OPEN',
  in_review: 'IN REVIEW',
  accepted: 'ACCEPTED',
  rejected: 'REJECTED',
  superseded: 'SUPERSEDED',
};

/** How a closed case ended; null while it is open or in review. */
export function caseOutcome(status: CaseStatus, resolution: CaseResolution | null): string | null {
  if (status === 'superseded') return 'Superseded by newer evidence or a closed duty';
  if (status !== 'accepted' && status !== 'rejected') return null;
  switch (resolution) {
    case 'majority':
      return 'Accepted by a majority of members';
    case 'auto':
      return 'Accepted automatically: no veto within 24 hours';
    case 'no_voters':
      return 'Accepted: no other member could vote';
    case 'veto_upheld':
      return 'Rejected: the veto was upheld';
    case 'captain':
      return status === 'accepted' ? 'Accepted by the captain' : 'Rejected by the captain';
    default:
      return status === 'accepted' ? 'Accepted' : 'Rejected';
  }
}

/** Time left to vote: `5 h 20 min left`, `12 min left`, or `Closing now` once it has passed. */
export function timeLeft(closesAt: string, now: number): string {
  const minutes = Math.floor((Date.parse(closesAt) - now) / 60_000);
  if (!Number.isFinite(minutes) || minutes < 1) return 'Closing now';
  const hours = Math.floor(minutes / 60);
  if (!hours) return `${minutes} min left`;
  return `${hours} h ${minutes % 60} min left`;
}
