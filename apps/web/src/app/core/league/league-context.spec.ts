import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  CanActivateFn,
  convertToParamMap,
  provideRouter,
  RouterStateSnapshot,
  UrlTree,
} from '@angular/router';
import { environment } from '../../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { CompetitionService } from '../competition/competition.service';
import { LeagueTime } from '../competition/league-time';
import { HttpLeagueData } from './http-league-data';
import { LeagueContext } from './league-context';
import { LeagueData } from './league-data';
import { adminOnly, leagueHome, leagueRequired, legacyLeaguePath } from './league.guards';
import { LeagueSummary } from './league.models';

const API = `${environment.apiUrl}/v1`;
const URC = { id: 'urc-2026-27', name: 'United Rugby Championship 2026/27', shortName: 'URC' };

function league(slug: string, name: string, extra: Partial<LeagueSummary> = {}): LeagueSummary {
  return {
    id: `id-${slug}`,
    slug,
    name,
    timezone: 'Africa/Johannesburg',
    emblemPreset: null,
    emblemUrl: null,
    accentColour: null,
    competition: URC,
    seasonName: 'URC 2026/27',
    inSeason: true,
    memberId: `m-${slug}`,
    displayName: 'Vic',
    isCaptain: false,
    favouriteTeamId: 'dhl-stormers',
    ...extra,
  };
}

const PIELE = league('piele', 'Piele', { isCaptain: true });
const POFADDER = league('pofadder-bowl', 'Pofadder Bowl', { timezone: 'Europe/London' });

function account(
  leagues: LeagueSummary[],
  extra: { isAdmin?: boolean; lastLeagueId?: string } = {},
) {
  return { userId: 'u-1', photoUrl: null, isAdmin: false, lastLeagueId: null, leagues, ...extra };
}

function me(summary: LeagueSummary) {
  return {
    leagueId: summary.id,
    slug: summary.slug,
    leagueName: summary.name,
    timezone: summary.timezone,
    emblemPreset: null,
    emblemUrl: null,
    accentColour: null,
    competition: URC,
    seasonName: summary.seasonName,
    inSeason: true,
    memberId: summary.memberId,
    displayName: summary.displayName ?? 'Admin',
    isCaptain: summary.isCaptain,
    isAdmin: false,
    administers: summary.isCaptain,
    favouriteTeamId: summary.favouriteTeamId,
    photoUrl: null,
    notificationsReadAt: null,
    notificationsReadKeys: [],
  };
}

async function settle() {
  for (let i = 0; i < 6; i++) await new Promise((resolve) => setTimeout(resolve));
}

/** The API build: Supabase sign-in configured and a signed-in account. */
function setup() {
  const auth = {
    configured: true,
    whenReady: () => new Promise<void>((resolve) => setTimeout(resolve)),
    signedIn: () => true,
    signOut: () => Promise.resolve(),
    email: () => 'vic@example.test',
  };
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: AuthService, useValue: auth },
      { provide: LeagueData, useExisting: HttpLeagueData },
    ],
  });
  const http = TestBed.inject(HttpTestingController);
  const context = TestBed.inject(LeagueContext);
  const data = TestBed.inject(HttpLeagueData);
  const run = (guard: CanActivateFn, url: string, params: Record<string, string> = {}) =>
    TestBed.runInInjectionContext(() =>
      guard(
        {
          paramMap: convertToParamMap(params),
          queryParams: Object.fromEntries(new URL(url, 'http://x').searchParams),
        } as ActivatedRouteSnapshot,
        { url } as RouterStateSnapshot,
      ),
    ) as Promise<boolean | UrlTree>;
  /** Answers one league's `me` and record requests. */
  function flushLeague(summary: LeagueSummary) {
    const base = `${API}/leagues/${summary.id}`;
    http.expectOne(`${base}/me`).flush(me(summary));
    // The steward's team sheet includes the withdrawn members.
    const members = summary.isCaptain ? '/members?include=withdrawn' : '/members';
    return settle().then(() => {
      for (const path of [members, '/standings', '/duties', '/marks', '/feed?limit=200'])
        http.expectOne(`${base}${path}`).flush([]);
    });
  }
  return { http, context, data, run, flushLeague };
}

const path = (result: boolean | UrlTree) =>
  result instanceof UrlTree ? result.toString() : result;

describe('LeagueContext', () => {
  it('loads the account once and again after a claim', async () => {
    const { http, context } = setup();
    const first = context.ensureAccount();
    const second = context.ensureAccount();
    http.expectOne(`${API}/me`).flush(account([PIELE]));
    expect(await first).toEqual(await second);
    expect(await context.ensureAccount()).toBe(await first);
    http.expectNone(`${API}/me`);

    const again = context.reloadAccount();
    http.expectOne(`${API}/me`).flush(account([PIELE, POFADDER]));
    expect((await again)?.leagues.length).toBe(2);
    expect(context.leagues().map((l) => l.slug)).toEqual(['piele', 'pofadder-bowl']);
  });

  it('opens the last used league, else the first membership, else nothing', async () => {
    const { http, context } = setup();
    const cases: [ReturnType<typeof account>, string | null][] = [
      [account([PIELE, POFADDER], { lastLeagueId: POFADDER.id }), 'pofadder-bowl'],
      [account([PIELE, POFADDER], { lastLeagueId: 'gone' }), 'piele'],
      [account([{ ...PIELE, memberId: null }, POFADDER]), 'pofadder-bowl'],
      [account([]), null],
    ];
    for (const [document, slug] of cases) {
      const loading = context.reloadAccount();
      http.expectOne(`${API}/me`).flush(document);
      await loading;
      expect(context.home()?.slug ?? null).toBe(slug);
    }
  });

  it('opens the first league for the admin without memberships', async () => {
    const { http, context } = setup();
    const loading = context.ensureAccount();
    const unjoined = { memberId: null, displayName: null, favouriteTeamId: null };
    http
      .expectOne(`${API}/me`)
      .flush(
        account([league('a-league', 'A League', unjoined), league('b', 'B', unjoined)], {
          isAdmin: true,
        }),
      );
    await loading;
    expect(context.isAdmin()).toBe(true);
    expect(context.home()?.slug).toBe('a-league');
  });

  it('selects a league: records, competition, zone and the last used league follow it', async () => {
    const { http, context, data, flushLeague } = setup();
    const loading = context.ensureAccount();
    http.expectOne(`${API}/me`).flush(account([PIELE, POFADDER], { lastLeagueId: PIELE.id }));
    await loading;

    const selecting = context.select('pofadder-bowl');
    expect(context.current()?.slug).toBe('pofadder-bowl');
    expect(TestBed.inject(LeagueTime).zone()).toBe('Europe/London');
    expect(TestBed.inject(CompetitionService).current().id).toBe('urc-2026-27');
    expect(data.leagueId()).toBe(POFADDER.id);
    await settle();
    await flushLeague(POFADDER);
    await settle();
    const last = http.expectOne(`${API}/leagues/${POFADDER.id}/me/last`);
    expect(last.request.method).toBe('PUT');
    last.flush(null, { status: 204, statusText: 'No Content' });
    expect(await selecting).toBe(true);
    expect(context.account()?.lastLeagueId).toBe(POFADDER.id);
    expect(context.isMemberOfCurrent()).toBe(true);
    expect(context.url('/duties')).toBe('/pofadder-bowl/duties');
    expect(context.within('/pofadder-bowl/match/1?round=2')).toBe('/match/1');
    expect(context.within('/pofadder-bowl?round=2')).toBe('/');
    expect(context.url('/duties', 'piele')).toBe('/piele/duties');
    http.verify();
  });

  it('shows a saved emblem at once and then reloads the account', async () => {
    const { http, context, flushLeague } = setup();
    const loading = context.ensureAccount();
    http.expectOne(`${API}/me`).flush(account([PIELE, POFADDER], { lastLeagueId: PIELE.id }));
    await loading;
    const selecting = context.select('piele');
    await settle();
    await flushLeague(PIELE);
    expect(await selecting).toBe(true);

    const saving = context.saveAppearance({ emblem: { preset: 'oak' }, accentColour: '#3f8f6b' });
    const put = http.expectOne(`${API}/leagues/${PIELE.id}/appearance`);
    expect(put.request.body).toEqual({ emblemPreset: 'oak', accentColour: '#3f8f6b' });
    put.flush({ ...me(PIELE), emblemPreset: 'oak', accentColour: '#3f8f6b' });
    await saving;
    expect(context.current()).toEqual(
      expect.objectContaining({ emblemPreset: 'oak', emblemUrl: null, accentColour: '#3f8f6b' }),
    );
    expect(context.find('piele')?.emblemPreset).toBe('oak');
    // The account list is read again so every league shows its latest look.
    http
      .expectOne(`${API}/me`)
      .flush(account([{ ...PIELE, emblemPreset: 'oak', accentColour: '#3f8f6b' }, POFADDER]));
    await settle();
    expect(context.current()?.accentColour).toBe('#3f8f6b');
    http.verify();
  });
});

describe('league guards', () => {
  it('send / to the last used league and keep the round', async () => {
    const { http, run } = setup();
    const result = run(leagueHome, '/?round=2');
    await settle();
    http.expectOne(`${API}/me`).flush(account([PIELE, POFADDER], { lastLeagueId: POFADDER.id }));
    expect(path(await result)).toBe('/pofadder-bowl?round=2');
  });

  it('send an account without leagues to /no-league', async () => {
    const { http, run } = setup();
    const result = run(leagueHome, '/');
    await settle();
    http.expectOne(`${API}/me`).flush(account([]));
    expect(path(await result)).toBe('/no-league');
  });

  it('move paths from before league slugs under the league', async () => {
    const { http, run } = setup();
    const result = run(legacyLeaguePath, '/match/292584?round=1');
    await settle();
    http.expectOne(`${API}/me`).flush(account([PIELE]));
    expect(path(await result)).toBe('/piele/match/292584?round=1');
  });

  it('let a member into a listed league', async () => {
    const { http, run, flushLeague } = setup();
    const result = run(leagueRequired, '/piele', { league: 'piele' });
    await settle();
    http.expectOne(`${API}/me`).flush(account([PIELE]));
    await settle();
    await flushLeague(PIELE);
    await settle();
    http.expectOne(`${API}/leagues/${PIELE.id}/me/last`).flush(null);
    expect(await result).toBe(true);
  });

  it('send an unlisted league back to /', async () => {
    const { http, run } = setup();
    const result = run(leagueRequired, '/elsewhere', { league: 'elsewhere' });
    await settle();
    http.expectOne(`${API}/me`).flush(account([PIELE]));
    expect(path(await result)).toBe('/');
  });

  it('send a league the API refuses back to /, which then skips it', async () => {
    const { http, run, context } = setup();
    const result = run(leagueRequired, '/pofadder-bowl', { league: 'pofadder-bowl' });
    await settle();
    http.expectOne(`${API}/me`).flush(account([PIELE, POFADDER], { lastLeagueId: POFADDER.id }));
    await settle();
    http
      .expectOne(`${API}/leagues/${POFADDER.id}/me`)
      .flush(
        { detail: { code: 'not_a_member', message: 'Not a member of this league.' } },
        { status: 403, statusText: 'Forbidden' },
      );
    expect(path(await result)).toBe('/');
    expect(context.home()?.slug).toBe('piele');
  });

  it('let the admin into the management centre', async () => {
    const { http, run } = setup();
    const result = run(adminOnly, '/manage');
    await settle();
    http.expectOne(`${API}/me`).flush(account([PIELE], { isAdmin: true }));
    expect(await result).toBe(true);
  });

  it('send anyone else from the management centre to /', async () => {
    const { http, run } = setup();
    const result = run(adminOnly, '/manage');
    await settle();
    http.expectOne(`${API}/me`).flush(account([PIELE, POFADDER]));
    expect(path(await result)).toBe('/');
  });

  it('send an account that failed to load from the management centre to /', async () => {
    const { http, run } = setup();
    const result = run(adminOnly, '/manage');
    await settle();
    http.expectOne(`${API}/me`).flush(null, { status: 500, statusText: 'Server Error' });
    expect(path(await result)).toBe('/');
  });
});
