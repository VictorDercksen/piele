import { Competition } from '../competition/competition.models';
import { FIRST_LEAGUE_SLUG } from '../league/notifications/notifications-read';
import { Profile, isName, isPhoto, isProfile } from './profile.models';

/** Browser-kept name and photo, shared by every league (the photo is account-wide). */
const ACCOUNT_KEY = 'pavilion-profile-v2';
/** Browser-kept favourite team, one per league slug: `pavilion-team-v1:piele`. */
const TEAM_KEY = 'pavilion-team-v1';
/** The whole profile as kept before leagues had slugs; it belongs to the first league. */
const LEGACY_KEYS = ['pavilion-profile-v1', 'piele-profile-v1'] as const;

export interface StoredAccount {
  displayName: string;
  photo: string | null;
}

/** The browser-kept profile in one league: the shared name and photo plus its team. */
export function readLocal(slug: string, competition: Competition): Profile | null {
  try {
    const account = readAccount();
    const teamId =
      localStorage.getItem(`${TEAM_KEY}:${slug}`) ??
      (slug === FIRST_LEAGUE_SLUG ? (readLegacyValue()?.['teamId'] ?? null) : null);
    const profile = account ? { ...account, teamId } : null;
    return isProfile(profile, competition) ? profile : null;
  } catch {
    return null;
  }
}

/** The browser-kept name and photo, from before leagues had slugs when that is all there is. */
export function readAccount(): StoredAccount | null {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(ACCOUNT_KEY) ?? 'null');
    const stored = isStoredAccount(value) ? value : readLegacyValue();
    return isStoredAccount(stored)
      ? { displayName: stored.displayName, photo: stored.photo }
      : null;
  } catch {
    return null;
  }
}

/** A complete profile from before leagues had slugs. */
export function readLegacy(competition: Competition): Profile | null {
  const value = readLegacyValue();
  return isProfile(value, competition) ? value : null;
}

/** Keeps the profile in this browser: the shared name and photo, and the league's team. */
export function storeLocal(profile: Profile, slug: string): void {
  try {
    moveLegacy();
    const account: StoredAccount = { displayName: profile.displayName, photo: profile.photo };
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify(account));
    localStorage.setItem(`${TEAM_KEY}:${slug}`, profile.teamId);
  } catch {
    throw new Error(
      'Your browser could not save this profile. Enable local storage or try a smaller photo.',
    );
  }
}

/** Drops a profile kept before profiles moved to the account. */
export function clearLegacy(): void {
  try {
    for (const key of LEGACY_KEYS) localStorage.removeItem(key);
  } catch {
    // Nothing to clean up when storage is unavailable.
  }
}

function readLegacyValue(): Record<string, unknown> | null {
  try {
    for (const key of LEGACY_KEYS) {
      const value: unknown = JSON.parse(localStorage.getItem(key) ?? 'null');
      if (value && typeof value === 'object') return value as Record<string, unknown>;
    }
  } catch {
    // Unreadable storage or JSON counts as nothing kept.
  }
  return null;
}

/** Splits a profile kept before leagues had slugs into the shared part and the first league's team. */
function moveLegacy(): void {
  const legacy = readLegacyValue();
  if (!legacy) return;
  if (localStorage.getItem(ACCOUNT_KEY) === null && isStoredAccount(legacy)) {
    const account: StoredAccount = { displayName: legacy.displayName, photo: legacy.photo };
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify(account));
  }
  const teamKey = `${TEAM_KEY}:${FIRST_LEAGUE_SLUG}`;
  if (localStorage.getItem(teamKey) === null && typeof legacy['teamId'] === 'string')
    localStorage.setItem(teamKey, legacy['teamId']);
  for (const key of LEGACY_KEYS) localStorage.removeItem(key);
}

function isStoredAccount(value: unknown): value is StoredAccount {
  if (!value || typeof value !== 'object') return false;
  const stored = value as Record<string, unknown>;
  return isName(stored['displayName']) && isPhoto(stored['photo']);
}
