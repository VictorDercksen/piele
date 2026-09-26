import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
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
