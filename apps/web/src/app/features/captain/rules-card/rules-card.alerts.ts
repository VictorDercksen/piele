/** The key of the rules form's card, so a new attempt replaces the last one's. */
export const ALERT_KEY = 'captain-rules';

/** Refusals worth their own words; any other code shows the API's message. */
export const REFUSALS: Readonly<Record<string, string>> = {
  unknown_member: "The previous season's champion must be a member of this league.",
  captain_only: 'Only the captain or the admin can change the rules.',
};
