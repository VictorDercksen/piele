import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { ProfileStore } from './profile.store';

// Route guards run in parallel, so these wait for the saved profile to load instead of
// reading it before the membership check has fetched it. Every inject() comes before the
// first await.

/** Sends first-time visitors to onboarding and remembers where they were going. */
export const profileRequired: CanActivateFn = async (_route, state) => {
  const store = inject(ProfileStore);
  const router = inject(Router);
  if (!(await store.whenKnown())) return true;
  return (
    !!store.profile() ||
    router.createUrlTree(['/welcome'], { queryParams: { returnUrl: state.url } })
  );
};

/** Onboarding is only for visitors without a profile. */
export const profileMissing: CanActivateFn = async () => {
  const store = inject(ProfileStore);
  const router = inject(Router);
  if (!(await store.whenKnown())) return true;
  return !store.profile() || router.createUrlTree(['/']);
};

/** Accepts only in-app paths so a crafted link cannot redirect elsewhere. */
export function safeReturnUrl(value: unknown): string {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//')
    ? value
    : '/';
}
