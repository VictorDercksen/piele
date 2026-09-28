/** The member's choice in the form: a side or a draw. */
export type PickChoice = 'home' | 'away' | 'draw';

/** A side of the fixture as the panel draws it. */
export interface SideLook {
  readonly name: string;
  readonly colour: string | null;
  readonly accent: string | null;
  /** The banner colour for the sway bar. */
  readonly banner: string | null;
  readonly crest: string | null;
  readonly jersey: string;
}

/** Both sides of the fixture as the panel draws them. */
export interface SideLooks {
  readonly home: SideLook;
  readonly away: SideLook;
}

/** The margin scale as the template draws it. */
export interface ScaleView {
  readonly side: PickChoice | null;
  /** The typed margin, or null while it is empty or invalid. */
  readonly margin: number | null;
  /** The range input's value: the margin toward away, negative toward home, 0 a draw. */
  readonly range: number;
  /** The marker's position along the track, 0 at home, 100 at away. */
  readonly pct: number;
  readonly fillLeft: number;
  readonly fillRight: number;
  /** The marker's label: the margin, Draw, or Pick before a side is chosen. */
  readonly thumb: string;
  /** The pick in words, e.g. "Bulls by 20", "A draw", "No pick yet". */
  readonly text: string;
}
