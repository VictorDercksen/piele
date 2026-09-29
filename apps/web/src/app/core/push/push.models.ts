/** Kinds of push message a member can turn off per league (the API's `push_muted`). */
export type PushCategory = 'picks' | 'matches' | 'duties' | 'cases';

export interface PushCategoryOption {
  readonly key: PushCategory;
  readonly label: string;
  readonly hint: string;
}

export const PUSH_CATEGORIES: readonly PushCategoryOption[] = [
  {
    key: 'picks',
    label: 'Pick reminders',
    hint: '24 hours and 1 hour before a match you have not picked.',
  },
  {
    key: 'matches',
    label: 'Teamsheets and previews',
    hint: 'When teamsheets are out and when the Pavilion preview is up.',
  },
  {
    key: 'duties',
    label: 'Your duties',
    hint: 'A new duty for you, and your evidence accepted or rejected.',
  },
  {
    key: 'cases',
    label: 'Evidence votes',
    hint: 'Evidence waiting for your vote, and vetoes waiting for your ruling.',
  },
];

/**
 * What this device can do: `unconfigured` (a build without the API), `install` (iPhone or
 * iPad in the browser: push needs the Home Screen app), `unsupported`, `denied` (blocked in
 * settings), `off` or `on`. `checking` until the browser has answered.
 */
export type PushState =
  'unconfigured' | 'install' | 'unsupported' | 'denied' | 'checking' | 'off' | 'on';

/** The league's muted categories, for the league they were read in. */
export interface PushPreferences {
  readonly leagueId: string;
  readonly muted: readonly PushCategory[];
}

/** `PushSubscription.toJSON()` as the API stores it. */
export interface PushSubscriptionBody {
  readonly endpoint: string;
  readonly keys: { readonly p256dh: string; readonly auth: string };
}
