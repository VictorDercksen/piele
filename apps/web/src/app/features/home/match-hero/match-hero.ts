import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  linkedSignal,
  output,
  signal,
} from '@angular/core';
import { CLUB_BANNERS } from '../../../core/competition/club-banners';
import { Fixture } from '../../../core/competition/competition.models';
import { MatchArtwork } from '../../../core/competition/match-artwork';
import { scoreBug } from '../../../core/competition/match-status';
import { stadiumCountry, stadiumIcon } from '../../../core/competition/stadiums';
import { Icon } from '../../../shared/icon/icon';

/** Featured fixture with official club banners and stadium details. */
@Component({
  selector: 'app-match-hero',
  templateUrl: './match-hero.html',
  styleUrl: './match-hero.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon],
})
export class MatchHero {
  private readonly artwork = inject(MatchArtwork);
  readonly fixture = input.required<Fixture>();
  readonly roundCode = input.required<string>();
  readonly favourite = input('');
  /** Heading shown before the final whistle. */
  readonly label = input('FEATURED MATCH');
  /** Shows the link into the match centre. */
  readonly linked = input(true);
  readonly explore = output<void>();
  /**
   * The fixture on screen. Holds the previous matchup until the next one's artwork
   * has decoded, so the whole hero changes in one frame.
   */
  readonly shown = linkedSignal<Fixture, Fixture>({
    source: this.fixture,
    computation: (next, previous) =>
      !previous || this.artwork.ready(next) ? next : previous.value,
  });
  /** Kickoff time, live score or result for the fixture on screen. */
  readonly bug = computed(() => scoreBug(this.shown()));
  readonly homeBanner = computed(() => CLUB_BANNERS[this.shown().homeAsset]);
  readonly awayBanner = computed(() => CLUB_BANNERS[this.shown().awayAsset]);
  readonly country = computed(() => stadiumCountry(this.shown().venue));
  /** An icon that failed to load, replaced by the generic stadium drawing. */
  readonly iconFailed = signal<string | undefined>(undefined);
  /** The venue's own icon; unknown venues and failed loads fall back to the generic drawing. */
  readonly stadiumIcon = computed(() => {
    const icon = stadiumIcon(this.shown().venue);
    return icon === this.iconFailed() ? undefined : icon;
  });

  constructor() {
    effect(() => this.artwork.preload(this.fixture()));
  }
}
