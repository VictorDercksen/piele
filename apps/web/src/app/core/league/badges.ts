/** A round or season badge: the owner's artwork and its text alternative. */
export interface Badge {
  readonly src: string;
  readonly alt: string;
}

/**
 * Superbru badges: the yellow cap for a completed round's winner(s), the spoon for its
 * last-placed member(s) and the URC trophy for last season's champion. 256 px WebP with alpha.
 */
export const BADGES = {
  cap: { src: 'assets/images/badges/cap.webp', alt: 'Round winner' },
  spoon: { src: 'assets/images/badges/spoon.webp', alt: 'Round spoon' },
  crown: { src: 'assets/images/badges/trophy.webp', alt: "Last season's champion" },
} as const satisfies Record<'cap' | 'spoon' | 'crown', Badge>;
