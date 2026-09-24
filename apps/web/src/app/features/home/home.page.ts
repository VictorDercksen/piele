import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, viewChild } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { RoundViewService } from '../../core/league/round-view.service';
import { ProfileStore } from '../../core/profile/profile.store';
import { Icon } from '../../shared/icon/icon';
import { EvidenceDialog } from '../duties/evidence-dialog/evidence-dialog';
import { MatchHero } from './match-hero/match-hero';

/** Round overview: match centre, next action, standings and feed. */
@Component({
  selector: 'app-home-page',
  templateUrl: './home.page.html',
  styleUrl: './home.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe, RouterLink, Icon, MatchHero, EvidenceDialog],
})
export class HomePage {
  private readonly router = inject(Router);
  private readonly profileStore = inject(ProfileStore);
  readonly view = inject(RoundViewService);
  readonly evidence = viewChild.required(EvidenceDialog);
  readonly profile = this.profileStore.profile;
  readonly favouriteTeam = this.profileStore.team;

  go(path: string): void {
    void this.router.navigate([path], { queryParamsHandling: 'preserve' });
  }
}
