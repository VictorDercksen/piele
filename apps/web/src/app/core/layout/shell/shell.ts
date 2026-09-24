import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  ActivatedRouteSnapshot,
  Event,
  NavigationCancel,
  NavigationEnd,
  NavigationError,
  NavigationStart,
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from '@angular/router';
import { debounce, filter, map, of, timer } from 'rxjs';
import { CompetitionService } from '../../competition/competition.service';
import { SelectedRoundService } from '../../competition/selected-round.service';
import { ToastService } from '../../feedback/toast.service';
import { RoundViewService } from '../../league/round-view.service';
import { ProfileStore } from '../../profile/profile.store';
import { Icon } from '../../../shared/icon/icon';
import { Loader } from '../../../shared/loader/loader';
import { FixtureRibbon } from '../fixture-ribbon/fixture-ribbon';
import { NotificationsFlag } from '../notifications-flag/notifications-flag';
import { SeasonTimeline } from '../season-timeline/season-timeline';
import { PageData } from './page-data';

/** Application frame: brand bar, navigation, season timeline and the selected round context. */
@Component({
  selector: 'app-shell',
  templateUrl: './shell.html',
  styleUrl: './shell.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    Icon,
    Loader,
    SeasonTimeline,
    NotificationsFlag,
    FixtureRibbon,
  ],
})
export class Shell {
  private readonly router = inject(Router);
  private readonly competition = inject(CompetitionService);
  private readonly selectedRound = inject(SelectedRoundService);
  private readonly profileStore = inject(ProfileStore);
  readonly view = inject(RoundViewService);
  readonly toast = inject(ToastService);

  readonly profile = this.profileStore.profile;
  readonly favouriteTeam = this.profileStore.team;
  readonly initials = this.profileStore.initials;
  readonly rounds = this.competition.rounds;
  readonly currentRound = this.competition.currentRoundId;
  readonly round = this.selectedRound.round;
  readonly retrievedAt = new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(this.competition.retrievedAt));
  readonly nav = [
    { path: '/', label: 'Home', icon: 'home' },
    { path: '/standings', label: 'Standings', icon: 'standings' },
    { path: '/duties', label: 'Duties', icon: 'duties' },
    { path: '/decisions', label: 'Decisions', icon: 'decisions' },
    { path: '/more', label: 'More', icon: 'more' },
  ] as const;
  readonly mobileNav = this.nav.filter((item) => item.path !== '/standings');

  private readonly navigated = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map(() => this.router.url),
    ),
    { initialValue: this.router.url },
  );
  readonly currentUrl = computed(() => this.navigated());
  readonly isHome = computed(() => this.path(this.navigated()) === '/');
  readonly page = computed<PageData>(() => {
    this.navigated();
    let route: ActivatedRouteSnapshot = this.router.routerState.snapshot.root;
    while (route.firstChild) route = route.firstChild;
    return route.data as PageData;
  });

  /** A page change that is still loading after 150 ms. Round changes only update the query. */
  readonly pageLoading = toSignal(
    this.router.events.pipe(
      filter(
        (event: Event) =>
          (event instanceof NavigationStart &&
            this.path(event.url) !== this.path(this.router.url)) ||
          event instanceof NavigationEnd ||
          event instanceof NavigationCancel ||
          event instanceof NavigationError,
      ),
      map((event) => event instanceof NavigationStart),
      debounce((loading) => (loading ? timer(150) : of(0))),
    ),
    { initialValue: false },
  );

  selectRound(id: number): void {
    this.toast.clear();
    this.selectedRound.select(id);
  }

  private path(url: string): string {
    return url.split(/[?#]/)[0];
  }
}
