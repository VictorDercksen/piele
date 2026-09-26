import { TestBed } from '@angular/core/testing';
import { Competition } from './competition.models';
import { CompetitionService, shortSeason } from './competition.service';
import { LeagueTime } from './league-time';
import { competition } from './registry';

const URC = competition('urc-2026-27');
const ROUNDS = URC.buildRounds(URC.currentRoundId(Date.parse('2026-09-01T00:00:00Z')));

describe('published URC schedule', () => {
  it('contains a complete balanced regular season and unconfirmed playoffs', () => {
    expect(URC.fixtures.length).toBe(151);
    expect(new Set(URC.fixtures.map((m) => m.id)).size).toBe(151);
    for (const round of ROUNDS.slice(0, 18)) expect(round.fixtures.length).toBe(8);
    for (const team of URC.teams) {
      expect(URC.fixtures.filter((m) => m.homeId === team.id).length).toBe(9);
      expect(URC.fixtures.filter((m) => m.awayId === team.id).length).toBe(9);
    }
    expect(ROUNDS.slice(18).map((r) => r.fixtures.length)).toEqual([4, 2, 1]);
    expect(
      ROUNDS.slice(18)
        .flatMap((r) => r.fixtures)
        .every((m) => m.time === 'TBC' && m.kickoffUtc === null),
    ).toBe(true);
  });
  it('preserves September amendments and SAST conversion', () => {
    const glasgow = ROUNDS[1].fixtures.find((m) => m.id === '292599')!;
    expect(glasgow.time).toBe('18:30');
    const zebre = ROUNDS[14].fixtures.find((m) => m.id === '292703')!;
    expect(zebre.day).toBe('FRI 16 APR');
    expect(zebre.time).toBe('19:30');
    const january = ROUNDS[9].fixtures.find((m) => m.home === 'Glasgow')!;
    expect(january.time).toBe('21:45');
  });
  it('retains the delayed South African round eight fixtures in February', () => {
    const round = ROUNDS[7];
    expect(round.fixtures.filter((m) => m.kickoffUtc?.startsWith('2027-02')).length).toBe(2);
    expect(round.dates).toContain('2026');
    expect(round.dates).toContain('2027');
  });
  it('derives the current round from the next kickoff', () => {
    expect(URC.currentRoundId(Date.parse('2026-09-01T00:00:00Z'))).toBe(1);
    expect(URC.currentRoundId(Date.parse('2026-09-28T00:00:00Z'))).toBe(2);
    // Round one's last kickoff is 26 Sep 18:45 UTC; it stays current while that match runs.
    expect(URC.currentRoundId(Date.parse('2026-09-26T19:30:00Z'))).toBe(1);
    expect(URC.currentRoundId(Date.parse('2026-09-26T20:50:00Z'))).toBe(2);
    const later = URC.buildRounds(3);
    expect(later.map((r) => r.status).slice(0, 4)).toEqual([
      'Completed',
      'Completed',
      'Current',
      'Upcoming',
    ]);
  });
});

describe('CompetitionService', () => {
  it('reads the URC until a league names another competition', () => {
    const service = TestBed.inject(CompetitionService);
    expect(service.id).toBe('urc-2026-27');
    expect(service.shortName).toBe('URC');
    expect(service.season).toBe('2026/27');
    expect(service.rounds).toHaveLength(21);
    expect(service.fixtureCount).toBe(144);
    expect(service.playoffSlots).toBe(7);
    expect(service.round(19)?.code).toBe('QF');
    expect(service.locate('292599')?.round.id).toBe(2);
    expect(service.locate('missing')).toBeUndefined();
  });

  it('follows the current competition and the display zone', () => {
    const service = TestBed.inject(CompetitionService);
    const time = TestBed.inject(LeagueTime);
    const glasgow = () => service.locate('292599')!.fixture;
    expect(glasgow().time).toBe('18:30');
    time.zone.set('Europe/London');
    expect(glasgow().time).toBe('17:30');

    const cup: Competition = Object.assign(Object.create(URC) as Competition, {
      id: 'cup',
      shortName: 'CUP',
      season: '2027',
    });
    service.current.set(cup);
    expect(service.id).toBe('cup');
    expect(service.shortName).toBe('CUP');
  });

  it('shortens the season label', () => {
    expect(shortSeason('2026/27')).toBe('26/27');
    expect(shortSeason('2026/27', ' / ')).toBe('26 / 27');
  });
});
