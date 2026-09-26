import { Injectable, computed, inject, signal } from '@angular/core';
import { AuthService } from '../auth/auth.service';
import { Competition } from '../competition/competition.models';
import { CompetitionService } from '../competition/competition.service';
import { HttpLeagueData } from '../league/http-league-data';
import { LeagueContext } from '../league/league-context';
import { LeagueData } from '../league/league-data';
import { FIRST_LEAGUE_SLUG } from '../league/notifications-read';

/** Browser-kept name and photo, shared by every league (the photo is account-wide). */
const ACCOUNT_KEY = 'pavilion-profile-v2';
/** Browser-kept favourite team, one per league slug: `pavilion-team-v1:piele`. */
const TEAM_KEY = 'pavilion-team-v1';
/** The whole profile as kept before leagues had slugs; it belongs to the first league. */
const LEGACY_KEYS = ['pavilion-profile-v1', 'piele-profile-v1'] as const;

/**
 * The member's display name, favourite team and photo. The favourite team belongs to the
 * membership, so each league has its own; the photo belongs to the account. Builds that talk
 * to the API save it through the league's `me/profile` route, so it follows the member to
 * every device. Sample and offline builds have no account and keep it in this browser, the
 * team under the league's slug.
 */
@Injectable({ providedIn: 'root' })
export class ProfileStore {
  private readonly auth = inject(AuthService);
  private readonly league = inject(LeagueData);
  private readonly context = inject(LeagueContext);
  private readonly competition = inject(CompetitionService);
  private readonly api = this.league instanceof HttpLeagueData ? this.league : null;
  /** True when changes are saved to the league account rather than this browser. */
  readonly persisted = !!this.api;
  /** Bumped after a browser save so `local` reads storage again. */
  private readonly saves = signal(0);
  private readonly local = computed<Profile | null>(() => {
    this.saves();
    const slug = this.context.slug();
    return this.api || !slug ? null : readLocal(slug, this.competition.current());
  });
  /** The profile in the current league; null until a favourite team is chosen there. */
  readonly profile = computed(() => (this.api ? this.api.profile() : this.local()));
  readonly team = computed(() => this.competition.current().team(this.profile()?.teamId));
  readonly initials = computed(() =>
    (this.profile()?.displayName ?? 'You')
      .split(/\s+/)
      .slice(0, 2)
      .map((word) => word[0])
      .join('')
      .toUpperCase(),
  );

  /**
   * What onboarding starts from when this league has no profile yet: in API builds a
   * profile this browser kept before profiles moved to the account, otherwise the name and
   * photo this browser keeps for every league.
   */
  earlier(): Partial<Profile> | null {
    if (this.api) return readLegacy(this.competition.current());
    return readAccount();
  }

  /**
   * Resolves once the profile is known. False when it cannot be (signed out, not let into
   * the league, or the admin in a league it holds no membership in), which the sign-in and
   * league guards handle.
   */
  async whenKnown(): Promise<boolean> {
    if (!this.api) return true;
    await this.auth.whenReady();
    if (!this.auth.signedIn()) return false;
    return (await this.api.ensureLoaded()) === 'member' && this.api.isMember();
  }

  async save(profile: Profile): Promise<void> {
    if (!isProfile(profile, this.competition.current()))
      throw new Error('Enter a name and choose a favourite team.');
    if (this.api) {
      await this.api.saveProfile(profile.teamId, profile.photo);
      try {
        for (const key of LEGACY_KEYS) localStorage.removeItem(key);
      } catch {
        // Nothing to clean up when storage is unavailable.
      }
      return;
    }
    const slug = this.context.slug();
    if (!slug) throw new Error('Open a league before choosing a favourite team.');
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
    this.saves.update((n) => n + 1);
  }
}

interface StoredAccount {
  displayName: string;
  photo: string | null;
}

/** The browser-kept profile in one league: the shared name and photo plus its team. */
function readLocal(slug: string, competition: Competition): Profile | null {
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
function readAccount(): StoredAccount | null {
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
function readLegacy(competition: Competition): Profile | null {
  const value = readLegacyValue();
  return isProfile(value, competition) ? value : null;
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

function isName(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 50;
}

/** Null, or a JPEG data URL this app made. */
function isPhoto(value: unknown): value is string | null {
  return (
    value === null ||
    (typeof value === 'string' &&
      value.length < 500000 &&
      /^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/.test(value))
  );
}

export interface Profile {
  displayName: string;
  teamId: string;
  /** A JPEG data URL, or null for initials. */
  photo: string | null;
}

/** A complete profile whose favourite team belongs to the competition. */
export function isProfile(value: unknown, competition: Competition): value is Profile {
  if (!value || typeof value !== 'object') return false;
  const profile = value as Record<string, unknown>;
  return (
    isName(profile['displayName']) &&
    typeof profile['teamId'] === 'string' &&
    !!competition.team(profile['teamId']) &&
    isPhoto(profile['photo'])
  );
}
