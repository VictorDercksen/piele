import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  CanActivateFn,
  provideRouter,
  RouterStateSnapshot,
  UrlTree,
} from '@angular/router';
import { AuthService } from '../auth/auth.service';
import { HttpLeagueData, MembershipState } from '../league/http-league-data';
import { LeagueContext } from '../league/league-context';
import { LeagueData } from '../league/league-data';
import { profileMissing, profileRequired } from './profile.guards';
import { Profile } from './profile.store';

const SAVED: Profile = { displayName: 'Trokkie', teamId: 'dhl-stormers', photo: null };

/** Profile guards against the API: the saved profile arrives only after the league loads. */
function setup(options: { signedIn: boolean; saved: Profile | null; member?: boolean }) {
  const profile = signal<Profile | null>(null);
  const league = Object.assign(Object.create(HttpLeagueData.prototype), {
    profile,
    isMember: () => options.member ?? true,
    ensureLoaded: () =>
      new Promise<MembershipState>((resolve) =>
        setTimeout(() => {
          profile.set(options.saved);
          resolve('member');
        }),
      ),
  });
  const auth = {
    configured: true,
    whenReady: () => new Promise<void>((resolve) => setTimeout(resolve)),
    signedIn: () => options.signedIn,
  };
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: AuthService, useValue: auth },
      { provide: LeagueData, useValue: league },
      // The league guard has already chosen Piele.
      {
        provide: LeagueContext,
        useValue: { url: (path = '/') => `/piele${path === '/' ? '' : path}` },
      },
    ],
  });
  return (guard: CanActivateFn) =>
    TestBed.runInInjectionContext(() =>
      guard({} as ActivatedRouteSnapshot, { url: '/piele/duties' } as RouterStateSnapshot),
    ) as Promise<boolean | UrlTree>;
}

describe('profile guards with the league API', () => {
  it('waits for the saved profile instead of sending returning members to onboarding', async () => {
    const run = setup({ signedIn: true, saved: SAVED });
    expect(await run(profileRequired)).toBe(true);
    expect(String(await run(profileMissing))).toBe('/piele');
  });

  it('sends members without a saved team to onboarding', async () => {
    const run = setup({ signedIn: true, saved: null });
    expect(String(await run(profileRequired))).toBe('/piele/welcome?returnUrl=%2Fpiele%2Fduties');
    expect(await run(profileMissing)).toBe(true);
  });

  it('asks no favourite team of the admin in a league it is not a member of', async () => {
    const run = setup({ signedIn: true, saved: null, member: false });
    expect(await run(profileRequired)).toBe(true);
  });

  it('leaves signed-out visitors to the sign-in guard', async () => {
    const run = setup({ signedIn: false, saved: null });
    expect(await run(profileRequired)).toBe(true);
  });
});
