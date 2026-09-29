import { HlmToggleGroup } from '@spartan-ng/helm/toggle-group';
import { HlmToggleGroupItem } from '@spartan-ng/helm/toggle-group';
import { HlmButton } from '@spartan-ng/helm/button';
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
import { FixtureService } from '../../core/competition/fixture.service';
import { StandingsPreferences } from '../../core/storage/standings-preferences';
export { BREAKDOWN_STORAGE_KEY } from '../../core/storage/standings-preferences';
import { BADGES } from '../../core/league/badges';
import { LeagueContext } from '../../core/league/league-context';
import { MarkService } from '../../core/league/marks/mark.service';
import { StandingService } from '../../core/league/standings/standing.service';
import { MemberAvatar } from '../../shared/member-avatar/member-avatar';
import { BreakdownPart, PointsRow, StandingsMeasure } from './standings.page.models';
import {
  BREAKDOWN_PARTS,
  LABEL_MIN_WIDTH,
  breakdownPartFrom,
  measureFrom,
  pointsRows,
} from './standings.page.rows';

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
  /* prettier-ignore */
  imports: [
    DecimalPipe,
    MemberAvatar,
    HlmButton,
    HlmToggleGroup,
    HlmToggleGroupItem,
  ],
})
export class StandingsPage {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly standings = inject(StandingService);
  readonly context = inject(LeagueContext);
  readonly fixtures = inject(FixtureService);
  readonly marks = inject(MarkService);
  readonly badges = BADGES;
  readonly parts = BREAKDOWN_PARTS;
  readonly labelMin = LABEL_MIN_WIDTH;
  private readonly preferences = inject(StandingsPreferences);
  private readonly tableParam = toSignal(
    this.route.queryParamMap.pipe(map((params) => measureFrom(params.get('table')))),
    { initialValue: measureFrom(this.route.snapshot.queryParamMap.get('table')) },
  );
  /** The tab shown: from `?table=`, else the round. */
  readonly measure = linkedSignal<StandingsMeasure>(() => this.tableParam());
  /** Whether the WP, MP, GSP and BP columns and bars show; remembered in this browser. */
  readonly breakdown = signal(this.preferences.readBreakdown());
  /** The part the key highlights across the bars, or none. */
  readonly highlight = signal<BreakdownPart | null>(null);
  /** The round's status tag: live points are provisional; a settled round is complete. */
  readonly roundStatus = computed<'provisional' | 'complete' | 'awaiting picks'>(() => {
    if (this.fixtures.roundProvisional()) return 'provisional';
    const rows = this.standings.roundTable();
    return rows.length && rows.every((row) => row.complete) ? 'complete' : 'awaiting picks';
  });
  /** The rows of the Superbru tab shown, with each breakdown bar's segment widths. */
  readonly rows = computed<readonly PointsRow[]>(() => {
    const season = this.measure() === 'season';
    const rows = season ? this.standings.seasonStandings() : this.standings.roundTable();
    return pointsRows(rows);
  });

  /** Shows a tab and records it in the `table` query parameter. */
  select(measure: unknown): void {
    if (measure !== 'round' && measure !== 'season' && measure !== 'marks') return;
    if (measure === this.measure()) return;
    this.measure.set(measure);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { table: measure },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  /** Shows the totals or the breakdown, and remembers the choice in this browser. */
  setBreakdown(view: unknown): void {
    const next = view === 'breakdown';
    if (next === this.breakdown()) return;
    this.breakdown.set(next);
    this.highlight.set(null);
    this.preferences.saveBreakdown(next);
  }

  setHighlight(part: unknown): void {
    this.highlight.set(breakdownPartFrom(part));
  }
}
