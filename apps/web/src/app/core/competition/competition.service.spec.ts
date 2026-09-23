import { buildRounds, currentRoundId } from './competition.service';
import { URC_SCHEDULE } from './urc-fixtures';
import { TEAMS } from './teams';

const ROUNDS = buildRounds(currentRoundId(Date.parse('2026-09-01T00:00:00Z')));

describe('published URC schedule', () => {
  it('contains a complete balanced regular season and unconfirmed playoffs', () => {
    expect(URC_SCHEDULE.fixtures.length).toBe(151);
    expect(new Set(URC_SCHEDULE.fixtures.map((m) => m.id)).size).toBe(151);
    for (const round of ROUNDS.slice(0, 18)) expect(round.fixtures.length).toBe(8);
    for (const team of TEAMS) {
      expect(URC_SCHEDULE.fixtures.filter((m) => m.homeId === team.id).length).toBe(9);
      expect(URC_SCHEDULE.fixtures.filter((m) => m.awayId === team.id).length).toBe(9);
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
    expect(currentRoundId(Date.parse('2026-09-01T00:00:00Z'))).toBe(1);
    expect(currentRoundId(Date.parse('2026-09-28T00:00:00Z'))).toBe(2);
    const later = buildRounds(3);
    expect(later.map((r) => r.status).slice(0, 4)).toEqual([
      'Completed',
      'Completed',
      'Current',
      'Upcoming',
    ]);
  });
});
