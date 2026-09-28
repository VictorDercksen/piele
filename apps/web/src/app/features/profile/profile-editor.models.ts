/** A profile form control an attempt can find wanting. */
export type ProfileField = 'displayName' | 'teamId';

/** One thing the member must fix, and the control it concerns. */
export interface ProfileProblem {
  readonly field: ProfileField;
  readonly message: string;
}
