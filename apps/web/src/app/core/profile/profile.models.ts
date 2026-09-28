import { Competition } from '../competition/competition.models';

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

export function isName(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 50;
}

/** Null, or a JPEG data URL this app made. */
export function isPhoto(value: unknown): value is string | null {
  return (
    value === null ||
    (typeof value === 'string' &&
      value.length < 500000 &&
      /^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/.test(value))
  );
}
