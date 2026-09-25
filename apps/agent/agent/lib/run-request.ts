import { createHash, timingSafeEqual } from 'node:crypto';
import type { DispatchOptions } from './dispatch';

/** Whether an Authorization header carries the agent token (compared in constant time). */
export function hasAgentToken(authorization: string | null, token: string | undefined): boolean {
  if (!token || !authorization?.startsWith('Bearer ')) return false;
  const digest = (value: string) => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(authorization.slice('Bearer '.length)), digest(token));
}

/**
 * Reads the optional body of POST /previews/run: `{ fixtureId?: string, force?: boolean }`.
 * Returns null when it is not that shape. An empty body means "claim whatever is due".
 */
export function parseRunRequest(text: string): DispatchOptions | null {
  if (!text.trim()) return {};
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return null;
  const { fixtureId, force, ...rest } = body as Record<string, unknown>;
  if (Object.keys(rest).length) return null;
  if (fixtureId !== undefined && (typeof fixtureId !== 'string' || !/^\d{1,12}$/.test(fixtureId))) return null;
  if (force !== undefined && typeof force !== 'boolean') return null;
  if (force && fixtureId === undefined) return null;
  return {
    ...(fixtureId === undefined ? {} : { fixtureId }),
    ...(force === undefined ? {} : { force }),
  };
}
