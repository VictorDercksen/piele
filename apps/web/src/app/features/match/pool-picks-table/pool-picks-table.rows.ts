import { PickRowView } from '../../../core/league/picks/pick.models';
import { sameTotal } from '../../../core/league/superbru';
import { chipOf } from '../picks-panel/pick-chip.view';
import { PoolRow } from './pool-picks-table.models';

/** A pool row with its pick's chip and its outcome, margin and bonus marks. */
export function poolRowOf(row: PickRowView, bonus: number): PoolRow {
  return {
    row,
    chip: chipOf(row),
    marks: [
      {
        key: 'w',
        earned: row.wp > 0,
        fraction: null,
        text: row.wp > 0 ? 'outcome point' : 'no outcome point',
      },
      {
        key: 'm',
        earned: row.mp > 0,
        fraction: null,
        text: row.mp > 0 ? 'margin point' : 'no margin point',
      },
      {
        key: 'b',
        earned: row.bp > 0,
        fraction: row.bp > 0 && !sameTotal(row.bp, bonus) ? row.bp : null,
        text:
          row.bp > 0
            ? sameTotal(row.bp, bonus)
              ? 'bonus point'
              : `${round(row.bp)} of the bonus point`
            : 'no bonus point',
      },
    ],
  };
}

/** A points value without floating-point noise, e.g. 0.25 or 1.5. */
function round(value: number): number {
  return Math.round(value * 100) / 100;
}
