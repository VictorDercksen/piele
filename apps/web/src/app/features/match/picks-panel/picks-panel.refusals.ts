import { ApiError } from '../../../core/api/api-error';

/** A refused save as the member reads it: a warning for the kickoff lock, else a failure. */
export interface PickRefusal {
  readonly level: 'warn' | 'error';
  readonly message: string;
}

/**
 * The API's refusal as the member reads it: a lock is a warning naming the kickoff (as the
 * league displays it, empty when unknown), anything else a failure with the error's own message.
 */
export function pickRefusal(error: unknown, kickoff: string): PickRefusal {
  if (error instanceof ApiError && error.code === 'picks_locked') {
    return {
      level: 'warn',
      message: kickoff
        ? `Picks for this match closed at kickoff, ${kickoff}.`
        : 'Picks for this match closed at kickoff.',
    };
  }
  return {
    level: 'error',
    message:
      error instanceof Error && error.message
        ? error.message
        : 'The pick could not be saved. Try again.',
  };
}
