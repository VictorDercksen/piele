/** A change worth announcing on the management page. */
export interface LeagueChange {
  readonly id: string;
  readonly message: string;
  /** Set when the league moved to the archived group or back. */
  readonly moved?: 'archived' | 'active';
}
