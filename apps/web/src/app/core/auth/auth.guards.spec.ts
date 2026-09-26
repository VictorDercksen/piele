import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  CanActivateFn,
  provideRouter,
  RouterStateSnapshot,
  UrlTree,
} from '@angular/router';
import { signedIn, signedOut } from './auth.guards';
import { AuthService } from './auth.service';

/** Guards as the production build runs them: Supabase configured. */
function setup(options: { signedIn: boolean }) {
  const auth = {
    configured: true,
    // A real macrotask, so the guard continues outside Angular's injection context.
    whenReady: () => new Promise<void>((resolve) => setTimeout(resolve)),
    signedIn: () => options.signedIn,
  };
  TestBed.configureTestingModule({
    providers: [provideRouter([]), { provide: AuthService, useValue: auth }],
  });
  return (guard: CanActivateFn) =>
    TestBed.runInInjectionContext(() =>
      guard({} as ActivatedRouteSnapshot, { url: '/piele/duties?round=2' } as RouterStateSnapshot),
    ) as Promise<boolean | UrlTree>;
}

const path = (result: boolean | UrlTree) =>
  result instanceof UrlTree ? result.toString() : result;

describe('auth guards with Supabase configured', () => {
  it('send a signed-out visitor to sign-in and back', async () => {
    const run = setup({ signedIn: false });
    expect(path(await run(signedIn))).toBe('/sign-in?returnUrl=%2Fpiele%2Fduties%3Fround%3D2');
    expect(await run(signedOut)).toBe(true);
  });

  it('keep a signed-in account off the sign-in page', async () => {
    const run = setup({ signedIn: true });
    expect(await run(signedIn)).toBe(true);
    expect(path(await run(signedOut))).toBe('/');
  });
});
