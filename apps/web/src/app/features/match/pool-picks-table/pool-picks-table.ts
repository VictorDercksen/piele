import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { LeagueRules } from '../../../core/league/league.models';
import { FixturePicksView } from '../../../core/league/picks/pick.models';
import { MemberAvatar } from '../../../shared/member-avatar/member-avatar';
import { PickChip } from '../picks-panel/pick-chip';
import { PoolRow } from './pool-picks-table.models';
import { poolRowOf } from './pool-picks-table.rows';

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
    return picks.rows.map((row) => poolRowOf(row, bonus));
  });
}
