import { NotificationsRead } from './league.models';

const STORAGE_KEY = 'piele-notifications-read-v2';
export const EMPTY_READ: NotificationsRead = { readAt: null, readKeys: [] };

/** Browser-kept read state for builds without the league API. */
export function loadStoredRead(): NotificationsRead {
  try {
    return parseRead(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null'));
  } catch {
    return EMPTY_READ;
  }
}

export function storeRead(read: NotificationsRead): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(read));
  } catch {
    // Read status is a convenience; the panel still works without storage.
  }
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
