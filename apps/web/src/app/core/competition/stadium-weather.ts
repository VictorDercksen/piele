import type { SkyScene } from '../../features/match/weather-sky';

/** The weather variants of a stadium's artwork, in fallback order. */
export const STADIUM_CONDITIONS = [
  'sunny-day',
  'overcast-day',
  'night-dry',
  'rainy-night',
  'snow-day',
] as const;

export type StadiumCondition = (typeof STADIUM_CONDITIONS)[number];

/** A stadium's artwork by condition. A venue may ship only some of them. */
export type StadiumBackgrounds = Readonly<Partial<Record<StadiumCondition, string>>>;

/**
 * The artwork condition for a kickoff forecast scene, or for no forecast when `scene` is
 * null. Snow shows the snow scene by day or night.
 */
export function stadiumCondition(scene: SkyScene | null, day: boolean): StadiumCondition {
  switch (scene) {
    case null:
    case 'clear':
    case 'partly':
      return day ? 'sunny-day' : 'night-dry';
    case 'cloudy':
    case 'fog':
      return day ? 'overcast-day' : 'night-dry';
    case 'drizzle':
    case 'rain':
    case 'storm':
      return day ? 'overcast-day' : 'rainy-night';
    case 'snow':
      return 'snow-day';
  }
}

/**
 * The stadium artwork for a scene. A venue without snow artwork shows its rain scene;
 * any other missing condition falls back to the first artwork the venue has.
 */
export function pickBackground(
  backgrounds: StadiumBackgrounds,
  scene: SkyScene | null,
  day: boolean,
): string | undefined {
  const condition = stadiumCondition(scene, day);
  const snowless =
    condition === 'snow-day' ? backgrounds[stadiumCondition('rain', day)] : undefined;
  return (
    backgrounds[condition] ??
    snowless ??
    STADIUM_CONDITIONS.map((c) => backgrounds[c]).find((url) => url !== undefined)
  );
}
