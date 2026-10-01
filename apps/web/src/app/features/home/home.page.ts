import { ChangeDetectionStrategy, Component, computed, inject, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { LiveScoresService } from '../../core/api/live-scores.service';
import { CompetitionService } from '../../core/competition/competition.service';
import { FixtureService } from '../../core/competition/fixture.service';
import { LeagueTime } from '../../core/competition/league-time';
import { LeagueContext } from '../../core/league/league-context';
import { MemberService } from '../../core/league/members/member.service';
import { PickService } from '../../core/league/picks/pick.service';
import { ProfileService } from '../../core/profile/profile.service';
import { EvidenceDialog } from '../duties/evidence-dialog/evidence-dialog';
import { Feed } from './feed/feed';
import { kickoffRuler } from './match-hero/kickoff-ruler';
import { MatchHero } from './match-hero/match-hero';
import { NextActions } from './next-actions/next-actions';
import { StandingsSummary } from './standings-summary/standings-summary';

/**
 * Composes the round overview and owns navigation and the evidence dialog. Gives the hero the
 * member's picks for the round along its kickoffs.
 */
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
  readonly fixtures = inject(FixtureService);
  readonly evidence = viewChild.required(EvidenceDialog);
  readonly favouriteTeam = inject(ProfileService).team;
  private readonly picks = inject(PickService);
  private readonly members = inject(MemberService);
  private readonly competition = inject(CompetitionService);
  private readonly live = inject(LiveScoresService);
  private readonly time = inject(LeagueTime);
  /** The round's picks for the hero's footer; an admin without membership has none to make. */
  readonly ruler = computed(() =>
    this.members.memberId()
      ? kickoffRuler(
          this.fixtures.fixtures(),
          (fixtureId) => this.picks.myPickFor(fixtureId),
          this.competition.current(),
          this.live.clock(),
          this.time.zone(),
        )
      : null,
  );
  go(path: string): void {
    void this.router.navigate([this.context.url(path)], { queryParamsHandling: 'preserve' });
  }
}
