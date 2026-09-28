import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideArrowRight } from '@ng-icons/lucide';
import { FixtureService } from '../../../core/competition/fixture.service';
import { BADGES } from '../../../core/league/badges';
import { LeagueContext } from '../../../core/league/league-context';
import { LeaguePathPipe } from '../../../core/league/league-path.pipe';
import { MarkService } from '../../../core/league/marks/mark.service';
import { StandingService } from '../../../core/league/standings/standing.service';
import { ordinal } from '../../../shared/format/ordinal';
import { Icon } from '../../../shared/icon/icon';
import { MemberAvatar } from '../../../shared/member-avatar/member-avatar';

/** The round's leading members and the current member's season position. */
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
    MemberAvatar,
  ],
  viewProviders: [provideIcons({ lucideArrowRight })],
})
export class StandingsSummary {
  readonly context = inject(LeagueContext);
  readonly fixtures = inject(FixtureService);
  readonly standings = inject(StandingService);
  readonly marks = inject(MarkService);
  readonly badges = BADGES;
  /** The round's top four, each with the cap or spoon once the round is complete. */
  readonly topFour = computed(() => {
    const table = this.standings.roundTable();
    return this.standings
      .standings()
      .slice(0, 4)
      .map((member) => {
        const row = table.find((r) => r.memberId === member.memberId);
        return { ...member, cap: row?.cap ?? false, spoon: row?.spoon ?? false };
      });
  });
  /** "You are 2nd of 12 · 7.5 pts" on the season table, or null when the member is not in it. */
  readonly seasonPlace = computed(() => {
    const table = this.standings.seasonStandings();
    const you = table.find((row) => row.you);
    return you ? { rank: ordinal(you.rank), of: table.length, points: you.points } : null;
  });
}
