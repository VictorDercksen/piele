import { ApiError } from '../../../core/api/api-error';

/**
 * Refusals that mean the case moved on while the member looked at it, as warnings. The
 * records reload with them (`CaseControlService`), so each says to look again.
 */
const CASE_REFUSALS: Record<string, string> = {
  stale_case:
    'This case changed while you were reviewing it. It has been reloaded: check it and rule again.',
  voting_closed:
    'Voting on this evidence has closed. The case has been reloaded to show its outcome.',
  veto_final: 'Your veto stands and cannot be changed.',
  not_in_review:
    'This veto was already ruled on. The case has been reloaded to show where it stands.',
  not_reviewer: 'You can no longer rule on this veto: it needs an uninvolved reviewer.',
  not_a_voter: 'You are not voting on this evidence.',
};

/** The warning for a case refusal, or null for a failure to show as an error. */
export function caseRefusal(error: unknown): string | null {
  return error instanceof ApiError ? (CASE_REFUSALS[error.code] ?? null) : null;
}
