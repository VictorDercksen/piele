import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, viewChild } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { LeagueTime } from '../../core/competition/league-time';
import { BADGES } from '../../core/league/badges';
import { LeagueContext } from '../../core/league/league-context';
import { LeaguePathPipe } from '../../core/league/league-path.pipe';
import { RoundDutyView, RoundViewService } from '../../core/league/round-view.service';
import { ProfileStore } from '../../core/profile/profile.store';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideArrowRight } from '@ng-icons/lucide';
import { Icon } from '../../shared/icon/icon';
import { MemberAvatar } from '../../shared/member-avatar/member-avatar';
import { EvidenceDialog } from '../duties/evidence-dialog/evidence-dialog';
import { Feed } from './feed/feed';
import { MatchHero } from './match-hero/match-hero';

/** Round overview: match centre, next action, standings and feed. */
@Component({
  selector: 'app-home-page',
  templateUrl: './home.page.html',
  styleUrl: './home.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DecimalPipe,
    RouterLink,
    LeaguePathPipe,
    Icon,
    NgIcon,
    MatchHero,
    EvidenceDialog,
    Feed,
    MemberAvatar,
  ],
  viewProviders: [provideIcons({ lucideArrowRight })],
})
export class HomePage {
  private readonly router = inject(Router);
  private readonly context = inject(LeagueContext);
  private readonly time = inject(LeagueTime);
  private readonly profileStore = inject(ProfileStore);
  readonly view = inject(RoundViewService);
  readonly evidence = viewChild.required(EvidenceDialog);
  readonly profile = this.profileStore.profile;
  readonly favouriteTeam = this.profileStore.team;
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

  deadline(duty: RoundDutyView): string {
    return this.time.format(duty.deadlineAt, 'Deadline to be confirmed');
  }

  go(path: string): void {
    void this.router.navigate([this.context.url(path)], { queryParamsHandling: 'preserve' });
  }
}

/** 1st, 2nd, 3rd, 4th, 11th, 21st. */
export function ordinal(n: number): string {
  const tens = n % 100;
  const suffix =
    tens >= 11 && tens <= 13 ? 'th' : (({ 1: 'st', 2: 'nd', 3: 'rd' } as const)[n % 10] ?? 'th');
  return `${n}${suffix}`;
}
