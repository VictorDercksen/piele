/** The standings tables: the selected round, the season up to it, and house marks. */
export type StandingsMeasure = 'round' | 'season' | 'marks';

/** One line of the round or season table as the page draws it. */
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
  readonly bar: {
    readonly wp: number;
    readonly mp: number;
    readonly gsp: number;
    readonly bp: number;
  };
}
