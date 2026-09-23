import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { jersey } from '../../competition/teams';
import { RoundViewService } from '../../league/round-view.service';

/** The selected round's fixtures. Choosing one features it in the home match centre. */
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
        (click)="view.feature(match.id)"
      >
        <span
          >{{ match.day }} <strong>{{ match.score || match.time }}</strong></span
        ><span
          ><img [src]="jersey(match.homeAsset)" alt="" />{{ match.home }}<i>v</i>{{ match.away
          }}<img [src]="jersey(match.awayAsset)" alt=""
        /></span>
      </button>
    }
  </div>`,
  styleUrl: './fixture-ribbon.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FixtureRibbon {
  readonly view = inject(RoundViewService);
  readonly jersey = jersey;
}
