import { DatePipe, DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  linkedSignal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';
import { filter, startWith } from 'rxjs';
import { LiveScoresService, inPlayWindow } from '../../core/api/live-scores.service';
import { MatchCentreService } from '../../core/api/match-centre.service';
import { MatchCentre, SectionStatus } from '../../core/api/match-centre.models';
import { CompetitionService } from '../../core/competition/competition.service';
import { SelectedRoundService } from '../../core/competition/selected-round.service';
import { RoundViewService } from '../../core/league/round-view.service';
import { ProfileStore } from '../../core/profile/profile.store';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideCloud,
  lucideCloudDrizzle,
  lucideCloudFog,
  lucideCloudLightning,
  lucideCloudMoon,
  lucideCloudRain,
  lucideCloudSnow,
  lucideCloudSun,
  lucideExternalLink,
  lucideMoon,
  lucideRotateCcw,
  lucideSun,
} from '@ng-icons/lucide';
import { Icon } from '../../shared/icon/icon';
import { BallLoader } from '../../shared/ball-loader/ball-loader';
import { MatchHero } from '../home/match-hero/match-hero';
import { MatchPreview } from './match-preview/match-preview';
import { ScoringPanel } from './scoring-panel/scoring-panel';
import { scoringView } from './scoring';
import { sheetView } from './teamsheet';
import { weatherSky } from './weather-sky';

/** South African Standard Time has no daylight saving, so a fixed offset is exact. */
export const SAST = '+0200';

/** Match details for one fixture: kickoff, deadline, live score, teamsheets and weather. */
@Component({
  selector: 'app-match-page',
  templateUrl: './match.page.html',
  styleUrl: './match.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, DecimalPipe, Icon, NgIcon, BallLoader, MatchHero, MatchPreview, ScoringPanel],
  viewProviders: [
    provideIcons({
      lucideCloud,
      lucideCloudDrizzle,
      lucideCloudFog,
      lucideCloudLightning,
      lucideCloudMoon,
      lucideCloudRain,
      lucideCloudSnow,
      lucideCloudSun,
      lucideExternalLink,
      lucideMoon,
      lucideRotateCcw,
      lucideSun,
    }),
  ],
})
export class MatchPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly competition = inject(CompetitionService);
  private readonly live = inject(LiveScoresService);
  private readonly selected = inject(SelectedRoundService);
  private readonly matchCentre = inject(MatchCentreService);
  readonly view = inject(RoundViewService);
  readonly favouriteTeam = inject(ProfileStore).team;
  readonly sast = SAST;

  /** The fixture named in the URL, with its live score, which the shell's selected round follows. */
  readonly fixture = computed(() => this.view.featured());
  readonly configured = this.matchCentre.configured;
  readonly previewConfigured = this.matchCentre.previewConfigured;
  readonly centre = this.matchCentre.centre(() => this.fixture()?.id ?? null);
  /**
   * The latest match centre, kept through a refresh of the same fixture so the page is not
   * rebuilt (and the scoring pitch closed) on every live poll.
   */
  readonly data = linkedSignal<MatchCentre | undefined, MatchCentre | undefined>({
    source: () => (this.centre.hasValue() ? this.centre.value() : undefined),
    computation: (next, previous) =>
      next ?? (previous?.value?.fixtureId === this.fixture()?.id ? previous.value : undefined),
  });
  readonly loading = computed(() => this.centre.isLoading());
  readonly failed = computed(() => this.centre.status() === 'error');
  /** Both teamsheets with ages, flags and club artwork, when they are published. */
  readonly sheets = computed(() => {
    const fixture = this.fixture();
    const centre = this.data();
    const section = centre?.teamsheets;
    if (!fixture || section?.status !== 'ok' || !section.home || !section.away) {
      return null;
    }
    const kickoff = centre?.kickoffUtc ?? fixture.kickoffUtc;
    return [
      sheetView(fixture.home, fixture.homeAsset, section.home, kickoff),
      sheetView(fixture.away, fixture.awayAsset, section.away, kickoff),
    ];
  });
  /** Live score and scoring pitch, hidden until ten minutes before kickoff. */
  readonly scoring = computed(() => {
    const fixture = this.fixture();
    if (!fixture) return null;
    const centre = this.data();
    return scoringView(
      fixture,
      centre?.score,
      this.live.clock(),
      centre?.kickoffUtc ?? fixture.kickoffUtc,
    );
  });
  /** Sky backdrop for the kickoff forecast, when there is one. */
  readonly sky = computed(() => {
    const weather = this.data()?.weather;
    return weather?.status === 'ok' ? weatherSky(weather) : null;
  });

  private lastFixtureId: string | null = null;

  constructor() {
    // A deep link creates this page after its NavigationEnd, so reconcile once on creation too.
    this.router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        startWith(null),
        takeUntilDestroyed(),
      )
      .subscribe({ next: () => this.reconcile() });
    // Refresh the timeline with each live poll while this fixture is in play.
    effect(() => {
      if (!this.live.tick()) return;
      untracked(() => {
        const fixture = this.fixture();
        if (fixture && inPlayWindow(fixture, Date.now())) this.centre.reload();
      });
    });
  }

  reload(): void {
    this.centre.reload();
  }

  /** Copy for a section that has no data to show. */
  message(kind: 'teamsheets' | 'weather', status: SectionStatus): string {
    return MESSAGES[kind][status] ?? MESSAGES[kind]['unavailable']!;
  }

  /**
   * Keeps the URL, the selected round and the featured fixture consistent.
   * A deep link aligns the round with its fixture. Changing the round while here
   * moves to that round's featured fixture. Unknown fixtures return home.
   */
  private reconcile(): void {
    const id = this.route.snapshot.paramMap.get('fixtureId') ?? '';
    const located = this.competition.locate(id);
    if (!located) {
      void this.router.navigate(['/'], { queryParamsHandling: 'preserve', replaceUrl: true });
      return;
    }
    const roundChanged = this.lastFixtureId === id;
    this.lastFixtureId = id;
    if (located.round.id === this.selected.id()) {
      this.view.feature(id);
      return;
    }
    if (roundChanged) {
      const next = this.view.featured();
      if (next) {
        void this.router.navigate(['/match', next.id], {
          queryParamsHandling: 'preserve',
          replaceUrl: true,
        });
      }
      return;
    }
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { round: located.round.id },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }
}

const MESSAGES: Record<string, Partial<Record<SectionStatus, string>>> = {
  teamsheets: {
    not_published: 'Teamsheets are usually published about 48 hours before kickoff.',
    unavailable: 'The URC match centre could not be reached. Try again later.',
  },
  weather: {
    too_early: 'The kickoff forecast opens seven days before the match.',
    past: 'The match has been played.',
    unavailable: 'The forecast could not be loaded.',
  },
};
