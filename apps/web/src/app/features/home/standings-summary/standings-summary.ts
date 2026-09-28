import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideArrowRight } from '@ng-icons/lucide';
import { BADGES } from '../../../core/league/badges';
import { LeaguePathPipe } from '../../../core/league/league-path.pipe';
import { RoundViewService } from '../../../core/league/round-view.service';
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
  readonly view = inject(RoundViewService);
  readonly badges = BADGES;
  /** The round's top four, each with the cap or spoon once the round is complete. */
  readonly topFour = computed(() => {
    const table = this.view.roundTable();
    return this.view
      .standings()
      .slice(0, 4)
      .map((member) => {
        const row = table.find((r) => r.memberId === member.memberId);
        return { ...member, cap: row?.cap ?? false, spoon: row?.spoon ?? false };
      });
  });
  /** "You are 2nd of 12 · 7.5 pts" on the season table, or null when the member is not in it. */
  readonly seasonPlace = computed(() => {
    const table = this.view.seasonStandings();
    const you = table.find((row) => row.you);
    return you ? { rank: ordinal(you.rank), of: table.length, points: you.points } : null;
  });
}
