/** One fixture on the kickoff ruler. */
export interface RulerDot {
  readonly fixtureId: string;
  /**
   * `picked`: the member's pick is in; `open`: still to make before kickoff; `missed`: kickoff
   * passed without a pick, or Superbru recorded no pick.
   */
  readonly state: 'picked' | 'open' | 'missed';
  /** The picked club's colour; null for a draw or no pick. */
  readonly colour: string | null;
  /** The picked club's crest; null for a draw or no pick. */
  readonly crest: string | null;
  /** The fixture and the pick, for the dot's accessible name and tooltip. */
  readonly label: string;
}

/** The fixtures sharing one kickoff; unknown kickoffs share a trailing `TBC` slot. */
export interface RulerSlot {
  readonly key: string;
  /** `FRI`, or `TBC` for an unknown kickoff. */
  readonly day: string;
  /** `20:45`, or empty for an unknown kickoff. */
  readonly time: string;
  /** A pick in the slot is still to make. */
  readonly open: boolean;
  readonly dots: readonly RulerDot[];
}

/** The member's picks for the round, laid along its kickoffs. */
export interface KickoffRulerView {
  /** Picks in, including draws. */
  readonly made: number;
  readonly total: number;
  /** Picks still to make before kickoff. */
  readonly open: number;
  /** Fixtures that kicked off without a pick. */
  readonly missed: number;
  /**
   * Where the "now" pin stands: the number of slots whose kickoff has passed, or null once
   * every kickoff has passed and the pin has nothing left to point at.
   */
  readonly pin: number | null;
  readonly slots: readonly RulerSlot[];
}
