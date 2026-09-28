import { HttpErrorResponse } from '@angular/common/http';

/** An API failure with the safe message the API sent, or a generic one. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export function toApiError(error: unknown): ApiError {
  if (error instanceof HttpErrorResponse) {
    const detail: unknown = error.error?.detail;
    if (detail && typeof detail === 'object' && 'message' in detail) {
      const { code, message } = detail as { code?: string; message?: string };
      return new ApiError(
        error.status,
        code ?? 'error',
        message ?? 'The league could not do that.',
      );
    }
    if (Array.isArray(detail) && detail[0]?.msg)
      return new ApiError(error.status, 'validation', String(detail[0].msg));
    if (error.status === 0)
      return new ApiError(0, 'offline', 'The league is unreachable. Check your connection.');
    if (error.status === 401)
      return new ApiError(401, 'unauthenticated', 'Your session has expired. Sign in again.');
    return new ApiError(error.status, 'error', 'The league could not do that right now.');
  }
  return new ApiError(0, 'error', error instanceof Error ? error.message : 'Something went wrong.');
}
