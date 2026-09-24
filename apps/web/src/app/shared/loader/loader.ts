import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Spinning arc for buttons and inline waits. Takes the text colour. Announces its label to screen readers as a status. */
@Component({
  selector: 'app-loader',
  template: `<span class="arc"></span>
    @if (showLabel()) {
      <span class="label">{{ label() }}</span>
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
  readonly size = input(18);
  readonly label = input('Loading');
  /** Shows the label beside the arc instead of only announcing it. */
  readonly showLabel = input(false);
}
