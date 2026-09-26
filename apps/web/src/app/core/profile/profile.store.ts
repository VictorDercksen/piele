import { Injectable, computed, inject, signal } from '@angular/core';
import { AuthService } from '../auth/auth.service';
import { club } from '../competition/teams';
import { HttpLeagueData } from '../league/http-league-data';
import { LeagueData } from '../league/league-data';
import { readRenamedKey } from '../storage/renamed-key';

const STORAGE_KEY = 'pavilion-profile-v1';
/** The key before the rename to The Pavilion, read once and moved. */
const LEGACY_STORAGE_KEY = 'piele-profile-v1';

/**
 * The member's display name, favourite team and photo. Builds that talk to the API save it
 * to the member's league account, so it follows them to every device. Sample and offline
 * builds have no account and keep it in this browser.
 */
@Injectable({ providedIn: 'root' })
export class ProfileStore {
  private readonly auth = inject(AuthService);
  private readonly league = inject(LeagueData);
  private readonly api = this.league instanceof HttpLeagueData ? this.league : null;
  /** True when changes are saved to the league account rather than this browser. */
  readonly persisted = !!this.api;
  private readonly local = signal<Profile | null>(this.api ? null : readStored());
  readonly profile = computed(() => (this.api ? this.api.profile() : this.local()));
  /** A profile this browser kept before profiles moved to the account, to prefill onboarding. */
  readonly earlier = this.api ? readStored() : null;
  readonly team = computed(() => club(this.profile()?.teamId ?? ''));
  readonly initials = computed(() =>
    (this.profile()?.displayName ?? 'You')
      .split(/\s+/)
      .slice(0, 2)
      .map((word) => word[0])
      .join('')
      .toUpperCase(),
  );

  /**
   * Resolves once the profile is known. False when it cannot be yet (signed out, or not a
   * league member), which the sign-in and membership guards handle.
   */
  async whenKnown(): Promise<boolean> {
    if (!this.api) return true;
    await this.auth.whenReady();
    if (!this.auth.signedIn()) return false;
    return (await this.api.ensureLoaded()) === 'member';
  }

  async save(profile: Profile): Promise<void> {
    if (!isProfile(profile)) throw new Error('Enter a name and choose a favourite team.');
    if (this.api) {
      await this.api.saveProfile(profile.teamId, profile.photo);
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        // Nothing to clean up when storage is unavailable.
      }
      return;
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
    } catch {
      throw new Error(
        'Your browser could not save this profile. Enable local storage or try a smaller photo.',
      );
    }
    this.local.set(profile);
  }
}

function readStored(): Profile | null {
  try {
    const value: unknown = JSON.parse(readRenamedKey(STORAGE_KEY, LEGACY_STORAGE_KEY) ?? 'null');
    return isProfile(value) ? value : null;
  } catch {
    return null;
  }
}

export interface Profile {
  displayName: string;
  teamId: string;
  /** A JPEG data URL, or null for initials. */
  photo: string | null;
}

export function isProfile(value: unknown): value is Profile {
  if (!value || typeof value !== 'object') return false;
  const profile = value as Record<string, unknown>;
  return (
    typeof profile['displayName'] === 'string' &&
    profile['displayName'].trim().length > 0 &&
    profile['displayName'].length <= 50 &&
    typeof profile['teamId'] === 'string' &&
    !!club(profile['teamId']) &&
    (profile['photo'] === null ||
      (typeof profile['photo'] === 'string' &&
        profile['photo'].length < 500000 &&
        /^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/.test(profile['photo'])))
  );
}
