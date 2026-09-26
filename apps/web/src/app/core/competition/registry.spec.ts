import { COMPETITIONS, DEFAULT_COMPETITION_ID, competition } from './registry';

describe('competition registry', () => {
  const urc = competition('urc-2026-27');

  it('registers the URC 2026/27 as the default competition', () => {
    expect(DEFAULT_COMPETITION_ID).toBe('urc-2026-27');
    expect([...COMPETITIONS.keys()]).toEqual(['urc-2026-27']);
    expect(urc.name).toBe('United Rugby Championship 2026/27');
    expect(urc.shortName).toBe('URC');
    expect(urc.season).toBe('2026/27');
    expect(urc.timezone).toBe('Africa/Johannesburg');
    expect(() => competition('six-nations-2027')).toThrow(/Unknown competition/);
  });

  it('numbers regular rounds and labels the playoffs', () => {
    expect(urc.regularRounds).toBe(18);
    expect(urc.lastRound).toBe(21);
    expect([1, 9, 18, 19, 20, 21].map((id) => urc.roundCode(id))).toEqual([
      '01',
      '09',
      '18',
      'QF',
      'SF',
      'F',
    ]);
    expect(urc.fixtureCount).toBe(144);
    expect(urc.playoffSlots).toBe(7);
    expect(urc.rounds.map((r) => r.title).slice(17)).toEqual([
      'Round 18',
      'Quarter-finals',
      'Semi-finals',
      'Grand final',
    ]);
  });

  it('carries the club catalogue and artwork paths', () => {
    expect(urc.teams).toHaveLength(16);
    const ospreys = urc.team('ospreys')!;
    expect(ospreys.shortName).toBe('Ospreys');
    expect(ospreys.avatar).toBe('assets/images/teams/ospreys.png');
    expect(urc.jersey('ospreys')).toBe(ospreys.jersey);
    expect(urc.jersey('tbc')).toBe('assets/images/jerseys/tbc.svg');
    expect(urc.team(null)).toBeUndefined();
    expect(urc.banners['munster-rugby']?.crest).toBe(
      'assets/images/club-banners/munster-rugby-crest.svg',
    );
    expect(urc.countries.named(' New Zealand ')).toEqual({
      name: 'New Zealand',
      flag: 'assets/images/flags/nz.svg',
    });
    expect(urc.ball).toBe('assets/images/urc-ball.webp');
    expect(urc.emblem).toBe('assets/images/urc-emblem.svg');
  });

  it('finds first kickoffs and fixtures', () => {
    expect(urc.firstKickoff(1)).toBe('2026-09-25T18:45:00.000Z');
    expect(urc.firstKickoff(21)).toBeNull();
    const located = urc.locate('292584');
    expect(located?.round.id).toBe(1);
    expect(located?.fixture.home).toBe('Benetton');
    expect(located?.fixture.venue).toBe('Stadio Monigo');
  });
});
