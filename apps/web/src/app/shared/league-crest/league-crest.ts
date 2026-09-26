import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { EmblemImages } from '../../core/league/emblem-images';
import { emblemAsset, isAccentColour, isEmblemPreset } from '../../core/league/emblems';
import { MemberAvatar } from '../member-avatar/member-avatar';

/** The first league's crest, which predates league emblems. */
const PIELE_CREST = 'assets/images/piele-crest.png';

/**
 * A league's emblem: its uploaded image, else its preset crest tinted with the accent colour,
 * else the Piele crest for the first league, else a brass monogram of the league's initials
 * (the member monogram, ringed in the accent colour when the league has one). Decorative; the
 * league's name is always shown beside it. Size it with `--avatar-size`.
 */
@Component({
  selector: 'app-league-crest',
  template: `
    @if (upload(); as src) {
      <img class="upload" [src]="src" alt="" />
    } @else if (presetAsset(); as asset) {
      <svg class="preset" viewBox="0 0 96 96" focusable="false">
        <use [attr.href]="asset + '#emblem'" />
      </svg>
    } @else if (pieleCrest()) {
      <img [src]="pieleSrc" alt="" />
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
      color: var(--crest-accent, #d9b36c); /* DEFAULT_ACCENT */
    }
    img,
    svg {
      width: 100%;
      height: 100%;
      object-fit: contain;
    }
    .upload {
      border-radius: 18%;
      object-fit: cover;
    }
    .preset {
      filter: drop-shadow(0 1px 2px #0008);
    }
    :host(.accented) app-member-avatar {
      --monogram-ring: var(--crest-accent);
      --monogram-face-hi: color-mix(in srgb, var(--crest-accent) 42%, #0b1518);
      --monogram-face: color-mix(in srgb, var(--crest-accent) 16%, #0b1518);
      --monogram-ink: color-mix(in srgb, var(--crest-accent) 35%, #fff);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    'aria-hidden': 'true',
    '[class.accented]': '!!accent()',
    '[style.--crest-accent]': 'accent()',
  },
  imports: [MemberAvatar],
})
export class LeagueCrest {
  private readonly images = inject(EmblemImages);
  readonly name = input.required<string>();
  readonly slug = input('');
  readonly emblemUrl = input<string | null>(null);
  readonly emblemPreset = input<string | null>(null);
  readonly accentColour = input<string | null>(null);
  /** The uploaded emblem once its bytes have loaded. */
  readonly upload = computed(() => {
    const url = this.emblemUrl();
    return url ? this.images.resolve(url)() : null;
  });
  readonly presetAsset = computed(() => {
    const key = this.emblemPreset();
    return isEmblemPreset(key) ? emblemAsset(key) : null;
  });
  readonly pieleCrest = computed(() => this.slug() === 'piele');
  readonly pieleSrc = PIELE_CREST;
  readonly accent = computed(() => {
    const colour = this.accentColour();
    return isAccentColour(colour) ? colour : null;
  });
}
