import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { LeagueData } from '../league/league-data';
import { HttpLeagueData } from '../league/http-league-data';
import { AuthService } from './auth.service';

// Every inject() happens before the first await: after it Angular has left the injection
// context and inject() throws NG0203.

/** Signed-in accounts only. Builds without Supabase Auth (sample data) skip the check. */
export const signedIn: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (!auth.configured) return true;
  await auth.whenReady();
  return (
    auth.signedIn() || router.createUrlTree(['/sign-in'], { queryParams: { returnUrl: state.url } })
  );
};

/** The sign-in page is only for visitors without a session. */
export const signedOut: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (!auth.configured) return router.createUrlTree(['/']);
  await auth.whenReady();
  return !auth.signedIn() || router.createUrlTree(['/']);
};

/**
 * The account must belong to an active league member. Decided by the API, never the client.
 * An account without a membership goes on to claim its Superbru name. Route guards run in
 * parallel, so without a session this defers to `signedIn` instead of calling the API.
 */
export const memberRequired: CanActivateFn = async () => {
  const league = inject(LeagueData);
  const auth = inject(AuthService);
  const router = inject(Router);
  if (!(league instanceof HttpLeagueData)) return true;
  await auth.whenReady();
  if (!auth.signedIn()) return true;
  const state = await league.ensureLoaded();
  return state === 'member' || router.createUrlTree(['/claim']);
};

/** The claim page is only for signed-in accounts that have not claimed a name yet. */
export const notYetMember: CanActivateFn = async () => {
  const league = inject(LeagueData);
  const auth = inject(AuthService);
  const router = inject(Router);
  if (!(league instanceof HttpLeagueData)) return router.createUrlTree(['/']);
  await auth.whenReady();
  if (!auth.signedIn()) return true;
  const state = await league.ensureLoaded();
  return state !== 'member' || router.createUrlTree(['/']);
};
