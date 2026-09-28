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
import { PickControlService } from './pick-control.service';
import { PickService } from './pick.service';

const URC = competition('urc-2026-27');
const NOW = '2026-09-27T08:00:00Z';

/** The sample build on a frozen date, with the selected round fixed and optional live scores. */
async function setup(round: number, live: Record<string, Partial<Fixture>> = {}) {
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
  await context.select('piele');
  await TestBed.inject(ProfileStore).save({
    displayName: 'Test Member',
    teamId: 'dhl-stormers',
    photo: null,
  });
  return { picks: TestBed.inject(PickService), control: TestBed.inject(PickControlService) };
}

describe('PickService', () => {
  afterEach(() => vi.useRealTimers());

  it('shows a fixture’s picks from home to away with clubs, points, sway and place', async () => {
    const { picks: service } = await setup(1);
    const picks = service.picksFor('292584')!;
    expect(picks).toEqual(
      expect.objectContaining({
        locked: true,
        final: true,
        provisional: false,
        void: false,
        recorded: true,
        hidden: false,
        result: { homeScore: 20, awayScore: 20, state: 'full_time' },
        sway: { home: 83, draw: 0, away: 17 },
        myPlace: 3,
      }),
    );
    expect(picks.myPick).toEqual(service.myPickFor('292584'));
    expect(picks.rows.map((r) => [r.name, r.side, r.margin, r.points])).toEqual([
      ['Franco', 'home', 12, 0],
      ['Test Member', 'home', 10, 0],
      ['Johan', 'home', 7, 0],
      ['Arno', 'home', 5, 0],
      ['PieterW', 'home', 3, 0.5],
      ['Liam', 'away', 3, 0.5],
    ]);
    expect(picks.rows[0]).toEqual(
      expect.objectContaining({
        clubId: 'benetton-rugby',
        clubShortName: 'Benetton',
        clubColour: '#176c43',
      }),
    );
    expect(picks.rows[5]).toEqual(
      expect.objectContaining({ clubShortName: 'Dragons', you: false }),
    );
    expect(picks.rows[3]).toEqual(expect.objectContaining({ isDefault: true, distance: null }));
    expect(service.picksFor('unknown')).toBeNull();
    expect(service.byFixture().get('292584')?.myPick).toEqual(picks.myPick);
  });

  it('hides the pool’s picks until the member picks, before kickoff', async () => {
    const { picks: service, control } = await setup(3);
    await control.recordPicks('292600', [{ memberId: 'member-jp', side: 'home', margin: 8 }]);
    expect(service.picksFor('292600')).toEqual(
      expect.objectContaining({
        locked: false,
        hidden: true,
        recorded: false,
        rows: [],
        myPick: null,
      }),
    );
    expect(service.myPickFor('292600')).toBeNull();
    await control.savePick('292600', { side: 'away', margin: 5 });
    const picks = service.picksFor('292600')!;
    expect(picks).toEqual(
      expect.objectContaining({ hidden: false, recorded: true, myPlace: null }),
    );
    expect(picks.rows.map((r) => [r.name, r.clubShortName, r.scored])).toEqual([
      ['Johan', 'Glasgow', false],
      ['Test Member', 'Connacht', false],
    ]);
  });

  it('scores the selected round provisionally from live scores', async () => {
    const { picks: service } = await setup(2, {
      '292592': { state: 'live', score: '10–3', minute: 55 },
    });
    expect(service.picksFor('292592')).toEqual(
      expect.objectContaining({
        provisional: true,
        final: false,
        result: { homeScore: 10, awayScore: 3, state: 'live' },
      }),
    );
  });
});
