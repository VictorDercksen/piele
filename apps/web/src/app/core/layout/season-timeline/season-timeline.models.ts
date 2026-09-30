/** The member's duty in a round: completed, latest evidence rejected, or still outstanding. */
export type TimelineDutyState = 'done' | 'rejected' | 'open';

/** What a round of the season timeline carries for the member. */
export interface RoundActivity {
  /** The member's duty state, or null when they have no duty in the round. */
  readonly duty: TimelineDutyState | null;
  /** Evidence votes, vetoes and polls in the round not yet accepted or resolved. */
  readonly decisions: number;
}
