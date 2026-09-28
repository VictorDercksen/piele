import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { environment } from '../../../../environments/environment';
import { AdminLeague } from './admin.models';
import { LeagueContext } from '../league-context';
import { LeagueData } from '../data/league-data';
import { SampleLeagueData } from '../data/sample-league-data';
import { DEFAULT_RULES } from '../superbru';
import { AdminLeagueService } from './admin-league.service';

const ADMIN = `${environment.apiUrl}/v1/admin/leagues`;

function adminLeague(extra: Partial<AdminLeague> = {}): AdminLeague {
  return {
    id: 'l-1',
    slug: 'piele',
    name: 'Piele',
    timezone: 'Africa/Johannesburg',
    status: 'active',
    emblemPreset: null,
    emblemUrl: null,
    accentColour: null,
    joinCode: 'abc123def456',
    competition: { id: 'urc-2026-27', name: 'United Rugby Championship 2026/27', shortName: 'URC' },
    season: { id: 's-1', name: 'URC 2026/27', status: 'active' },
    captain: { memberId: 'm-1', displayName: 'Vic', claimed: true },
    counts: { members: 6, claimed: 4, inSeason: 6, withdrawn: 0 },
    myMemberId: 'm-1',
    createdAt: '2026-09-18T08:00:00Z',
    rules: DEFAULT_RULES,
    ...extra,
  };
}

describe('AdminLeagueService', () => {
  let http: HttpTestingController;
  let service: AdminLeagueService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: LeagueData, useValue: {} },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    service = TestBed.inject(AdminLeagueService);
  });
  afterEach(() => http.verify());

  it('lists every league, active first then by name', async () => {
    const loading = service.load();
    const request = http.expectOne(ADMIN);
    expect(request.request.method).toBe('GET');
    request.flush([
      adminLeague({ id: 'l-3', name: 'Archived', status: 'archived' }),
      adminLeague({ id: 'l-2', name: 'Pofadder Bowl' }),
      adminLeague({ id: 'l-1', name: 'Piele' }),
    ]);
    await loading;
    expect(service.leagues().map((l) => l.name)).toEqual(['Piele', 'Pofadder Bowl', 'Archived']);
    expect(service.error()).toBeNull();
  });

  it('shows the API’s refusal when the list cannot be loaded', async () => {
    const loading = service.load();
    http
      .expectOne(ADMIN)
      .flush(
        { detail: { code: 'admin_only', message: 'Only the admin can do this.' } },
        { status: 403, statusText: 'Forbidden' },
      );
    await loading;
    expect(service.error()).toBe('Only the admin can do this.');
  });

  it('loads the competitions once', async () => {
    const first = service.competitions();
    const again = service.competitions();
    const request = http.expectOne(`${environment.apiUrl}/v1/competitions`);
    expect(request.request.method).toBe('GET');
    request.flush([
      {
        id: 'urc-2026-27',
        name: 'United Rugby Championship 2026/27',
        shortName: 'URC',
        timezone: 'Africa/Johannesburg',
        regularRounds: 18,
        lastRound: 21,
      },
    ]);
    expect((await first).map((c) => c.id)).toEqual(['urc-2026-27']);
    expect(await again).toBe(await first);
  });

  it('offers the league’s active, claimed members as captains', async () => {
    const loading = service.captainCandidates('l-1');
    http.expectOne(`${environment.apiUrl}/v1/leagues/l-1/members`).flush([
      { id: 'm-1', displayName: 'Vic', fullName: 'Vic', status: 'active', claimed: true, inSeason: true, email: null },
      { id: 'm-2', displayName: 'Riaan', fullName: 'Riaan', status: 'active', claimed: false, inSeason: true, email: null },
      { id: 'm-3', displayName: 'Kallie', fullName: 'Kallie', status: 'active', claimed: true, inSeason: false, email: null },
    ]);
    expect(await loading).toEqual([
      { id: 'm-1', displayName: 'Vic' },
      { id: 'm-3', displayName: 'Kallie' },
    ]);
  });
});

describe('AdminLeagueService in the sample build', () => {
  let service: AdminLeagueService;

  beforeEach(async () => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: LeagueData, useClass: SampleLeagueData }],
    });
    service = TestBed.inject(AdminLeagueService);
    await TestBed.inject(LeagueContext).ensureAccount();
    await service.load();
  });
  afterEach(() => localStorage.clear());

  it('lists the sample leagues in the sample build', () => {
    expect(service.leagues().map((l) => l.slug)).toEqual(['piele', 'pofadder-bowl', 'sample-third']);
    const third = service.leagues()[2];
    expect(third.myMemberId).toBeNull();
    expect(third.captain).toEqual({ memberId: 'member-hm', displayName: 'Hennie', claimed: true });
    expect(third.counts).toEqual({ members: 5, claimed: 4, inSeason: 5, withdrawn: 0 });
  });
});
