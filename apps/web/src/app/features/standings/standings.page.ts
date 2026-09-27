import { DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  linkedSignal,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { map } from 'rxjs';
import { BADGES } from '../../core/league/badges';
import { RoundViewService } from '../../core/league/round-view.service';
import { MemberAvatar } from '../../shared/member-avatar/member-avatar';

/** The standings tables: the selected round, the season up to it, and house marks. */
export type StandingsMeasure = 'round' | 'season' | 'marks';

/** Where the breakdown toggle is remembered in this browser. */
export const BREAKDOWN_STORAGE_KEY = 'pavilion-standings-breakdown-v1';

const MEASURES: readonly StandingsMeasure[] = ['round', 'season', 'marks'];

/**
 * Round and season Superbru standings with an optional points breakdown, and the season's
 * house marks. Superbru points and house marks are separate measures. The tab lives in the
 * `table` query parameter.
 */
@Component({
  selector: 'app-standings-page',
  templateUrl: './standings.page.html',
  styleUrl: './standings.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe, MemberAvatar],
})
export class StandingsPage {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  readonly view = inject(RoundViewService);
  readonly badges = BADGES;
  private readonly tableParam = toSignal(
    this.route.queryParamMap.pipe(map((params) => measureFrom(params.get('table')))),
    { initialValue: measureFrom(this.route.snapshot.queryParamMap.get('table')) },
  );
  /** The tab shown: from `?table=`, else the round. */
  readonly measure = linkedSignal<StandingsMeasure>(() => this.tableParam());
  /** Whether the WP, MP, GSP and BP columns and bars show; remembered in this browser. */
  readonly breakdown = signal(readBreakdown());
  /** The round's status tag: live points are provisional; a settled round is complete. */
  readonly roundStatus = computed<'provisional' | 'complete' | 'awaiting picks'>(() => {
    if (this.view.roundProvisional()) return 'provisional';
    const rows = this.view.roundTable();
    return rows.length && rows.every((row) => row.complete) ? 'complete' : 'awaiting picks';
  });
  /** The rows of the Superbru tab shown, with each breakdown bar's segment widths. */
  readonly rows = computed<readonly PointsRow[]>(() => {
    const season = this.measure() === 'season';
    const rows = season ? this.view.seasonStandings() : this.view.roundTable();
    const top = Math.max(
      0,
      ...rows.map((row) => Math.max(row.points, row.wp + row.mp + row.gsp + row.bp)),
    );
    const share = (value: number) => (top > 0 ? (Math.max(0, value) / top) * 100 : 0);
    return rows.map((row) => ({
      memberId: row.memberId,
      rank: row.rank,
      name: row.name,
      photo: row.photo,
      teamId: row.teamId,
      you: row.you,
      points: row.points,
      wp: row.wp,
      mp: row.mp,
      gsp: row.gsp,
      bp: row.bp,
      cap: row.cap,
      spoon: row.spoon,
      crown: 'crown' in row ? row.crown : false,
      rounds: 'rounds' in row ? row.rounds : null,
      override: 'override' in row ? row.override : null,
      bar: { wp: share(row.wp), mp: share(row.mp), gsp: share(row.gsp), bp: share(row.bp) },
    }));
  });

  /** Shows a tab and records it in the `table` query parameter. */
  select(measure: StandingsMeasure): void {
    if (measure === this.measure()) return;
    this.measure.set(measure);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { table: measure },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  toggleBreakdown(): void {
    const next = !this.breakdown();
    this.breakdown.set(next);
    try {
      localStorage.setItem(BREAKDOWN_STORAGE_KEY, next ? '1' : '0');
    } catch {
      // Storage unavailable: the toggle still works for this visit.
    }
  }
}

function measureFrom(value: string | null): StandingsMeasure {
  return MEASURES.find((measure) => measure === value) ?? 'round';
}

function readBreakdown(): boolean {
  try {
    return localStorage.getItem(BREAKDOWN_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

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
