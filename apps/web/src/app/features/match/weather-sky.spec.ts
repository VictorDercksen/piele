import { WeatherSection } from '../../core/api/match-centre.models';
import { weatherSky } from './weather-sky';

function forecast(overrides: Partial<WeatherSection>): WeatherSection {
  return {
    status: 'ok',
    source: 'Open-Meteo',
    fetchedAt: null,
    forecastHourUtc: '2026-09-25T19:00Z',
    weatherCode: 0,
    isDay: true,
    ...overrides,
  };
}

describe('weather sky', () => {
  it('maps WMO codes to scenes', () => {
    const scenes = [0, 1, 2, 3, 45, 53, 61, 81, 73, 86, 95, 99, null].map(
      (weatherCode) => weatherSky(forecast({ weatherCode })).scene,
    );
    expect(scenes).toEqual([
      'clear',
      'clear',
      'partly',
      'cloudy',
      'fog',
      'drizzle',
      'rain',
      'rain',
      'snow',
      'snow',
      'storm',
      'storm',
      'cloudy',
    ]);
  });

  it('uses isDay for the time of day and icon', () => {
    expect(weatherSky(forecast({ isDay: true }))).toEqual({
      scene: 'clear',
      time: 'day',
      icon: 'lucideSun',
    });
    expect(weatherSky(forecast({ isDay: false, weatherCode: 2 }))).toEqual({
      scene: 'partly',
      time: 'night',
      icon: 'lucideCloudMoon',
    });
  });

  it('falls back to the SAST kickoff hour without isDay', () => {
    // 19:00 UTC is 21:00 SAST; 13:00 UTC is 15:00 SAST.
    expect(weatherSky(forecast({ isDay: null })).time).toBe('night');
    expect(
      weatherSky(forecast({ isDay: undefined, forecastHourUtc: '2026-09-25T13:00Z' })).time,
    ).toBe('day');
  });
});
