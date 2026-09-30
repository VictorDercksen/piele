import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideArrowRight } from '@ng-icons/lucide';
import { FixtureService } from '../../../core/competition/fixture.service';
import { LeagueContext } from '../../../core/league/league-context';
import { LeaguePathPipe } from '../../../core/league/league-path.pipe';
import { MarkService } from '../../../core/league/marks/mark.service';
import { StandingService } from '../../../core/league/standings/standing.service';
import { ordinal } from '../../../shared/format/ordinal';
import { Icon } from '../../../shared/icon/icon';
import { PointsTable } from '../../../shared/points-table/points-table';
import { PointsScope } from '../../../shared/points-table/points-table.models';
import { pointsRows } from '../../../shared/points-table/points-table.rows';

/** How many leading rows the board shows before the member's own. */
const TOP_ROWS = 4;

/**
 * The round's leading members, or the season's while the round has no results, with the
 * current member's season position and house marks.
 */
@Component({
  selector: 'aside[appStandingsSummary]',
  templateUrl: './standings-summary.html',
  styleUrl: './standings-summary.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // prettier-ignore
  imports: [
    DecimalPipe,
    RouterLink,
    LeaguePathPipe,
    Icon,
    NgIcon,
    PointsTable,
  ],
  viewProviders: [provideIcons({ lucideArrowRight })],
})
export class StandingsSummary {
  readonly context = inject(LeagueContext);
  readonly fixtures = inject(FixtureService);
  readonly standings = inject(StandingService);
  readonly marks = inject(MarkService);
  readonly limit = TOP_ROWS;
  private readonly roundRows = computed(() => pointsRows(this.standings.roundTable()));
  private readonly seasonRows = computed(() => pointsRows(this.standings.seasonStandings()));
  /** The round once it has results, else the season so far when that has any. */
  readonly scope = computed<PointsScope>(() =>
    !this.roundRows().length && this.seasonRows().length ? 'season' : 'round',
  );
  readonly rows = computed(() => (this.scope() === 'round' ? this.roundRows() : this.seasonRows()));
  /** "You are 2nd of 12 · 7.5 pts" on the season table, or null when the member is not in it. */
  readonly seasonPlace = computed(() => {
    const table = this.standings.seasonStandings();
    const you = table.find((row) => row.you);
    return you ? { rank: ordinal(you.rank), of: table.length, points: you.points } : null;
  });
  /** One tally stick per house mark, in a group of five or two once past five; lit up to the count. */
  readonly tally = computed(() => {
    const marks = this.marks.ownMarks();
    return Array.from({ length: marks > 5 ? 10 : 5 }, (_, i) => i < marks);
  });
}
