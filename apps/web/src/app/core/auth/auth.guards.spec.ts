import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  CanActivateFn,
  provideRouter,
  RouterStateSnapshot,
  UrlTree,
} from '@angular/router';
import { HttpLeagueData, MembershipState } from '../league/http-league-data';
import { LeagueData } from '../league/league-data';
import { memberRequired, notYetMember, signedIn, signedOut } from './auth.guards';
import { AuthService } from './auth.service';

/** Guards as the production build runs them: Supabase configured, API-backed league. */
function setup(options: { signedIn: boolean; membership: MembershipState }) {
  const loads: number[] = [];
  const auth = {
    configured: true,
    // A real macrotask, so the guard continues outside Angular's injection context.
    whenReady: () => new Promise<void>((resolve) => setTimeout(resolve)),
    signedIn: () => options.signedIn,
  };
  const league = Object.assign(Object.create(HttpLeagueData.prototype), {
    ensureLoaded: () => {
      loads.push(1);
      return new Promise<MembershipState>((resolve) =>
        setTimeout(() => resolve(options.membership)),
      );
    },
  });
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: AuthService, useValue: auth },
      { provide: LeagueData, useValue: league },
    ],
  });
  const run = (guard: CanActivateFn) =>
    TestBed.runInInjectionContext(() =>
      guard({} as ActivatedRouteSnapshot, { url: '/duties?round=2' } as RouterStateSnapshot),
    ) as Promise<boolean | UrlTree>;
  return { run, loads };
}

const path = (result: boolean | UrlTree) => (result instanceof UrlTree ? result.toString() : result);

describe('auth guards with Supabase configured', () => {
  it('send a signed-out visitor to sign-in without calling the API', async () => {
    const { run, loads } = setup({ signedIn: false, membership: 'not_member' });
    expect(path(await run(signedIn))).toBe('/sign-in?returnUrl=%2Fduties%3Fround%3D2');
    expect(await run(memberRequired)).toBe(true);
    expect(await run(signedOut)).toBe(true);
    expect(loads).toEqual([]);
  });

  it('send a signed-in account without a name to claim one', async () => {
    const { run } = setup({ signedIn: true, membership: 'not_member' });
    expect(await run(signedIn)).toBe(true);
    expect(path(await run(signedOut))).toBe('/');
    expect(path(await run(memberRequired))).toBe('/claim');
    expect(await run(notYetMember)).toBe(true);
  });

  it('let a member in and keep them off the claim page', async () => {
    const { run } = setup({ signedIn: true, membership: 'member' });
    expect(await run(memberRequired)).toBe(true);
    expect(path(await run(notYetMember))).toBe('/');
  });
});
