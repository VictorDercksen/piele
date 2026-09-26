import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { environment } from '../../../environments/environment';
import { AdminLeague, NewLeague } from './admin.models';
import { AdminService, HttpAdminService, SampleAdminService } from './admin.service';
import { ApiError } from './http-league-data';
import { LeagueContext } from './league-context';
import { LeagueData } from './league-data';
import { SampleLeagueData } from './sample-league-data';

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
    ...extra,
  };
}

const NEW_LEAGUE: NewLeague = {
  name: 'Die Ou Manne',
  slug: 'die-ou-manne',
  timezone: 'Europe/London',
  competitionId: 'urc-2026-27',
  seasonName: 'URC 2026/27',
  members: [
    { fullName: 'Steyn, Doempie', displayName: 'Doempie' },
    { fullName: 'Kallie Kruger', displayName: 'Kallie' },
  ],
  captainDisplayName: 'Doempie',
  captainEmail: null,
  emblemPreset: 'oak',
  accentColour: '#3f8f6b',
  addMe: false,
};

async function settle() {
  for (let i = 0; i < 4; i++) await new Promise((resolve) => setTimeout(resolve));
}

describe('HttpAdminService', () => {
  let http: HttpTestingController;
  let service: AdminService;
  let refreshes: number;

  beforeEach(() => {
    refreshes = 0;
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        // Not the sample data, so the factory picks the HTTP implementation.
        { provide: LeagueData, useValue: {} },
        { provide: LeagueContext, useValue: { refreshAccount: () => Promise.resolve(void refreshes++) } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    service = TestBed.inject(AdminService);
  });
  afterEach(() => http.verify());

  it('is the HTTP implementation outside the sample build', () => {
    expect(service).toBeInstanceOf(HttpAdminService);
  });

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

  it('creates a league with the body as given and refreshes the account', async () => {
    const creating = service.create(NEW_LEAGUE);
    const request = http.expectOne(ADMIN);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual(NEW_LEAGUE);
    request.flush(adminLeague({ id: 'l-9', slug: 'die-ou-manne', name: 'Die Ou Manne' }), {
      status: 201,
      statusText: 'Created',
    });
    const league = await creating;
    expect(league.slug).toBe('die-ou-manne');
    expect(service.leagues().map((l) => l.id)).toEqual(['l-9']);
    expect(refreshes).toBe(1);
  });

  it('passes a creation refusal on with its code', async () => {
    const creating = service.create(NEW_LEAGUE);
    http
      .expectOne(ADMIN)
      .flush(
        { detail: { code: 'slug_taken', message: 'That slug is taken.' } },
        { status: 409, statusText: 'Conflict' },
      );
    await expect(creating).rejects.toMatchObject({ status: 409, code: 'slug_taken' });
    await expect(creating).rejects.toBeInstanceOf(ApiError);
    expect(refreshes).toBe(0);
  });

  it('renames, archives and restores through PATCH', async () => {
    const renaming = service.update('l-1', { name: 'Piele XV', timezone: 'Europe/Dublin' });
    const rename = http.expectOne(`${ADMIN}/l-1`);
    expect(rename.request.method).toBe('PATCH');
    expect(rename.request.body).toEqual({ name: 'Piele XV', timezone: 'Europe/Dublin' });
    rename.flush(adminLeague({ name: 'Piele XV', timezone: 'Europe/Dublin' }));
    await renaming;

    const archiving = service.update('l-1', { status: 'archived' });
    const archive = http.expectOne(`${ADMIN}/l-1`);
    expect(archive.request.body).toEqual({ status: 'archived' });
    archive.flush(adminLeague({ status: 'archived' }));
    await archiving;
    expect(service.leagues()[0].status).toBe('archived');
    expect(refreshes).toBe(2);
  });

  it('appoints a captain with the membership id', async () => {
    const appointing = service.appointCaptain('l-1', 'm-2');
    const request = http.expectOne(`${ADMIN}/l-1/captain`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ membershipId: 'm-2' });
    request.flush(adminLeague({ captain: { memberId: 'm-2', displayName: 'Kallie', claimed: true } }));
    expect((await appointing).captain?.memberId).toBe('m-2');
  });

  it('adds the admin with or without a name, then reloads the list', async () => {
    const adding = service.addMe('l-1');
    const request = http.expectOne(`${ADMIN}/l-1/members/me`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({});
    request.flush({ memberId: 'm-7' }, { status: 201, statusText: 'Created' });
    await settle();
    http.expectOne(ADMIN).flush([adminLeague({ myMemberId: 'm-7' })]);
    expect(await adding).toBe('m-7');
    expect(service.leagues()[0].myMemberId).toBe('m-7');
    expect(refreshes).toBe(1);

    const named = service.addMe('l-1', 'Vic');
    const second = http.expectOne(`${ADMIN}/l-1/members/me`);
    expect(second.request.body).toEqual({ displayName: 'Vic' });
    second.flush({ memberId: 'm-7' });
    await settle();
    http.expectOne(ADMIN).flush([adminLeague({ myMemberId: 'm-7' })]);
    expect(await named).toBe('m-7');
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

describe('SampleAdminService', () => {
  let service: AdminService;
  let context: LeagueContext;
  let data: SampleLeagueData;

  beforeEach(async () => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: LeagueData, useClass: SampleLeagueData }],
    });
    service = TestBed.inject(AdminService);
    context = TestBed.inject(LeagueContext);
    data = TestBed.inject(LeagueData) as SampleLeagueData;
    await context.ensureAccount();
    await service.load();
  });
  afterEach(() => localStorage.clear());

  it('is the sample implementation in the sample build and lists the sample leagues', () => {
    expect(service).toBeInstanceOf(SampleAdminService);
    expect(service.leagues().map((l) => l.slug)).toEqual(['piele', 'pofadder-bowl', 'sample-third']);
    const third = service.leagues()[2];
    expect(third.myMemberId).toBeNull();
    expect(third.captain).toEqual({ memberId: 'member-hm', displayName: 'Hennie', claimed: true });
    expect(third.counts).toEqual({ members: 5, claimed: 4, inSeason: 5, withdrawn: 0 });
  });

  it('creates a league that joins the account and opens with the admin as captain', async () => {
    const league = await service.create({ ...NEW_LEAGUE, timezone: 'Africa/Johannesburg' });
    expect(league).toMatchObject({
      slug: 'die-ou-manne',
      status: 'active',
      emblemPreset: 'oak',
      accentColour: '#3f8f6b',
      captain: { displayName: 'Doempie', claimed: true },
      counts: { members: 2, claimed: 1, inSeason: 2, withdrawn: 0 },
    });
    expect(league.myMemberId).not.toBeNull();
    const listed = context.find('die-ou-manne');
    expect(listed).toMatchObject({ name: 'Die Ou Manne', isCaptain: true, emblemPreset: 'oak' });
    expect(await context.select('die-ou-manne')).toBe(true);
    expect(data.captainMemberId()).toBe(data.currentMemberId());
    expect(data.members().map((m) => m.name)).toEqual(['Doempie', 'Kallie']);
    expect(data.feed()[0].title).toBe('The Die Ou Manne is open.');
  });

  it('adds the admin outside the season when someone else captains', async () => {
    const league = await service.create({
      ...NEW_LEAGUE,
      slug: 'other-captain',
      captainEmail: 'doempie@example.test',
      addMe: true,
    });
    expect(league.captain).toMatchObject({ displayName: 'Doempie', claimed: false });
    expect(league.counts.members).toBe(3);
    expect(context.find('other-captain')).toMatchObject({ isCaptain: false, inSeason: false });
  });

  it('refuses what the API refuses', async () => {
    await expect(service.create({ ...NEW_LEAGUE, slug: 'piele' })).rejects.toMatchObject({
      code: 'slug_taken',
    });
    await expect(service.create({ ...NEW_LEAGUE, slug: 'manage' })).rejects.toMatchObject({
      code: 'invalid_slug',
    });
    await expect(
      service.create({ ...NEW_LEAGUE, captainDisplayName: 'Nobody' }),
    ).rejects.toMatchObject({ code: 'unknown_captain' });
    await expect(
      service.create({ ...NEW_LEAGUE, members: [...NEW_LEAGUE.members, NEW_LEAGUE.members[0]] }),
    ).rejects.toMatchObject({ code: 'duplicate_member' });
    await expect(service.create({ ...NEW_LEAGUE, timezone: 'Mars/Olympus' })).rejects.toMatchObject({
      code: 'invalid_timezone',
    });
  });

  it('archives a league out of the switcher and restores it with a feed entry', async () => {
    const pofadder = service.leagues().find((l) => l.slug === 'pofadder-bowl')!;
    await service.update(pofadder.id, { status: 'archived' });
    expect(context.find('pofadder-bowl')).toBeUndefined();
    expect(service.leagues().at(-1)).toMatchObject({ slug: 'pofadder-bowl', status: 'archived' });
    expect(await context.select('pofadder-bowl')).toBe(false);

    await service.update(pofadder.id, { status: 'active', name: 'Pofadder Cup' });
    expect(context.find('pofadder-bowl')?.name).toBe('Pofadder Cup');
    await context.select('pofadder-bowl');
    expect(data.feed()[0]).toMatchObject({ kind: 'league_restored', title: 'Pofadder Cup is open again.' });
  });

  it('appoints a claimed member captain and refuses the others', async () => {
    const pofadder = service.leagues().find((l) => l.slug === 'pofadder-bowl')!;
    await expect(service.appointCaptain(pofadder.id, 'member-rb')).rejects.toMatchObject({
      code: 'not_claimed',
    });
    await expect(service.appointCaptain(pofadder.id, 'member-ds')).rejects.toMatchObject({
      code: 'already_captain',
    });
    const appointed = await service.appointCaptain(pofadder.id, 'member-kk');
    expect(appointed.captain?.displayName).toBe('Kallie');
    await context.select('pofadder-bowl');
    expect(data.captainMemberId()).toBe('member-kk');
    expect(data.feed()[0]).toMatchObject({ kind: 'captain_appointed', title: 'Kallie is captain.' });
    expect((await service.captainCandidates(pofadder.id)).map((c) => c.displayName)).not.toContain(
      'Riaan',
    );
  });

  it('adds the admin to a league it only viewed', async () => {
    const third = service.leagues().find((l) => l.slug === 'sample-third')!;
    await service.addMe(third.id);
    expect(service.leagues().find((l) => l.slug === 'sample-third')?.myMemberId).not.toBeNull();
    expect(context.find('sample-third')).toMatchObject({ inSeason: false });
    await context.select('sample-third');
    expect(data.currentMemberId()).not.toBeNull();
    expect(data.feed()[0].title).toBe('You joined the clubhouse as admin.');
  });
});
