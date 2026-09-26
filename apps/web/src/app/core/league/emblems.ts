/**
 * League emblems. A league shows an uploaded image, one of these preset crests, the Piele
 * crest (the first league) or a monogram of its initials. The presets ship as
 * `assets/images/emblems/{key}.svg`; each draws a `#emblem` group in `currentColor`, so the
 * league's accent colour tints it. The API stores a preset as `preset:{key}` and validates the
 * key against the same list.
 */
export const EMBLEM_PRESETS = [
  'oak',
  'anvil',
  'lantern',
  'compass',
  'chevron',
  'crown',
  'wave',
  'star',
] as const;

export type EmblemPreset = (typeof EMBLEM_PRESETS)[number];

/** The names members see beside the preset crests. */
export const EMBLEM_LABELS: Readonly<Record<EmblemPreset, string>> = {
  oak: 'Oak',
  anvil: 'Anvil',
  lantern: 'Lantern',
  compass: 'Compass',
  chevron: 'Chevron',
  crown: 'Crown',
  wave: 'Wave',
  star: 'Star',
};

/** The tint of a preset crest or monogram ring when the league has no accent colour. */
export const DEFAULT_ACCENT = '#d9b36c';

export function isEmblemPreset(value: unknown): value is EmblemPreset {
  return typeof value === 'string' && (EMBLEM_PRESETS as readonly string[]).includes(value);
}

/** The preset's SVG file. */
export function emblemAsset(key: EmblemPreset): string {
  return `assets/images/emblems/${key}.svg`;
}

/** A `#rrggbb` accent colour, as the API stores it (lower case). */
export function isAccentColour(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/.test(value);
}
