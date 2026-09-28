import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { LiveScoresService } from '../../api/live-scores.service';
import { Fixture } from '../../competition/competition.models';
import { CompetitionService } from '../../competition/competition.service';
import { competition } from '../../competition/registry';
import { ProfileStore } from '../../profile/profile.store';
import { LeagueData } from '../data/league-data';
import { SampleLeagueData } from '../data/sample-league-data';
import { LeagueContext } from '../league-context';
import { PickControlService } from '../picks/pick-control.service';
import { RulesService } from '../rules/rules.service';
import { StandingControlService } from './standing-control.service';
import { StandingService } from './standing.service';

const URC = competition('urc-2026-27');
const NOW = '2026-09-27T08:00:00Z';

/** The sample build on a frozen date, with the selected round fixed and optional live scores. */
async function setup(round: number, slug = 'piele', live: Record<string, Partial<Fixture>> = {}) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(Date.parse(NOW));
  localStorage.clear();
  const rounds = URC.buildRounds(round);
  class Frozen extends CompetitionService {
    override get currentRoundId() {
      return round;
    }
    override get rounds() {
      return rounds;
    }
  }
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: LeagueData, useClass: SampleLeagueData },
      { provide: CompetitionService, useClass: Frozen },
      {
        provide: LiveScoresService,
        useValue: {
          clock: signal(Date.parse(NOW)).asReadonly(),
          merge: (fixture: Fixture) => ({ ...fixture, ...live[fixture.id] }),
        },
      },
    ],
  });
  const context = TestBed.inject(LeagueContext);
  await context.ensureAccount();
  await context.select(slug);
  await TestBed.inject(ProfileStore).save({
    displayName: 'Test Member',
    teamId: 'dhl-stormers',
    photo: null,
  });
  return {
    standings: TestBed.inject(StandingService),
    control: TestBed.inject(StandingControlService),
    data: TestBed.inject(LeagueData),
  };
}

describe('StandingService', () => {
  afterEach(() => vi.useRealTimers());

  it('derives the round table with the member first-person and the cap and spoon', async () => {
    const { standings: view } = await setup(1);
    expect(view.roundTable().map((r) => [r.name, r.points, r.rank])).toEqual([
      ['PieterW', 15.5, 1],
      ['Liam', 7.5, 2],
      ['Test Member', 7, 3],
      ['Johan', 5.5, 4],
      ['Arno', 2, 5],
      ['Franco', 1, 6],
    ]);
    const you = view.roundTable().find((r) => r.you)!;
    expect(you).toEqual(expect.objectContaining({ memberId: 'member-me', teamId: 'dhl-stormers' }));
    expect(view.roundTable().every((r) => r.complete && r.override === null)).toBe(true);
    expect(
      view
        .roundTable()
        .filter((r) => r.cap)
        .map((r) => r.name),
    ).toEqual(['PieterW']);
    expect(
      view
        .roundTable()
        .filter((r) => r.spoon)
        .map((r) => r.name),
    ).toEqual(['Franco']);
    expect(view.roundBadges()).toEqual({ cap: ['member-pw'], spoon: ['member-fb'] });
    // The home board and standings page read the same table.
    expect(view.standings().map((s) => [s.memberId, s.rank, s.points, s.you])).toEqual(
      view.roundTable().map((r) => [r.memberId, r.rank, r.points, r.you]),
    );
    expect(view.standings()[0]).toEqual({
      roundId: 1,
      memberId: 'member-pw',
      rank: 1,
      points: 15.5,
      you: false,
      name: 'PieterW',
      photo: null,
      teamId: 'vodacom-bulls',
    });
  });

  it('adds up the season to the selected round with the round’s cap, spoon and the crown', async () => {
    const { standings: view } = await setup(2);
    expect(view.seasonStandings().map((r) => [r.name, r.points, r.rounds, r.rank])).toEqual([
      ['Johan', 25, 2, 1],
      ['PieterW', 21.5, 2, 2],
      ['Liam', 14, 2, 3],
      ['Arno', 10.5, 2, 4],
      ['Test Member', 8, 2, 5],
      ['Franco', 7.5, 2, 6],
    ]);
    const flags = (key: 'cap' | 'spoon' | 'crown') =>
      view
        .seasonStandings()
        .filter((r) => r[key])
        .map((r) => r.memberId);
    expect(flags('cap')).toEqual(['member-jp']);
    expect(flags('spoon')).toEqual(['member-me']);
    expect(flags('crown')).toEqual(['member-jp']);
  });

  it('has no table until a fixture of the round is scored', async () => {
    const { standings: view } = await setup(3);
    await TestBed.inject(PickControlService).recordPicks('292600', [
      { memberId: 'member-jp', side: 'home', margin: 8 },
    ]);
    expect(view.roundTable()).toEqual([]);
    expect(view.standings()).toEqual([]);
    expect(view.roundBadges()).toEqual({ cap: [], spoon: [] });
  });

  it('keeps the cap and spoon back while a fixture of the round is live', async () => {
    const { standings: view } = await setup(2, 'piele', {
      '292592': { state: 'live', score: '10–3', minute: 55 },
    });
    expect(view.roundTable().length).toBeGreaterThan(0);
    expect(view.roundTable().every((r) => !r.complete && !r.cap && !r.spoon)).toBe(true);
    expect(view.roundBadges()).toEqual({ cap: [], spoon: [] });
  });

  it('applies recorded totals as overrides only where they differ from the derived ones', async () => {
    const { standings: view, control } = await setup(1);
    await control.recordStandings(1, [
      { memberId: 'member-pw', points: 15.5 },
      { memberId: 'member-fb', points: 9 },
    ]);
    const row = (id: string) => view.roundTable().find((r) => r.memberId === id)!;
    expect(row('member-pw').override).toBeNull();
    expect(row('member-fb')).toEqual(
      expect.objectContaining({ override: 9, points: 9, derived: 1, rank: 2 }),
    );
    expect(view.roundBadges().spoon).toEqual(['member-as']);
    const desk = new Map(view.derivedVsRecorded().map((d) => [d.memberId, d]));
    expect(desk.get('member-pw')).toEqual(
      expect.objectContaining({ derived: 15.5, recorded: 15.5, differs: false }),
    );
    expect(desk.get('member-fb')).toEqual(
      expect.objectContaining({ derived: 1, recorded: 9, differs: true }),
    );
    expect(desk.get('member-me')).toEqual(
      expect.objectContaining({ name: 'Test Member', you: true, recorded: null, differs: false }),
    );
    await control.clearStanding(1, 'member-fb');
    expect(row('member-fb').points).toBe(1);
  });

  it('leaves members outside the season off the override rows', async () => {
    const { standings: view, data } = await setup(1, 'sample-third');
    const before = view.derivedVsRecorded().map((d) => d.memberId);
    expect(before.length).toBeGreaterThan(0);
    const league = (data as SampleLeagueData)
      .sampleLeagues()
      .find((l) => l.seed.summary.slug === 'sample-third')!;
    expect(league.addAdmin('Admin')).toBe(true);
    expect(data.members().some((m) => !m.inSeason)).toBe(true);
    expect(view.derivedVsRecorded().map((d) => d.memberId)).toEqual(before);
  });

  it('shows a round with only recorded totals', async () => {
    const { standings: view } = await setup(2, 'pofadder-bowl');
    expect(view.standings().map((s) => [s.name, s.points])).toEqual([
      ['Kallie', 15.5],
      ['Test Member', 13],
      ['Doempie', 12],
      ['Sanet', 10],
      ['Thabo', 6.5],
    ]);
    // Every fixture is at full time and every line is recorded: the round is complete.
    expect(view.roundBadges()).toEqual({ cap: ['member-kk'], spoon: ['member-tn'] });
    expect(TestBed.inject(RulesService).rules()).toEqual(
      expect.objectContaining({ previousChampionMemberId: null }),
    );
  });
});
