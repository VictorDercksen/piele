import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { CompetitionService } from '../../core/competition/competition.service';

/** The competition's match ball bouncing on its shadow, with a visible caption. Used where a page or panel is loading. */
@Component({
  selector: 'app-ball-loader',
  template: `<span class="stage" aria-hidden="true">
      <span class="shadow"></span>
      <span class="hop"><img [src]="ball()" alt="" /></span>
    </span>
    <span class="label" aria-hidden="true">{{ label() }}</span>`,
  styleUrl: './ball-loader.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    role: 'status',
    '[attr.aria-label]': 'label()',
    '[style.--loader-size.px]': 'size()',
  },
})
export class BallLoader {
  private readonly competition = inject(CompetitionService);
  readonly ball = computed(() => this.competition.current().ball);
  readonly size = input(64);
  readonly label = input('Loading');
}
