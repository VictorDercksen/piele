export type SkyScene =
  'clear' | 'partly' | 'cloudy' | 'fog' | 'drizzle' | 'rain' | 'snow' | 'storm';
export type SkyTime = 'day' | 'night';

/**
 * The sky scene for an Open-Meteo WMO weather code. A null or unknown code in a forecast
 * reads as cloudy; callers without any forecast should not pass one here.
 */
export function skyScene(code: number | null): SkyScene {
  if (code === null) return 'cloudy';
  if (code <= 1) return 'clear';
  if (code === 2) return 'partly';
  if (code === 45 || code === 48) return 'fog';
  if (code >= 51 && code <= 57) return 'drizzle';
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return 'rain';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  if (code >= 95) return 'storm';
  return 'cloudy';
}
