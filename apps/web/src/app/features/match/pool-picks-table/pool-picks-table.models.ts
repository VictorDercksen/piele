import { PickRowView } from '../../../core/league/picks/pick.models';
import { PickChipView } from '../picks-panel/pick-chip.models';

export interface PickMark {
  readonly key: 'w' | 'm' | 'b';
  readonly earned: boolean;
  /** A shared bonus point's share, e.g. 0.25. */
  readonly fraction: number | null;
  /** Visually hidden text for the mark. */
  readonly text: string;
}

export interface PoolRow {
  readonly row: PickRowView;
  readonly chip: PickChipView;
  readonly marks: readonly PickMark[];
}
