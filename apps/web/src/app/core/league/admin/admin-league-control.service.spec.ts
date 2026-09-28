import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AdminLeague, NewLeague } from './admin.models';
import { ApiError } from '../../api/api-error';
import { LeagueContext } from '../league-context';
import { LeagueData } from '../data/league-data';
import { SampleLeagueData } from '../data/sample-league-data';
import { DEFAULT_RULES } from '../superbru';
import { AdminData } from './admin-data';
import { AdminLeagueControlService } from './admin-league-control.service';
import { AdminLeagueService } from './admin-league.service';

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

describe('AdminLeagueControlService', () => {
  function setup() {
    const calls: string[] = [];
    const league = adminLeague();
    const data = {
      create: vi.fn(async () => (calls.push('create'), league)),
      update: vi.fn(async () => (calls.push('update'), league)),
      appointCaptain: vi.fn(async () => (calls.push('appointCaptain'), league)),
      addMe: vi.fn(async () => (calls.push('addMe'), 'm-7')),
    };
    const context = { refreshAccount: vi.fn(async () => void calls.push('refresh')) };
    TestBed.configureTestingModule({
      providers: [
        { provide: AdminData, useValue: data },
        { provide: LeagueContext, useValue: context },
      ],
    });
    return { control: TestBed.inject(AdminLeagueControlService), data, context, calls, league };
  }

  it('creates a league, then refreshes the account', async () => {
    const { control, data, calls, league } = setup();
    await expect(control.create(NEW_LEAGUE)).resolves.toBe(league);
    expect(data.create).toHaveBeenCalledWith(NEW_LEAGUE);
    expect(calls).toEqual(['create', 'refresh']);
  });

  it('updates a league, then refreshes the account', async () => {
    const { control, data, calls } = setup();
    await control.update('l-1', { status: 'archived' });
    expect(data.update).toHaveBeenCalledWith('l-1', { status: 'archived' });
    expect(calls).toEqual(['update', 'refresh']);
  });

  it('appoints a captain, then refreshes the account', async () => {
    const { control, data, calls } = setup();
    await control.appointCaptain('l-1', 'm-2');
    expect(data.appointCaptain).toHaveBeenCalledWith('l-1', 'm-2');
    expect(calls).toEqual(['appointCaptain', 'refresh']);
  });

  it('adds the admin, then refreshes the account', async () => {
    const { control, data, calls } = setup();
    await expect(control.addMe('l-1', 'Vic')).resolves.toBe('m-7');
    expect(data.addMe).toHaveBeenCalledWith('l-1', 'Vic');
    expect(calls).toEqual(['addMe', 'refresh']);
  });

  it('passes a refusal on without refreshing the account', async () => {
    const { control, data, context } = setup();
    const refusal = new ApiError(409, 'slug_taken', 'That slug is taken.');
    data.create.mockRejectedValueOnce(refusal);
    await expect(control.create(NEW_LEAGUE)).rejects.toBe(refusal);
    expect(context.refreshAccount).not.toHaveBeenCalled();
  });
});

describe('AdminLeagueControlService in the sample build', () => {
  let admin: AdminLeagueService;
  let control: AdminLeagueControlService;
  let context: LeagueContext;
  let data: SampleLeagueData;

  beforeEach(async () => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: LeagueData, useClass: SampleLeagueData }],
    });
    admin = TestBed.inject(AdminLeagueService);
    control = TestBed.inject(AdminLeagueControlService);
    context = TestBed.inject(LeagueContext);
    data = TestBed.inject(LeagueData) as SampleLeagueData;
    await context.ensureAccount();
    await admin.load();
  });
  afterEach(() => localStorage.clear());

  it('creates a league that joins the account and opens with the admin as captain', async () => {
    const league = await control.create({ ...NEW_LEAGUE, timezone: 'Africa/Johannesburg' });
    expect(league).toMatchObject({
      slug: 'die-ou-manne',
      status: 'active',
      emblemPreset: 'ball',
      accentColour: '#3f8f6b',
      captain: { displayName: 'Doempie', claimed: true },
      counts: { members: 2, claimed: 1, inSeason: 2, withdrawn: 0 },
    });
    expect(league.myMemberId).not.toBeNull();
    const listed = context.find('die-ou-manne');
    expect(listed).toMatchObject({ name: 'Die Ou Manne', isCaptain: true, emblemPreset: 'ball' });
    expect(await context.select('die-ou-manne')).toBe(true);
    expect(data.captainMemberId()).toBe(data.currentMemberId());
    expect(data.members().map((m) => m.name)).toEqual(['Doempie', 'Kallie']);
    expect(data.feed()[0].title).toBe('The Die Ou Manne is open.');
  });

  it('starts a new league with the rules sent and Piele’s for the rest', async () => {
    const league = await control.create({
      ...NEW_LEAGUE,
      slug: 'own-rules',
      rules: { bonusPointSplit: false, winPoints: { ...DEFAULT_RULES.winPoints, final: 4 } },
    });
    expect(league.rules).toEqual({
      ...DEFAULT_RULES,
      bonusPointSplit: false,
      winPoints: { ...DEFAULT_RULES.winPoints, final: 4 },
    });
    expect(context.find('own-rules')?.rules.bonusPointSplit).toBe(false);
  });

  it('changes a league’s rules through the update and refuses what the rules refuse', async () => {
    const pofadder = admin.leagues().find((l) => l.slug === 'pofadder-bowl')!;
    const updated = await control.update(pofadder.id, { rules: { marginWindow: 3 } });
    expect(updated.rules.marginWindow).toBe(3);
    expect(context.find('pofadder-bowl')?.rules.marginWindow).toBe(3);
    await expect(
      control.update(pofadder.id, { name: 'Renamed', rules: { startingRound: 99 } }),
    ).rejects.toBeInstanceOf(ApiError);
    expect(admin.leagues().find((l) => l.slug === 'pofadder-bowl')?.name).toBe(pofadder.name);
  });

  it('adds the admin outside the season when someone else captains', async () => {
    const league = await control.create({
      ...NEW_LEAGUE,
      slug: 'other-captain',
      captainEmail: 'doempie@example.test',
      addMe: true,
    });
    expect(league.captain).toMatchObject({ displayName: 'Doempie', claimed: false });
    expect(league.counts.members).toBe(3);
    expect(context.find('other-captain')).toMatchObject({ isCaptain: false, inSeason: false });
  });

  it('archives a league out of the switcher and restores it with a feed entry', async () => {
    const pofadder = admin.leagues().find((l) => l.slug === 'pofadder-bowl')!;
    await control.update(pofadder.id, { status: 'archived' });
    expect(context.find('pofadder-bowl')).toBeUndefined();
    expect(admin.leagues().at(-1)).toMatchObject({ slug: 'pofadder-bowl', status: 'archived' });
    expect(await context.select('pofadder-bowl')).toBe(false);

    await control.update(pofadder.id, { status: 'active', name: 'Pofadder Cup' });
    expect(context.find('pofadder-bowl')?.name).toBe('Pofadder Cup');
    await context.select('pofadder-bowl');
    expect(data.feed()[0]).toMatchObject({ kind: 'league_restored', title: 'Pofadder Cup is open again.' });
  });

  it('appoints a claimed member captain and refuses the others', async () => {
    const pofadder = admin.leagues().find((l) => l.slug === 'pofadder-bowl')!;
    await expect(control.appointCaptain(pofadder.id, 'member-rb')).rejects.toMatchObject({
      code: 'not_claimed',
    });
    await expect(control.appointCaptain(pofadder.id, 'member-ds')).rejects.toMatchObject({
      code: 'already_captain',
    });
    const appointed = await control.appointCaptain(pofadder.id, 'member-kk');
    expect(appointed.captain?.displayName).toBe('Kallie');
    await context.select('pofadder-bowl');
    expect(data.captainMemberId()).toBe('member-kk');
    expect(data.feed()[0]).toMatchObject({ kind: 'captain_appointed', title: 'Kallie is captain.' });
    expect((await admin.captainCandidates(pofadder.id)).map((c) => c.displayName)).not.toContain(
      'Riaan',
    );
  });

  it('adds the admin to a league it only viewed', async () => {
    const third = admin.leagues().find((l) => l.slug === 'sample-third')!;
    await control.addMe(third.id);
    expect(admin.leagues().find((l) => l.slug === 'sample-third')?.myMemberId).not.toBeNull();
    expect(context.find('sample-third')).toMatchObject({ inSeason: false });
    await context.select('sample-third');
    expect(data.currentMemberId()).not.toBeNull();
    expect(data.feed()[0].title).toBe('You joined the clubhouse as admin.');
  });
});
