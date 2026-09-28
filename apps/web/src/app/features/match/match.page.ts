import { HlmButton } from '@spartan-ng/helm/button';
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
import { MatchCentre } from '../../core/api/match-centre.models';
import { CompetitionService } from '../../core/competition/competition.service';
import { LeagueTime } from '../../core/competition/league-time';
import { LeagueTimePipe } from '../../core/competition/league-time.pipe';
import { SelectedRoundService } from '../../core/competition/selected-round.service';
import { LeagueContext } from '../../core/league/league-context';
import { RoundViewService } from '../../core/league/round-view.service';
import { ProfileStore } from '../../core/profile/profile.store';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideRotateCcw } from '@ng-icons/lucide';
import { Icon } from '../../shared/icon/icon';
import { BallLoader } from '../../shared/ball-loader/ball-loader';
import { MatchHero } from '../home/match-hero/match-hero';
import { MatchPreview } from './match-preview/match-preview';
import { PicksPanel } from './picks-panel/picks-panel';
import { ScoringPanel } from './scoring-panel/scoring-panel';
import { WeatherPanel } from './weather-panel/weather-panel';
import { TeamsheetsPanel } from './teamsheets-panel/teamsheets-panel';
import { scoringView } from './scoring';

/** Match details for one fixture: kickoff, deadline, live score, teamsheets and weather. */
@Component({
  selector: 'app-match-page',
  templateUrl: './match.page.html',
  styleUrl: './match.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  /* prettier-ignore */
  imports: [
    LeagueTimePipe,
    Icon,
    NgIcon,
    BallLoader,
    MatchHero,
    MatchPreview,
    PicksPanel,
    ScoringPanel,
    WeatherPanel,
    TeamsheetsPanel,
    HlmButton,
  ],
  viewProviders: [provideIcons({ lucideRotateCcw })],
})
export class MatchPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly context = inject(LeagueContext);
  private readonly competition = inject(CompetitionService);
  private readonly live = inject(LiveScoresService);
  private readonly selected = inject(SelectedRoundService);
  private readonly matchCentre = inject(MatchCentreService);
  readonly view = inject(RoundViewService);
  readonly favouriteTeam = inject(ProfileStore).team;
  /** The display zone for the page's timestamps. */
  readonly zone = inject(LeagueTime).zone;

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
  /** Live score and scoring pitch, hidden until ten minutes before kickoff. */
  readonly scoring = computed(() => {
    const fixture = this.fixture();
    if (!fixture) return null;
    const centre = this.data();
    return scoringView(
      this.competition.current(),
      fixture,
      centre?.score,
      this.live.clock(),
      centre?.kickoffUtc ?? fixture.kickoffUtc,
    );
  });
  /** The kickoff forecast shows until the match has been played. */
  readonly showForecast = computed(() => {
    const centre = this.data();
    return !!centre && centre.weather.status !== 'past' && centre.score?.state !== 'full_time';
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

  /**
   * Keeps the URL, the selected round and the featured fixture consistent.
   * A deep link aligns the round with its fixture. Changing the round while here
   * moves to that round's featured fixture. Unknown fixtures return home.
   */
  private reconcile(): void {
    const id = this.route.snapshot.paramMap.get('fixtureId') ?? '';
    const located = this.competition.locate(id);
    if (!located) {
      void this.router.navigate([this.context.url()], {
        queryParamsHandling: 'preserve',
        replaceUrl: true,
      });
      return;
    }
    const roundChanged = this.lastFixtureId === id;
    // Another fixture starts at the top: the shell scrolls up before any page or fixture change.
    this.lastFixtureId = id;
    if (located.round.id === this.selected.id()) {
      this.view.feature(id);
      return;
    }
    if (roundChanged) {
      const next = this.view.featured();
      if (next) {
        void this.router.navigate([this.context.url('/match'), next.id], {
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
