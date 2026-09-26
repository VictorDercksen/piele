import { ChangeDetectionStrategy, Component, effect, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Fixture } from '../../competition/competition.models';
import { CompetitionService } from '../../competition/competition.service';
import { MatchArtwork } from '../../competition/match-artwork';
import { ribbonStatus } from '../../competition/match-status';
import { LeagueContext } from '../../league/league-context';
import { RoundViewService } from '../../league/round-view.service';

/**
 * The selected round's fixtures. Choosing one features it in the home match centre,
 * or opens it when the match centre page is already showing.
 */
@Component({
  selector: 'app-fixture-ribbon',
  template: `<div
    class="fixture-ribbon"
    role="group"
    [attr.aria-label]="view.round().title + ' fixtures'"
  >
    @for (match of view.fixtures(); track match.id) {
      <button
        type="button"
        [class.active]="view.featured()?.id === match.id"
        [class.live]="match.state === 'live' || match.state === 'half_time'"
        [attr.aria-pressed]="view.featured()?.id === match.id"
        (click)="choose(match.id)"
        (pointerenter)="prepare(match)"
        (focus)="prepare(match)"
      >
        <span
          ><span class="status">{{ status(match) }}</span>
          <strong>{{ match.score || match.time }}</strong></span
        ><span
          ><img [src]="jersey(match.homeAsset)" alt="" /><b>{{ team(match.home) }}</b
          ><i>v</i><b>{{ team(match.away) }}</b
          ><img [src]="jersey(match.awayAsset)" alt=""
        /></span>
      </button>
    }
  </div>`,
  styleUrl: './fixture-ribbon.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FixtureRibbon {
  private readonly router = inject(Router);
  private readonly context = inject(LeagueContext);
  private readonly artwork = inject(MatchArtwork);
  private readonly competition = inject(CompetitionService);
  readonly view = inject(RoundViewService);
  readonly status = ribbonStatus;

  constructor() {
    effect(() => this.artwork.warm(this.view.fixtures()));
  }

  /** The club's jersey, or the placeholder for an unconfirmed side. */
  jersey(teamId: string): string {
    return this.competition.current().jersey(teamId);
  }

  /** Unconfirmed playoff teams read as TBC so two of them fit a ribbon card. */
  team(name: string): string {
    return name === 'To be confirmed' ? 'TBC' : name;
  }

  /** Loads a matchup's artwork on hover or focus in case warming has not reached it. */
  prepare(match: Fixture): void {
    this.artwork.preload(match);
  }

  choose(fixtureId: string): void {
    if (this.context.within(this.router.url).startsWith('/match/')) {
      void this.router.navigate([this.context.url('/match'), fixtureId], {
        queryParamsHandling: 'preserve',
      });
      return;
    }
    this.view.feature(fixtureId);
  }
}
