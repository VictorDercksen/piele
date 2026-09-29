import type { SkyScene } from './sky-scene';
import { competition } from './registry';
import { pickBackground, StadiumCondition, stadiumCondition } from './stadium-weather';

const URC = competition('urc-2026-27');

describe('stadium weather', () => {
  const conditions: readonly [SkyScene | null, StadiumCondition, StadiumCondition][] = [
    // scene, day, night
    [null, 'sunny-day', 'night-dry'],
    ['clear', 'sunny-day', 'night-dry'],
    ['partly', 'sunny-day', 'night-dry'],
    ['cloudy', 'overcast-day', 'night-dry'],
    ['fog', 'overcast-day', 'night-dry'],
    ['drizzle', 'overcast-day', 'rainy-night'],
    ['rain', 'overcast-day', 'rainy-night'],
    ['storm', 'overcast-day', 'rainy-night'],
    ['snow', 'snow-day', 'snow-day'],
  ];

  it('maps every forecast scene by day and night', () => {
    for (const [scene, day, night] of conditions) {
      expect(stadiumCondition(scene, true), `${scene} by day`).toBe(day);
      expect(stadiumCondition(scene, false), `${scene} by night`).toBe(night);
    }
  });

  it('picks the venue artwork for the condition', () => {
    const munster = URC.team('munster-rugby')!.stadiumBackgrounds;
    for (const [scene, day, night] of conditions) {
      expect(pickBackground(munster, scene, true)).toBe(
        `assets/images/stadium-weather/munster-rugby/${day}.webp`,
      );
      expect(pickBackground(munster, scene, false)).toBe(
        `assets/images/stadium-weather/munster-rugby/${night}.webp`,
      );
    }
  });

  it('shows the rain scene in snow at the Sharks and Stormers grounds', () => {
    for (const id of ['hollywoodbets-sharks', 'dhl-stormers']) {
      const backgrounds = URC.team(id)!.stadiumBackgrounds;
      expect(pickBackground(backgrounds, 'snow', true)).toBe(
        `assets/images/stadium-weather/${id}/overcast-day.webp`,
      );
      expect(pickBackground(backgrounds, 'snow', false)).toBe(
        `assets/images/stadium-weather/${id}/rainy-night.webp`,
      );
    }
  });

  it('falls back to any artwork a venue has', () => {
    const single = { 'night-dry': 'night.webp' };
    for (const [scene] of conditions) {
      expect(pickBackground(single, scene, true), `${scene}`).toBe('night.webp');
      expect(pickBackground(single, scene, false), `${scene}`).toBe('night.webp');
    }
    expect(
      pickBackground({ 'rainy-night': 'rain.webp', 'sunny-day': 'sun.webp' }, 'snow', false),
    ).toBe('rain.webp');
    expect(
      pickBackground({ 'rainy-night': 'rain.webp', 'sunny-day': 'sun.webp' }, 'fog', true),
    ).toBe('sun.webp');
    expect(pickBackground({}, 'clear', true)).toBeUndefined();
  });
});
