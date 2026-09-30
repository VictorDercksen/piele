import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { Competition, Fixture } from './competition.models';
import { CompetitionService } from './competition.service';
import { StadiumSceneService } from './stadium-scene.service';

/** Longest a matchup switch waits for artwork before showing it as it arrives. */
const MAX_WAIT_MS = 600;

/**
 * Club artwork and venue images decoded together before changing the match hero, with the
 * venue's background for the kickoff weather.
 */
export function matchArtwork(
  competition: Competition,
  fixture: Fixture,
  background: string | undefined,
): string[] {
  const home = competition.banners[fixture.homeAsset];
  const away = competition.banners[fixture.awayAsset];
  const { stadiums } = competition;
  return [
    home?.pattern,
    home?.crest,
    away?.pattern,
    away?.crest,
    stadiums.country(fixture.venue)?.flag,
    stadiums.icon(fixture.venue),
    background,
  ].filter((url): url is string => !!url);
}

/**
 * Loads and decodes match artwork ahead of display, so the hero can swap names,
 * colours and images in one frame instead of showing the previous club's art.
 */
@Injectable({ providedIn: 'root' })
export class MatchArtwork {
  private readonly competition = inject(CompetitionService);
  private readonly scenes = inject(StadiumSceneService);
  /** Decoded images, held so the browser keeps them in its memory cache. */
  private readonly images = new Map<string, HTMLImageElement>();
  private readonly settled = signal<ReadonlySet<string>>(new Set());
  /** Cancels for warm-ups still waiting on an idle browser. */
  private readonly pending = new Set<() => void>();

  constructor() {
    // A warm-up that comes due after the app (or a test bed) is torn down loads nothing.
    inject(DestroyRef).onDestroy(() => {
      for (const cancel of this.pending) cancel();
      this.pending.clear();
    });
  }

  /**
   * Starts loading and decoding the fixture's artwork. Repeat calls are free. Called from
   * an effect, it follows the forecast, so a changed background is loaded too.
   */
  preload(fixture: Fixture): void {
    this.load(this.urls(fixture));
  }

  /**
   * Loads a round's artwork once the browser is idle, so later switches need no wait. The
   * images are chosen now, so an effect calling this follows the forecast.
   */
  warm(fixtures: readonly Fixture[]): void {
    const urls = fixtures.flatMap((fixture) => this.urls(fixture));
    const cancel = whenIdle(() => {
      this.pending.delete(cancel);
      this.load(urls);
    });
    this.pending.add(cancel);
  }

  /** Whether the fixture's artwork has decoded, failed or taken too long to wait for. */
  ready(fixture: Fixture): boolean {
    const settled = this.settled();
    return this.urls(fixture).every((url) => settled.has(url));
  }

  private urls(fixture: Fixture): string[] {
    return matchArtwork(
      this.competition.current(),
      fixture,
      this.scenes.fixtureBackground(fixture),
    );
  }

  private load(urls: readonly string[]): void {
    for (const url of urls) {
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
}

/** Runs `run` once the browser is idle (after 200 ms where it cannot tell) and returns a cancel. */
function whenIdle(run: () => void): () => void {
  if (window.requestIdleCallback) {
    const id = window.requestIdleCallback(run);
    return () => window.cancelIdleCallback(id);
  }
  const id = setTimeout(run, 200);
  return () => clearTimeout(id);
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
