import { Injectable, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  ActivatedRouteSnapshot,
  NavigationEnd,
  NavigationStart,
  Route,
  Router,
} from '@angular/router';
import { LeagueContext } from '../../league/league-context';
import { Crumb, PageData } from './page-data';

/** Navigation state set by the navigation bars: their pages start a fresh trail. */
export const FROM_NAV_BAR = { breadcrumbs: 'reset' } as const;

interface Visit {
  readonly route: Route | null;
  readonly league: string | null;
  readonly crumb: Crumb;
  readonly trail: readonly Crumb[];
}

/**
 * The pages that led to the current one, for the shell's breadcrumb.
 *
 * Main pages (those without a `parent`) have no trail. Any other page continues the trail
 * of the page it was opened from, and opening a page already in the trail cuts it back to
 * there. A page opened directly, from a navigation bar or in another league falls back to
 * its `parent`. Browser back and forward restore the trail each history entry had; pages
 * outside the shell (the profile) leave it as it was.
 */
@Injectable({ providedIn: 'root' })
export class Breadcrumbs {
  private readonly router = inject(Router);
  private readonly context = inject(LeagueContext);
  private readonly trailState = signal<readonly Crumb[]>([]);
  /** The pages before the current one, oldest first. */
  readonly trail = this.trailState.asReadonly();

  /** Each history entry's page and trail, by the id of the navigation that made it. */
  private readonly entries = new Map<number, Pick<Visit, 'crumb' | 'trail'>>();
  private last: Visit | null = null;

  constructor() {
    let restored: number | undefined;
    this.router.events.pipe(takeUntilDestroyed()).subscribe((event) => {
      if (event instanceof NavigationStart) restored = event.restoredState?.navigationId;
      else if (event instanceof NavigationEnd) this.arrive(event.id, restored);
    });
    if (this.router.navigated) this.arrive(null, undefined);
  }

  private arrive(id: number | null, restored: number | undefined): void {
    let leaf: ActivatedRouteSnapshot = this.router.routerState.snapshot.root;
    while (leaf.firstChild) leaf = leaf.firstChild;
    const page = leaf.data as Partial<PageData>;
    if (!page.label) return;

    const league = this.context.slug();
    const path = this.context.within(this.router.url);
    const fromNavBar =
      this.router.currentNavigation()?.extras.state?.['breadcrumbs'] === FROM_NAV_BAR.breadcrumbs;
    // Ids restart after a reload, so an entry only counts for the same page.
    const entry = restored === undefined ? undefined : this.entries.get(restored);
    const trail =
      entry?.crumb.path === path
        ? entry.trail
        : this.trailTo(leaf.routeConfig, page, path, league, fromNavBar);

    const crumb = { label: page.label, path };
    if (id !== null) this.entries.set(id, { crumb, trail });
    this.last = { route: leaf.routeConfig, league, crumb, trail };
    this.trailState.set(trail);
  }

  private trailTo(
    route: Route | null,
    page: Partial<PageData>,
    path: string,
    league: string | null,
    fromNavBar: boolean,
  ): readonly Crumb[] {
    const last = this.last;
    if (!page.parent || fromNavBar) return [];
    if (!last || last.league !== league) return [page.parent];
    // Another fixture or round of the same page.
    if (last.route === route) return last.trail;
    const earlier = last.trail.findIndex((crumb) => crumb.path === path);
    if (earlier >= 0) return last.trail.slice(0, earlier);
    return [...last.trail, last.crumb];
  }
}
