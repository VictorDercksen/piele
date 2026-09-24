import { WeatherSection } from '../../core/api/match-centre.models';

export type SkyScene =
  'clear' | 'partly' | 'cloudy' | 'fog' | 'drizzle' | 'rain' | 'snow' | 'storm';
export type SkyTime = 'day' | 'night';

/** The backdrop and icon for a kickoff forecast. */
export interface WeatherSky {
  readonly scene: SkyScene;
  readonly time: SkyTime;
  readonly icon: string;
}

/**
 * Maps an Open-Meteo WMO weather code to a sky scene. Unknown codes read as cloudy.
 * Day or night comes from the forecast's `isDay`; older snapshots without it fall
 * back to the kickoff hour in SAST, which is within two hours of every URC venue.
 */
export function weatherSky(weather: WeatherSection): WeatherSky {
  const scene = sceneFor(weather.weatherCode ?? null);
  const time = (weather.isDay ?? daylightHour(weather.forecastHourUtc)) ? 'day' : 'night';
  return { scene, time, icon: ICONS[scene][time] };
}

function sceneFor(code: number | null): SkyScene {
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

function daylightHour(forecastHourUtc: string | undefined): boolean {
  const moment = forecastHourUtc ? Date.parse(forecastHourUtc) : NaN;
  if (Number.isNaN(moment)) return true;
  const sastHour = (new Date(moment).getUTCHours() + 2) % 24;
  return sastHour >= 6 && sastHour < 19;
}

const ICONS: Record<SkyScene, Record<SkyTime, string>> = {
  clear: { day: 'lucideSun', night: 'lucideMoon' },
  partly: { day: 'lucideCloudSun', night: 'lucideCloudMoon' },
  cloudy: { day: 'lucideCloud', night: 'lucideCloud' },
  fog: { day: 'lucideCloudFog', night: 'lucideCloudFog' },
  drizzle: { day: 'lucideCloudDrizzle', night: 'lucideCloudDrizzle' },
  rain: { day: 'lucideCloudRain', night: 'lucideCloudRain' },
  snow: { day: 'lucideCloudSnow', night: 'lucideCloudSnow' },
  storm: { day: 'lucideCloudLightning', night: 'lucideCloudLightning' },
};
