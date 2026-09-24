import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  linkedSignal,
  output,
} from '@angular/core';
import { CLUB_BANNERS } from '../../../core/competition/club-banners';
import { Fixture } from '../../../core/competition/competition.models';
import { MatchArtwork } from '../../../core/competition/match-artwork';
import { stadiumCountry } from '../../../core/competition/stadiums';
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
  readonly homeBanner = computed(() => CLUB_BANNERS[this.shown().homeAsset]);
  readonly awayBanner = computed(() => CLUB_BANNERS[this.shown().awayAsset]);
  readonly country = computed(() => stadiumCountry(this.shown().venue));

  constructor() {
    effect(() => this.artwork.preload(this.fixture()));
  }
}
