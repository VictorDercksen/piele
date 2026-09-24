import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** URC match ball bouncing on its shadow, with a visible caption. Used where a page or panel is loading. */
@Component({
  selector: 'app-ball-loader',
  template: `<span class="stage" aria-hidden="true">
      <span class="shadow"></span>
      <span class="hop"><img src="assets/images/urc-ball.webp" alt="" /></span>
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
  readonly size = input(64);
  readonly label = input('Loading');
}
