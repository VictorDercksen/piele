import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MemberAvatar } from '../member-avatar/member-avatar';

/** The first league's crest, which predates league emblems. */
const PIELE_CREST = 'assets/images/piele-crest.png';

/**
 * A league's emblem: the uploaded or preset emblem when it has one, the Piele crest for the
 * first league, else a brass monogram of the league's initials (the member monogram).
 * Decorative; the league's name is always shown beside it. Size it with `--avatar-size`.
 */
@Component({
  selector: 'app-league-crest',
  template: `
    @if (image(); as src) {
      <img [src]="src" alt="" />
    } @else {
      <app-member-avatar [name]="name()" />
    }
  `,
  styles: `
    :host {
      display: inline-grid;
      place-items: center;
      width: var(--avatar-size, 32px);
      height: var(--avatar-size, 32px);
      flex-shrink: 0;
    }
    img {
      width: 100%;
      height: 100%;
      object-fit: contain;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-hidden': 'true' },
  imports: [MemberAvatar],
})
export class LeagueCrest {
  readonly name = input.required<string>();
  readonly slug = input('');
  readonly emblemUrl = input<string | null>(null);
  readonly image = computed(
    () => this.emblemUrl() ?? (this.slug() === 'piele' ? PIELE_CREST : null),
  );
}
