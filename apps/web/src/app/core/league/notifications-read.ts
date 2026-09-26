import { readRenamedKey } from '../storage/renamed-key';
import { NotificationsRead } from './league.models';

const STORAGE_KEY = 'pavilion-notifications-read-v2';
/** The key before the rename to The Pavilion, read once and moved. */
const LEGACY_STORAGE_KEY = 'piele-notifications-read-v2';
/** The league whose browser-kept values predate league slugs. */
export const FIRST_LEAGUE_SLUG = 'piele';
export const EMPTY_READ: NotificationsRead = { readAt: null, readKeys: [] };

/**
 * Browser-kept read state for builds without the league API, one entry per league slug.
 * Without a slug (no league chosen yet) it uses the key from before leagues had slugs, which
 * is also where the first league (`piele`) reads a value kept by an earlier version.
 */
export function loadStoredRead(slug?: string | null): NotificationsRead {
  try {
    return parseRead(JSON.parse(readStoredValue(slug) ?? 'null'));
  } catch {
    return EMPTY_READ;
  }
}

export function storeRead(read: NotificationsRead, slug?: string | null): void {
  try {
    localStorage.setItem(readKey(slug), JSON.stringify(read));
  } catch {
    // Read status is a convenience; the panel still works without storage.
  }
}

function readKey(slug?: string | null): string {
  return slug ? `${STORAGE_KEY}:${slug}` : STORAGE_KEY;
}

function readStoredValue(slug?: string | null): string | null {
  if (!slug) return readRenamedKey(STORAGE_KEY, LEGACY_STORAGE_KEY);
  const key = readKey(slug);
  if (slug !== FIRST_LEAGUE_SLUG) return localStorage.getItem(key);
  return readRenamedKey(key, STORAGE_KEY) ?? readRenamedKey(key, LEGACY_STORAGE_KEY);
}

/** Accepts only the shape this app wrote; anything else counts as nothing read. */
export function parseRead(value: unknown): NotificationsRead {
  if (!value || typeof value !== 'object') return EMPTY_READ;
  const { readAt, readKeys } = value as Record<string, unknown>;
  return {
    readAt: typeof readAt === 'string' && !Number.isNaN(Date.parse(readAt)) ? readAt : null,
    readKeys: Array.isArray(readKeys)
      ? readKeys.filter((k): k is string => typeof k === 'string')
      : [],
  };
}
