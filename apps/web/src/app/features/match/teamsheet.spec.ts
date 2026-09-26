import { Teamsheet, TeamsheetPlayer } from '../../core/api/match-centre.models';
import { ageOn, averageAge, sheetView } from './teamsheet';
import { competition } from '../../core/competition/registry';

const URC = competition('urc-2026-27');

const KICKOFF = '2026-09-25T18:45:00Z';

function player(number: number, overrides: Partial<TeamsheetPlayer> = {}): TeamsheetPlayer {
  return { number, name: `Player ${number}`, position: null, captain: false, ...overrides };
}

describe('teamsheet view', () => {
  it('counts whole years at kickoff', () => {
    const kickoff = new Date(KICKOFF);
    expect(ageOn('2000-09-25', kickoff)).toBe(26);
    expect(ageOn('2000-09-26', kickoff)).toBe(25);
    expect(ageOn('2000-10-01', kickoff)).toBe(25);
    expect(ageOn(null, kickoff)).toBeNull();
    expect(ageOn('not a date', kickoff)).toBeNull();
  });

  it('averages only the players with a birth date', () => {
    const players = [
      player(1, { dateOfBirth: '2000-09-25' }),
      player(2, { dateOfBirth: '1990-09-25' }),
      player(3),
    ];
    expect(averageAge(players, new Date('2026-09-25T00:00:00Z'))).toBeCloseTo(31, 1);
    expect(averageAge([player(4)], new Date(KICKOFF))).toBeNull();
  });

  it('adds flags, ages and club artwork to a side', () => {
    const sheet: Teamsheet = {
      starters: [
        player(1, { dateOfBirth: '2001-09-14', birthCountry: 'Argentina', position: 'hooker' }),
        player(2, { birthCountry: 'Atlantis' }),
      ],
      replacements: [player(16, { position: 'sub 1', dateOfBirth: '2004-01-09' })],
    };
    const view = sheetView(URC, 'Benetton', 'benetton-rugby', sheet, KICKOFF);
    expect(view.banner?.crest).toContain('benetton-rugby-crest');
    expect(view.accent).toBe('#73d8a0');
    expect(view.starters[0]).toEqual({
      number: 1,
      name: 'Player 1',
      position: 'hooker',
      captain: false,
      age: 25,
      country: { name: 'Argentina', flag: 'assets/images/flags/ar.svg' },
    });
    expect(view.starters[1].country).toBeUndefined();
    expect(view.starters[1].age).toBeNull();
    expect(view.replacements[0].position).toBeNull();
    expect(view.startersAverageAge).toBeCloseTo(25.03, 1);
    expect(view.replacementsAverageAge).toBeCloseTo(22.7, 1);
  });

  it('leaves ages out when the kickoff is unknown', () => {
    const view = sheetView(
      URC,
      'TBC',
      'unknown-club',
      { starters: [player(1)], replacements: [] },
      null,
    );
    expect(view.banner).toBeUndefined();
    expect(view.starters[0].age).toBeNull();
    expect(view.startersAverageAge).toBeNull();
  });
});
