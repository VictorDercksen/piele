import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { LeagueContext } from '../league/league-context';
import { ProfileStore } from './profile.store';

// Route guards run in parallel, so these wait for the saved profile to load instead of
// reading it before the league guard has fetched it. They sit under `/:league`, whose
// `leagueRequired` guard has already chosen the league. Every inject() comes before the
// first await.

/** Sends first-time visitors to the league's onboarding and remembers where they were going. */
export const profileRequired: CanActivateFn = async (_route, state) => {
  const store = inject(ProfileStore);
  const context = inject(LeagueContext);
  const router = inject(Router);
  if (!(await store.whenKnown())) return true;
  return (
    !!store.profile() ||
    router.createUrlTree([context.url('/welcome')], { queryParams: { returnUrl: state.url } })
  );
};

/** Onboarding is only for visitors without a profile in this league. */
export const profileMissing: CanActivateFn = async () => {
  const store = inject(ProfileStore);
  const context = inject(LeagueContext);
  const router = inject(Router);
  if (!(await store.whenKnown())) return true;
  return !store.profile() || router.createUrlTree([context.url()]);
};

/** Accepts only in-app paths so a crafted link cannot redirect elsewhere. */
export function safeReturnUrl(value: unknown, fallback = '/'): string {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//')
    ? value
    : fallback;
}
