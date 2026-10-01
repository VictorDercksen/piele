import { NgTemplateOutlet } from '@angular/common';
import { HlmButton } from '@spartan-ng/helm/button';
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
import { RouterLink } from '@angular/router';
import { Fixture } from '../../../core/competition/competition.models';
import { CompetitionService } from '../../../core/competition/competition.service';
import { LeagueTime } from '../../../core/competition/league-time';
import { MatchArtwork } from '../../../core/competition/match-artwork';
import { scoreBug } from '../../../core/competition/match-status';
import { LeaguePathPipe } from '../../../core/league/league-path.pipe';
import { Icon } from '../../../shared/icon/icon';
import { KickoffRulerView } from './kickoff-ruler.models';

/**
 * Featured fixture with official club banners and stadium details. With a `ruler`, the footer
 * lays the member's picks for the round along its kickoffs.
 */
@Component({
  selector: 'app-match-hero',
  templateUrl: './match-hero.html',
  styleUrl: './match-hero.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  /* prettier-ignore */
  imports: [
    Icon,
    HlmButton,
    NgTemplateOutlet,
    RouterLink,
    LeaguePathPipe,
  ],
})
export class MatchHero {
  private readonly artwork = inject(MatchArtwork);
  private readonly competition = inject(CompetitionService);
  private readonly zone = inject(LeagueTime).zone;
  readonly fixture = input.required<Fixture>();
  readonly roundCode = input.required<string>();
  readonly favourite = input('');
  /** Heading shown before the final whistle. */
  readonly label = input('FEATURED MATCH');
  /** Shows the link into the match centre. */
  readonly linked = input(true);
  /** The member's picks for the round along its kickoffs; null leaves the footer as it was. */
  readonly ruler = input<KickoffRulerView | null>(null);
  readonly explore = output<void>();
  /**
   * The fixture on screen. Holds the previous matchup until the next one's artwork
   * has decoded, so the whole hero changes in one frame. The same matchup updates at once,
   * even while a forecast's new background is still loading.
   */
  readonly shown = linkedSignal<Fixture, Fixture>({
    source: this.fixture,
    computation: (next, previous) =>
      !previous || previous.value.id === next.id || this.artwork.ready(next)
        ? next
        : previous.value,
  });
  /** Kickoff time, live score or result for the fixture on screen. */
  readonly bug = computed(() => scoreBug(this.shown(), this.zone()));
  readonly homeBanner = computed(() => this.competition.current().banners[this.shown().homeAsset]);
  readonly awayBanner = computed(() => this.competition.current().banners[this.shown().awayAsset]);
  readonly country = computed(() =>
    this.competition.current().stadiums.country(this.shown().venue),
  );
  /** An icon that failed to load, replaced by the generic stadium drawing. */
  readonly iconFailed = signal<string | undefined>(undefined);
  /** The venue's own icon; unknown venues and failed loads fall back to the generic drawing. */
  readonly stadiumIcon = computed(() => {
    const icon = this.competition.current().stadiums.icon(this.shown().venue);
    return icon === this.iconFailed() ? undefined : icon;
  });

  constructor() {
    effect(() => this.artwork.preload(this.fixture()));
  }
}
