import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { LeagueRules } from '../../../core/league/league.models';
import { FixturePicksView, PickRowView } from '../../../core/league/round-view.service';
import { sameTotal } from '../../../core/league/superbru';
import { MemberAvatar } from '../../../shared/member-avatar/member-avatar';
import { PickChip, PickChipView, chipOf } from '../picks-panel/pick-chip';

/** Read-only pool results. The parent enforces when the pool may be shown. */
@Component({
  selector: 'app-pool-picks-table',
  templateUrl: './pool-picks-table.html',
  styleUrl: './pool-picks-table.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // prettier-ignore
  imports: [
    DecimalPipe,
    MemberAvatar,
    PickChip,
  ],
})
export class PoolPicksTable {
  readonly picks = input.required<FixturePicksView>();
  readonly rules = input.required<LeagueRules>();
  /** Scores are in (live or full time): marks and points show. */
  readonly scored = computed(() => {
    const picks = this.picks();
    return !!picks && picks.locked && !picks.void && (picks.provisional || picks.final);
  });

  /** The pool table in the view's order, with each pick's chip and marks. */
  readonly rows = computed<readonly PoolRow[]>(() => {
    const picks = this.picks();
    if (!picks) return [];
    const bonus = this.rules().bonusPointValue;
    return picks.rows.map((row) => ({
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
    }));
  });
}

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

/** A points value without floating-point noise, e.g. 0.25 or 1.5. */
function round(value: number): number {
  return Math.round(value * 100) / 100;
}
