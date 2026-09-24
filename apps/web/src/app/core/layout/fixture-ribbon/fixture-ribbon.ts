import { ChangeDetectionStrategy, Component, effect, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Fixture } from '../../competition/competition.models';
import { MatchArtwork } from '../../competition/match-artwork';
import { jersey } from '../../competition/teams';
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
        [attr.aria-pressed]="view.featured()?.id === match.id"
        (click)="choose(match.id)"
        (pointerenter)="prepare(match)"
        (focus)="prepare(match)"
      >
        <span
          >{{ match.day }} <strong>{{ match.score || match.time }}</strong></span
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
  private readonly artwork = inject(MatchArtwork);
  readonly view = inject(RoundViewService);
  readonly jersey = jersey;

  constructor() {
    effect(() => this.artwork.warm(this.view.fixtures()));
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
    if (this.router.url.split(/[?#]/)[0].startsWith('/match/')) {
      void this.router.navigate(['/match', fixtureId], { queryParamsHandling: 'preserve' });
      return;
    }
    this.view.feature(fixtureId);
  }
}
