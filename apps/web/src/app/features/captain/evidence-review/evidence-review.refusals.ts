import { ApiError } from '../../../core/api/api-error';

/**
 * The captain's override refused because the evidence was decided first, most often by its
 * vote closing just before: a warning, as the records reload to show the outcome.
 */
export function overrideRefusal(error: unknown): string | null {
  return error instanceof ApiError && error.code === 'already_decided'
    ? 'This evidence was already decided, perhaps by its vote closing just now. The records have been reloaded to show the outcome.'
    : null;
}
