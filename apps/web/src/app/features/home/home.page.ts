import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, viewChild } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { formatLeagueTime } from '../../core/competition/league-time';
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
  imports: [DecimalPipe, RouterLink, Icon, NgIcon, MatchHero, EvidenceDialog, Feed, MemberAvatar],
  viewProviders: [provideIcons({ lucideArrowRight })],
})
export class HomePage {
  private readonly router = inject(Router);
  private readonly profileStore = inject(ProfileStore);
  readonly view = inject(RoundViewService);
  readonly evidence = viewChild.required(EvidenceDialog);
  readonly profile = this.profileStore.profile;
  readonly favouriteTeam = this.profileStore.team;

  deadline(duty: RoundDutyView): string {
    return formatLeagueTime(duty.deadlineAt, 'Deadline to be confirmed');
  }

  go(path: string): void {
    void this.router.navigate([path], { queryParamsHandling: 'preserve' });
  }
}
