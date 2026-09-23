import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { ProfileStore } from './profile.store';

/** Sends first-time visitors to onboarding and remembers where they were going. */
export const profileRequired: CanActivateFn = (_route, state) =>
  !!inject(ProfileStore).profile() ||
  inject(Router).createUrlTree(['/welcome'], { queryParams: { returnUrl: state.url } });

/** Onboarding is only for visitors without a profile. */
export const profileMissing: CanActivateFn = () =>
  !inject(ProfileStore).profile() || inject(Router).createUrlTree(['/']);

/** Accepts only in-app paths so a crafted link cannot redirect elsewhere. */
export function safeReturnUrl(value: unknown): string {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//')
    ? value
    : '/';
}
