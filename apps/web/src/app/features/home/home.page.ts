import { ChangeDetectionStrategy, Component, inject, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { LeagueContext } from '../../core/league/league-context';
import { RoundViewService } from '../../core/league/round-view.service';
import { ProfileStore } from '../../core/profile/profile.store';
import { EvidenceDialog } from '../duties/evidence-dialog/evidence-dialog';
import { Feed } from './feed/feed';
import { MatchHero } from './match-hero/match-hero';
import { NextActions } from './next-actions/next-actions';
import { StandingsSummary } from './standings-summary/standings-summary';

/** Composes the round overview and owns navigation and the evidence dialog. */
@Component({
  selector: 'app-home-page',
  templateUrl: './home.page.html',
  styleUrl: './home.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // prettier-ignore
  imports: [
    MatchHero,
    EvidenceDialog,
    Feed,
    NextActions,
    StandingsSummary,
  ],
})
export class HomePage {
  private readonly router = inject(Router);
  private readonly context = inject(LeagueContext);
  readonly view = inject(RoundViewService);
  readonly evidence = viewChild.required(EvidenceDialog);
  readonly favouriteTeam = inject(ProfileStore).team;
  go(path: string): void {
    void this.router.navigate([this.context.url(path)], { queryParamsHandling: 'preserve' });
  }
}
