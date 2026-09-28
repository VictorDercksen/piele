import { HlmButton } from '@spartan-ng/helm/button';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  effect,
  inject,
  untracked,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
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
import { CompetitionService, shortSeason } from '../../competition/competition.service';
import { FixtureService } from '../../competition/fixture.service';
import { SelectedRoundService } from '../../competition/selected-round.service';
import { AlertService } from '../../feedback/alert.service';
import { LayoutInsets } from '../../feedback/layout-insets';
import { LeagueContext } from '../../league/league-context';
import { LeaguePathPipe } from '../../league/league-path.pipe';
import { LeagueRecordsService } from '../../league/league-records.service';
import { MemberService } from '../../league/members/member.service';
import { PollService } from '../../league/polls/poll.service';
import { ProfileStore } from '../../profile/profile.store';
import { Icon } from '../../../shared/icon/icon';
import { BallLoader } from '../../../shared/ball-loader/ball-loader';
import { StadiumBackdrop } from '../../../shared/stadium-backdrop/stadium-backdrop';
import { FixtureRibbon } from '../fixture-ribbon/fixture-ribbon';
import { LeagueSwitcher } from '../league-switcher/league-switcher';
import { NotificationsFlag } from '../notifications-flag/notifications-flag';
import { SeasonTimeline } from '../season-timeline/season-timeline';
import { RoundPicker } from '../round-picker/round-picker';
import { Breadcrumbs, FROM_NAV_BAR } from './breadcrumbs';
import { PageData } from './page-data';

/** The key of the red card shown while the league's records fail to load. */
const LEAGUE_LOAD_ALERT = 'league-load';

/** Application frame: brand bar, navigation, season timeline and the selected round context. */
@Component({
  selector: 'app-shell',
  templateUrl: './shell.html',
  styleUrl: './shell.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  /* prettier-ignore */
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    Icon,
    BallLoader,
    SeasonTimeline,
    RoundPicker,
    NotificationsFlag,
    FixtureRibbon,
    StadiumBackdrop,
    LeagueSwitcher,
    LeaguePathPipe,
    HlmButton,
  ],
})
export class Shell {
  private readonly router = inject(Router);
  private readonly competition = inject(CompetitionService);
  private readonly selectedRound = inject(SelectedRoundService);
  private readonly profileStore = inject(ProfileStore);
  private readonly context = inject(LeagueContext);
  private readonly alerts = inject(AlertService);
  private readonly insets = inject(LayoutInsets);
  readonly fixtures = inject(FixtureService);
  readonly records = inject(LeagueRecordsService);
  readonly members = inject(MemberService);
  readonly polls = inject(PollService);

  readonly profile = this.profileStore.profile;
  readonly favouriteTeam = this.profileStore.team;
  readonly initials = this.profileStore.initials;
  readonly rounds = computed(() => this.competition.rounds);
  readonly currentRound = computed(() => this.competition.currentRoundId);
  readonly round = this.selectedRound.round;
  /** `26 / 27`. */
  readonly season = computed(() => shortSeason(this.competition.season, ' / '));
  readonly emblem = computed(() => this.competition.current().emblem);
  readonly competitionName = computed(() => this.competition.current().name);
  readonly regularRounds = computed(() => this.competition.regularRounds);
  /** The admin in a league it holds no membership in. */
  readonly adminView = computed(
    () => !!this.context.current() && !this.context.isMemberOfCurrent(),
  );
  readonly nav = [
    { path: '/', label: 'Home', icon: 'home' },
    { path: '/standings', label: 'Standings', icon: 'standings' },
    { path: '/duties', label: 'Duties', icon: 'duties' },
    { path: '/decisions', label: 'Decisions', icon: 'decisions' },
    { path: '/more', label: 'More', icon: 'more' },
  ] as const;
  readonly mobileNav = this.nav.filter((item) => item.path !== '/standings');
  readonly navState = FROM_NAV_BAR;
  /** The pages before this one, linked in the breadcrumb. */
  readonly trail = inject(Breadcrumbs).trail;

  private readonly navigated = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map(() => this.router.url),
    ),
    { initialValue: this.router.url },
  );
  readonly currentUrl = computed(() => this.navigated());
  /** The path inside the league: `/piele/match/1` is `/match/1`. */
  private readonly leaguePath = computed(() => this.context.within(this.navigated()));
  readonly isHome = computed(() => this.leaguePath() === '/');
  readonly isMatch = computed(() => this.leaguePath().startsWith('/match/'));
  /** The fixture ribbon features or opens a match, so it only shows where that happens. */
  readonly showRibbon = computed(() => this.isHome() || this.isMatch());
  readonly pageBackground = computed(() => {
    const path = this.leaguePath();
    const stadiums = this.competition.current().stadiums;
    if (path === '/') return stadiums.background(this.fixtures.featured()?.venue);
    if (path.startsWith('/match/')) {
      const fixture = this.competition.locate(path.slice('/match/'.length))?.fixture;
      return stadiums.background(fixture?.venue);
    }
    return this.favouriteTeam()?.stadiumBackground;
  });
  readonly page = computed<PageData>(() => {
    this.navigated();
    let route: ActivatedRouteSnapshot = this.router.routerState.snapshot.root;
    while (route.firstChild) route = route.firstChild;
    return route.data as PageData;
  });

  private readonly league = viewChild.required<ElementRef<HTMLElement>>('league');
  private readonly topBar = viewChild.required<ElementRef<HTMLElement>>('topBar');
  private readonly roundBar = viewChild.required<ElementRef<HTMLElement>>('roundBar');
  private readonly main = viewChild.required<ElementRef<HTMLElement>>('main');
  private readonly navBar = viewChild.required<ElementRef<HTMLElement>>('navBar');

  constructor() {
    // Open dropdowns pin their heading under the top bar and the round header; both change
    // height (the breakpoint, the fixture ribbon sliding), so the offset follows them. The
    // fixed bottom navigation's height pads the grid the same way.
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      if (typeof ResizeObserver === 'undefined') return;
      const bars = [this.topBar().nativeElement, this.roundBar().nativeElement];
      const nav = this.navBar().nativeElement;
      const main = this.main().nativeElement;
      const league = this.league().nativeElement;
      const observer = new ResizeObserver(() => {
        const offset = bars.reduce((sum, bar) => sum + bar.offsetHeight, 0);
        main.style.setProperty('--sticky-offset', `${offset}px`);
        const bottomGap = nav.offsetHeight ? parseFloat(getComputedStyle(nav).bottom) || 0 : 0;
        const navInset = nav.offsetHeight + bottomGap;
        league.style.setProperty('--nav-height', `${navInset}px`);
        this.insets.bottom.set(navInset);
      });
      [...bars, nav].forEach((element) => observer.observe(element));
      destroyRef.onDestroy(() => observer.disconnect());
    });
    // The league's records failed to load: a red card with a retry until they arrive.
    effect(() => {
      const message = this.records.error();
      untracked(() => {
        if (message) {
          this.alerts.error(message, {
            key: LEAGUE_LOAD_ALERT,
            action: { label: 'Retry', run: () => this.records.reload() },
          });
        } else {
          this.alerts.dismissKey(LEAGUE_LOAD_ALERT);
        }
      });
    });
    destroyRef.onDestroy(() => {
      this.insets.bottom.set(0);
      this.alerts.dismissKey(LEAGUE_LOAD_ALERT);
    });
    // Another page starts at the top. The scroll happens now, while the page that is leaving
    // still fills the document: scrolling once a shorter page is in would leave the document
    // ending above the viewport, which iOS then animates back into range.
    this.router.events
      .pipe(
        filter((event): event is NavigationStart => event instanceof NavigationStart),
        takeUntilDestroyed(),
      )
      .subscribe({
        next: (event) => {
          if (
            event.navigationTrigger !== 'popstate' &&
            this.path(event.url) !== this.path(this.router.url) &&
            scrollY > 0
          ) {
            scrollTo(0, 0);
          }
        },
      });
  }

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
    this.selectedRound.select(id);
  }

  private path(url: string): string {
    return url.split(/[?#]/)[0];
  }
}
