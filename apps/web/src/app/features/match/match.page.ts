import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';
import { filter, startWith } from 'rxjs';
import { MatchCentreService } from '../../core/api/match-centre.service';
import { SectionStatus } from '../../core/api/match-centre.models';
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
import { Loader } from '../../shared/loader/loader';
import { MatchHero } from '../home/match-hero/match-hero';
import { weatherSky } from './weather-sky';

/** South African Standard Time has no daylight saving, so a fixed offset is exact. */
export const SAST = '+0200';

/** Match details for one fixture: kickoff, deadline, teamsheets and weather. */
@Component({
  selector: 'app-match-page',
  templateUrl: './match.page.html',
  styleUrl: './match.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, DecimalPipe, Icon, NgIcon, Loader, MatchHero],
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
  private readonly selected = inject(SelectedRoundService);
  private readonly matchCentre = inject(MatchCentreService);
  readonly view = inject(RoundViewService);
  readonly favouriteTeam = inject(ProfileStore).team;
  readonly sast = SAST;

  /** The fixture named in the URL, which the shell's selected round follows. */
  readonly fixture = computed(() => {
    const id = this.view.featured()?.id;
    return id ? this.competition.locate(id)?.fixture : undefined;
  });
  readonly configured = this.matchCentre.configured;
  readonly centre = this.matchCentre.centre(() => this.fixture()?.id ?? null);
  readonly data = computed(() => (this.centre.hasValue() ? this.centre.value() : undefined));
  readonly loading = computed(() => this.centre.isLoading());
  readonly failed = computed(() => this.centre.status() === 'error');
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
