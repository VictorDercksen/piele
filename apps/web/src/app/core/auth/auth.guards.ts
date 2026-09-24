import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { LeagueData } from '../league/league-data';
import { HttpLeagueData } from '../league/http-league-data';
import { AuthService } from './auth.service';

/** Signed-in accounts only. Builds without Supabase Auth (sample data) skip the check. */
export const signedIn: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthService);
  if (!auth.configured) return true;
  await auth.whenReady();
  return (
    auth.signedIn() ||
    inject(Router).createUrlTree(['/sign-in'], { queryParams: { returnUrl: state.url } })
  );
};

/** The sign-in page is only for visitors without a session. */
export const signedOut: CanActivateFn = async () => {
  const auth = inject(AuthService);
  if (!auth.configured) return inject(Router).createUrlTree(['/']);
  await auth.whenReady();
  return !auth.signedIn() || inject(Router).createUrlTree(['/']);
};

/**
 * The account must belong to an active league member. Decided by the API, never the client.
 * An account without a membership goes on to claim its Superbru name.
 */
export const memberRequired: CanActivateFn = async () => {
  const league = inject(LeagueData);
  if (!(league instanceof HttpLeagueData)) return true;
  const state = await league.ensureLoaded();
  return state === 'member' || inject(Router).createUrlTree(['/claim']);
};

/** The claim page is only for signed-in accounts that have not claimed a name yet. */
export const notYetMember: CanActivateFn = async () => {
  const league = inject(LeagueData);
  if (!(league instanceof HttpLeagueData)) return inject(Router).createUrlTree(['/']);
  const state = await league.ensureLoaded();
  return state !== 'member' || inject(Router).createUrlTree(['/']);
};
