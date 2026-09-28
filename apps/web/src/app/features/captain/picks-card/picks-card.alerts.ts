/** The keys of this card's alerts, one per form, so a new attempt replaces the last one's. */
export const ALERT_KEYS = { grid: 'picks-grid', override: 'picks-override' } as const;

/** Refusals that are about the picks rather than a failure: warnings, not errors. */
export const WARNINGS: ReadonlySet<string> = new Set(['picks_locked']);

/** Refusals worth their own words; any other code shows the API's message. */
export const REFUSALS: Readonly<Record<string, string>> = {
  invalid_pick: 'Each pick needs a side and a margin from 1 to 150, a draw, or missed.',
  unknown_member: 'A member on this grid is no longer on the team sheet. Reload and try again.',
  duplicate_member: 'A member appears twice. Reload and try again.',
  unknown_fixture: 'That match is not in the schedule.',
  unknown_duty: 'A linked pick confirmation duty no longer belongs to that member.',
  captain_only: 'Only the captain or the admin can record picks.',
};
