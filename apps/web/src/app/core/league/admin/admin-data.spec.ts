import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { environment } from '../../../../environments/environment';
import { AdminLeague, NewLeague } from './admin.models';
import { ApiError } from '../../api/api-error';
import { LeagueData } from '../data/league-data';
import { SampleLeagueData } from '../data/sample-league-data';
import { DEFAULT_RULES } from '../superbru';
import { AdminData, HttpAdminData, SampleAdminData } from './admin-data';

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
  emblemPreset: 'ball',
  accentColour: '#3f8f6b',
  addMe: false,
};

async function settle() {
  for (let i = 0; i < 4; i++) await new Promise((resolve) => setTimeout(resolve));
}

describe('HttpAdminData', () => {
  let http: HttpTestingController;
  let service: AdminData;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        // Not the sample data, so the factory picks the HTTP implementation.
        { provide: LeagueData, useValue: {} },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    service = TestBed.inject(AdminData);
  });
  afterEach(() => http.verify());

  it('is the HTTP implementation outside the sample build', () => {
    expect(service).toBeInstanceOf(HttpAdminData);
  });

  it('creates a league with the body as given and lists it', async () => {
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
  });

  it('sends the rules that differ with a new league and a rules change through PATCH', async () => {
    const creating = service.create({ ...NEW_LEAGUE, rules: { bonusPoint: false, marginWindow: 7 } });
    const create = http.expectOne(ADMIN);
    expect(create.request.body.rules).toEqual({ bonusPoint: false, marginWindow: 7 });
    create.flush(
      adminLeague({ id: 'l-9', rules: { ...DEFAULT_RULES, bonusPoint: false, marginWindow: 7 } }),
    );
    expect((await creating).rules).toMatchObject({ bonusPoint: false, marginWindow: 7 });

    const updating = service.update('l-9', { rules: { grandSlamPoints: 3 } });
    const update = http.expectOne(`${ADMIN}/l-9`);
    expect(update.request.method).toBe('PATCH');
    expect(update.request.body).toEqual({ rules: { grandSlamPoints: 3 } });
    update.flush(adminLeague({ id: 'l-9', rules: { ...DEFAULT_RULES, grandSlamPoints: 3 } }));
    expect((await updating).rules.grandSlamPoints).toBe(3);
  });

  it('fills in the default rules when the API leaves them out', async () => {
    const loading = service.load();
    const { rules: _, ...bare } = adminLeague();
    http.expectOne(ADMIN).flush([bare]);
    await loading;
    expect(service.leagues()[0].rules).toEqual(DEFAULT_RULES);
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

    const named = service.addMe('l-1', 'Vic');
    const second = http.expectOne(`${ADMIN}/l-1/members/me`);
    expect(second.request.body).toEqual({ displayName: 'Vic' });
    second.flush({ memberId: 'm-7' });
    await settle();
    http.expectOne(ADMIN).flush([adminLeague({ myMemberId: 'm-7' })]);
    expect(await named).toBe('m-7');
  });
});

describe('SampleAdminData', () => {
  let service: AdminData;

  beforeEach(async () => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: LeagueData, useClass: SampleLeagueData }],
    });
    service = TestBed.inject(AdminData);
    await service.load();
  });
  afterEach(() => localStorage.clear());

  it('is the sample implementation in the sample build', () => {
    expect(service).toBeInstanceOf(SampleAdminData);
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
});
