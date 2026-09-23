import { Injectable, computed, signal } from '@angular/core';
import { club } from '../competition/teams';

/** Browser-local member profile. Replaced by the identity API once authentication exists. */
@Injectable({ providedIn: 'root' })
export class ProfileStore {
  readonly profile = signal<LocalProfile | null>(this.read());
  readonly team = computed(() => club(this.profile()?.teamId ?? ''));
  readonly initials = computed(() =>
    (this.profile()?.displayName ?? 'You')
      .split(/\s+/)
      .slice(0, 2)
      .map((word) => word[0])
      .join('')
      .toUpperCase(),
  );
  save(profile: LocalProfile): void {
    if (!isProfile(profile)) throw new Error('Enter a name and choose a favourite team.');
    try {
      localStorage.setItem('piele-profile-v1', JSON.stringify(profile));
    } catch {
      throw new Error(
        'Your browser could not save this profile. Enable local storage or try a smaller photo.',
      );
    }
    this.profile.set(profile);
  }
  private read(): LocalProfile | null {
    try {
      const value: unknown = JSON.parse(localStorage.getItem('piele-profile-v1') ?? 'null');
      return isProfile(value) ? value : null;
    } catch {
      return null;
    }
  }
}

export interface LocalProfile {
  displayName: string;
  teamId: string;
  photo: string | null;
}

export function isProfile(value: unknown): value is LocalProfile {
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
