import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Spinning URC match ball. Announces its label to screen readers as a status. */
@Component({
  selector: 'app-loader',
  template: `<img src="assets/images/urc-ball.webp" alt="" />
    @if (showLabel()) {
      <span>{{ label() }}</span>
    }`,
  styleUrl: './loader.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    role: 'status',
    '[attr.aria-label]': 'showLabel() ? null : label()',
    '[style.--loader-size.px]': 'size()',
  },
})
export class Loader {
  readonly size = input(64);
  readonly label = input('Loading');
  /** Shows the label beside the ball instead of only announcing it. */
  readonly showLabel = input(false);
}
