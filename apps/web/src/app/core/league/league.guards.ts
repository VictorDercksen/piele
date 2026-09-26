import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../auth/auth.service';
import { LeagueContext } from './league-context';

// These guards only choose where navigation goes; the API decides what an account may see.
// Route guards run in parallel with `signedIn`, so without a session they defer to it
// instead of calling the API. Every inject() comes before the first await.

/** True when the account can be asked for: signed in, or a build without sign-in. */
async function accountAvailable(auth: AuthService): Promise<boolean> {
  if (!auth.configured) return true;
  await auth.whenReady();
  return auth.signedIn();
}

/**
 * `/:league`: the slug must be a league the account lists and the API must let it in.
 * Unknown or refused leagues go to `/`, which opens another one or `/no-league`.
 */
export const leagueRequired: CanActivateFn = async (route) => {
  const context = inject(LeagueContext);
  const auth = inject(AuthService);
  const router = inject(Router);
  if (!(await accountAvailable(auth))) return true;
  if (!(await context.ensureAccount())) return router.createUrlTree(['/no-league']);
  return (await context.select(route.paramMap.get('league') ?? '')) || router.createUrlTree(['/']);
};

/** `/`: the last used league, else the account's league, else `/no-league`. */
export const leagueHome: CanActivateFn = async (route) => {
  const context = inject(LeagueContext);
  const auth = inject(AuthService);
  const router = inject(Router);
  if (!(await accountAvailable(auth))) return true;
  const home = (await context.ensureAccount()) ? context.home() : null;
  return router.createUrlTree(home ? ['/', home.slug] : ['/no-league'], {
    queryParams: route.queryParams,
  });
};

/**
 * Paths from before leagues had slugs (`/standings`, `/match/123`): the same path under the
 * league `/` would open, so old bookmarks keep working.
 */
export const legacyLeaguePath: CanActivateFn = async (_route, state) => {
  const context = inject(LeagueContext);
  const auth = inject(AuthService);
  const router = inject(Router);
  if (!(await accountAvailable(auth))) return true;
  const home = (await context.ensureAccount()) ? context.home() : null;
  return home ? router.parseUrl(`/${home.slug}${state.url}`) : router.createUrlTree(['/no-league']);
};
