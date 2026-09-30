/** The Superbru tables: the selected round, or the season up to it. */
export type PointsScope = 'round' | 'season';

/** The four parts of a Superbru score: win, margin, grand slam and bonus points. */
export type BreakdownPart = 'wp' | 'mp' | 'gsp' | 'bp';

/** How the breakdown key names a part. */
export interface BreakdownPartLabel {
  readonly key: BreakdownPart;
  readonly abbr: string;
  readonly name: string;
}

/** One line of the round or season table as the points table draws it. */
export interface PointsRow {
  readonly memberId: string;
  readonly rank: number;
  readonly name: string;
  readonly photo: string | null;
  readonly teamId: string;
  readonly you: boolean;
  readonly points: number;
  readonly wp: number;
  readonly mp: number;
  readonly gsp: number;
  readonly bp: number;
  readonly cap: boolean;
  readonly spoon: boolean;
  readonly crown: boolean;
  /** Rounds counted, on the season table. */
  readonly rounds: number | null;
  /** The recorded total where it differs from the derived one, on the round table. */
  readonly override: number | null;
  /** Breakdown bar segment widths, in percent of the table's top total. */
  readonly bar: Readonly<Record<BreakdownPart, number>>;
}
