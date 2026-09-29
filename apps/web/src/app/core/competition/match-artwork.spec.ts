import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ApplicationRef, effect } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RoundWeather } from '../api/match-centre.models';
import { Fixture } from './competition.models';
import { MatchArtwork, matchArtwork } from './match-artwork';
import { competition } from './registry';

const URC = competition('urc-2026-27');

const MUNSTER_GLASGOW: Fixture = {
  id: 'test',
  kickoffUtc: '2026-09-26T16:30:00Z',
  home: 'Munster',
  away: 'Glasgow',
  homeAsset: 'munster-rugby',
  awayAsset: 'glasgow-warriors',
  day: 'SAT 26 SEPT',
  time: '18:30',
  venue: 'Thomond Park',
};

describe('match artwork', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
  });
  afterEach(() => {
    delete (HTMLImageElement.prototype as Partial<HTMLImageElement>).decode;
    vi.useRealTimers();
  });

  it('lists both clubs’ artwork and the venue flag, icon and background', () => {
    expect(matchArtwork(URC, MUNSTER_GLASGOW, 'background.webp')).toEqual([
      'assets/images/club-banners/munster-rugby-pattern.jpeg',
      'assets/images/club-banners/munster-rugby-crest.svg',
      'assets/images/club-banners/glasgow-warriors-pattern.jpeg',
      'assets/images/club-banners/glasgow-warriors-crest.svg',
      'assets/images/flags/ie.svg',
      'assets/images/stadiums/thomond-park.webp',
      'background.webp',
    ]);
    expect(
      matchArtwork(
        URC,
        { ...MUNSTER_GLASGOW, awayAsset: 'unknown', venue: 'To be confirmed' },
        undefined,
      ),
    ).toHaveLength(2);
  });

  it('is ready once every image has decoded', async () => {
    let finish!: () => void;
    const decoded = new Promise<void>((resolve) => (finish = resolve));
    const decode = vi.fn(() => decoded);
    stubDecode(decode);
    const artwork = TestBed.inject(MatchArtwork);

    artwork.preload(MUNSTER_GLASGOW);
    artwork.preload(MUNSTER_GLASGOW);
    expect(decode).toHaveBeenCalledTimes(7);
    expect(artwork.ready(MUNSTER_GLASGOW)).toBe(false);

    finish();
    await new Promise((resolve) => setTimeout(resolve));
    expect(artwork.ready(MUNSTER_GLASGOW)).toBe(true);
  });

  it('stops waiting for artwork that fails or loads slowly', async () => {
    vi.useFakeTimers();
    stubDecode(() => new Promise(() => undefined));
    const artwork = TestBed.inject(MatchArtwork);

    artwork.preload(MUNSTER_GLASGOW);
    expect(artwork.ready(MUNSTER_GLASGOW)).toBe(false);
    await vi.advanceTimersByTimeAsync(600);
    expect(artwork.ready(MUNSTER_GLASGOW)).toBe(true);
  });

  it('warms a round’s artwork once the browser is idle', async () => {
    vi.useFakeTimers();
    const decode = vi.fn(() => Promise.resolve());
    stubDecode(decode);
    const artwork = TestBed.inject(MatchArtwork);

    artwork.warm([MUNSTER_GLASGOW]);
    expect(decode).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(200);
    expect(decode).toHaveBeenCalledTimes(7);
    expect(artwork.ready(MUNSTER_GLASGOW)).toBe(true);
  });

  it('loads the venue for the kickoff weather and follows a forecast that arrives later', async () => {
    const decode = vi.fn(function (this: HTMLImageElement) {
      return Promise.resolve();
    });
    stubDecode(decode);
    const artwork = TestBed.inject(MatchArtwork);
    const loaded = () => decode.mock.contexts.map((image) => image.getAttribute('src'));
    TestBed.runInInjectionContext(() => effect(() => artwork.preload(MUNSTER_GLASGOW)));
    TestBed.tick();
    // No forecast yet: the clear scene, as the sun is up at Thomond Park at 17:30 local.
    expect(loaded()).toContain('assets/images/stadium-weather/munster-rugby/sunny-day.webp');
    await new Promise((resolve) => setTimeout(resolve));
    expect(artwork.ready(MUNSTER_GLASGOW)).toBe(true);

    const forecast: RoundWeather = {
      round: 1,
      generatedAt: '2026-09-25T10:00:00Z',
      matches: [
        {
          fixtureId: MUNSTER_GLASGOW.id,
          status: 'ok',
          weatherCode: 61,
          isDay: false,
          forecastHourUtc: '2026-09-26T16:00:00Z',
        },
      ],
    };
    TestBed.inject(HttpTestingController)
      .expectOne((request) => request.url.endsWith('/weather'))
      .flush(forecast);
    await TestBed.inject(ApplicationRef).whenStable();
    expect(loaded()).toContain('assets/images/stadium-weather/munster-rugby/rainy-night.webp');
    await new Promise((resolve) => setTimeout(resolve));
    expect(artwork.ready(MUNSTER_GLASGOW)).toBe(true);
  });
});

/** jsdom does not implement HTMLImageElement.decode. */
function stubDecode(decode: (this: HTMLImageElement) => Promise<void>): void {
  Object.defineProperty(HTMLImageElement.prototype, 'decode', {
    configurable: true,
    writable: true,
    value: decode,
  });
}
