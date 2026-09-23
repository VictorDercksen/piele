import { COMPETITION_ROUNDS } from './competition-season';
import { URC_SCHEDULE } from './urc-fixtures';
import { TEAMS } from './teams';
import { isProfile } from './profile/profile-store';

describe('published URC schedule', () => {
  it('contains a complete balanced regular season and unconfirmed playoffs', () => {
    expect(URC_SCHEDULE.fixtures.length).toBe(151);
    expect(new Set(URC_SCHEDULE.fixtures.map((m) => m.id)).size).toBe(151);
    for (const round of COMPETITION_ROUNDS.slice(0, 18)) expect(round.fixtures.length).toBe(8);
    for (const team of TEAMS) {
      expect(URC_SCHEDULE.fixtures.filter((m) => m.homeId === team.id).length).toBe(9);
      expect(URC_SCHEDULE.fixtures.filter((m) => m.awayId === team.id).length).toBe(9);
    }
    expect(COMPETITION_ROUNDS.slice(18).map((r) => r.fixtures.length)).toEqual([4, 2, 1]);
    expect(
      COMPETITION_ROUNDS.slice(18)
        .flatMap((r) => r.fixtures)
        .every((m) => m.time === 'TBC' && m.kickoffUtc === null),
    ).toBe(true);
  });
  it('preserves September amendments and SAST conversion', () => {
    const glasgow = COMPETITION_ROUNDS[1].fixtures.find((m) => m.id === '292599')!;
    expect(glasgow.time).toBe('18:30');
    const zebre = COMPETITION_ROUNDS[14].fixtures.find((m) => m.id === '292703')!;
    expect(zebre.day).toBe('FRI 16 APR');
    expect(zebre.time).toBe('19:30');
    const january = COMPETITION_ROUNDS[9].fixtures.find((m) => m.home === 'Glasgow')!;
    expect(january.time).toBe('21:45');
  });
  it('retains the delayed South African round eight fixtures in February', () => {
    const round = COMPETITION_ROUNDS[7];
    expect(round.fixtures.filter((m) => m.kickoffUtc?.startsWith('2027-02')).length).toBe(2);
    expect(round.dates).toContain('2026');
    expect(round.dates).toContain('2027');
    expect(round.members).toEqual([]);
    expect(round.duties).toEqual([]);
    expect(round.deadline).toBe('Not confirmed by the captain');
  });
});
describe('stored profile validation', () => {
  it('accepts only known teams, bounded names and local JPEG photos', () => {
    const good = { displayName: 'Test Member', teamId: 'dhl-stormers', photo: null };
    expect(isProfile(good)).toBe(true);
    for (const value of [
      null,
      {},
      { ...good, teamId: 'fake' },
      { ...good, displayName: '  ' },
      { ...good, displayName: 'a'.repeat(51) },
      { ...good, photo: 'https://external.test/photo' },
      { ...good, photo: 'data:image/svg+xml;base64,abcd' },
    ])
      expect(isProfile(value)).toBe(false);
  });
});
