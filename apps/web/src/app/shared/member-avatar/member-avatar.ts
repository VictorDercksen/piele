import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/**
 * A member's avatar on the honours boards: their photo, else their favourite team's artwork,
 * else a brass monogram of their Superbru name. Decorative; the name is always shown beside it.
 * Size it with `--avatar-size`.
 */
@Component({
  selector: 'app-member-avatar',
  template: `
    @if (photo(); as photo) {
      <img class="photo" [src]="photo" alt="" />
    } @else if (teamId()) {
      <img class="crest" [src]="'assets/images/teams/' + teamId() + '.png'" alt="" />
    } @else {
      <span class="monogram">{{ initials() }}</span>
    }
  `,
  styleUrl: './member-avatar.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-hidden': 'true' },
})
export class MemberAvatar {
  readonly name = input.required<string>();
  readonly photo = input<string | null>(null);
  readonly teamId = input('');
  readonly initials = computed(() => monogram(this.name()));
}

/**
 * Up to two initials from a Superbru name: one per word, or per capitalised part of a single
 * word ("TheoLotter" is TL, "DanB97" is DB, "Wolfgodallahmeen" is W).
 */
export function monogram(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const parts = words.length > 1 ? words : (words[0] ?? '').split(/(?=\p{Lu})/u);
  const letters = parts
    .map((part) => part.match(/\p{L}/u)?.[0])
    .filter((letter): letter is string => !!letter)
    .slice(0, 2);
  return (letters.length ? letters.join('') : name.trim().charAt(0) || '?').toUpperCase();
}
