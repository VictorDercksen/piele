import { Injectable, signal } from '@angular/core';
import { CLUB_BANNERS } from './club-banners';
import { Fixture } from './competition.models';
import { stadiumCountry } from './stadiums';

/** Longest a matchup switch waits for artwork before showing it as it arrives. */
const MAX_WAIT_MS = 600;

/** Every image the match hero draws for a fixture: club patterns, crests and the stadium flag. */
export function matchArtwork(fixture: Fixture): string[] {
  const home = CLUB_BANNERS[fixture.homeAsset];
  const away = CLUB_BANNERS[fixture.awayAsset];
  return [
    home?.pattern,
    home?.crest,
    away?.pattern,
    away?.crest,
    stadiumCountry(fixture.venue)?.flag,
  ].filter((url): url is string => !!url);
}

/**
 * Loads and decodes match artwork ahead of display, so the hero can swap names,
 * colours and images in one frame instead of showing the previous club's art.
 */
@Injectable({ providedIn: 'root' })
export class MatchArtwork {
  /** Decoded images, held so the browser keeps them in its memory cache. */
  private readonly images = new Map<string, HTMLImageElement>();
  private readonly settled = signal<ReadonlySet<string>>(new Set());

  /** Starts loading and decoding the fixture's artwork. Repeat calls are free. */
  preload(fixture: Fixture): void {
    for (const url of matchArtwork(fixture)) {
      if (this.images.has(url)) continue;
      const image = new Image();
      image.src = url;
      this.images.set(url, image);
      const decoded = typeof image.decode === 'function' ? image.decode() : Promise.resolve();
      void Promise.race([decoded.catch(() => undefined), wait(MAX_WAIT_MS)]).then(() =>
        this.settled.update((urls) => new Set(urls).add(url)),
      );
    }
  }

  /** Loads a round's artwork once the browser is idle, so later switches need no wait. */
  warm(fixtures: readonly Fixture[]): void {
    const idle = window.requestIdleCallback ?? ((run: () => void) => setTimeout(run, 200));
    idle(() => fixtures.forEach((fixture) => this.preload(fixture)));
  }

  /** Whether the fixture's artwork has decoded, failed or taken too long to wait for. */
  ready(fixture: Fixture): boolean {
    const settled = this.settled();
    return matchArtwork(fixture).every((url) => settled.has(url));
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
