import { competition } from '../competition/registry';
import { FixturePicks, FixtureResult, MemberPick } from './league.models';
import {
  DEFAULT_RULES,
  RoundRow,
  orderPicks,
  rankRows,
  roundBadges,
  roundTable,
  roundType,
  scoreFixture,
  seasonTable,
  signedMargin,
  sway,
  withDefaultRules,
} from './superbru';

const URC = competition('urc-2026-27');

/**
 * Piele's URC round 1, checked against Superbru's pool results: each line is
 * `Name CLUB margin points`, where points is what Superbru awarded for that pick.
 */
const ROUND_1: readonly {
  id: string;
  home: string;
  away: string;
  score: [number, number];
  picks: readonly string[];
}[] = [
  {
    id: '292584',
    home: 'BEN',
    away: 'DRA',
    score: [20, 20],
    picks: [
      'Victor Dercksen BEN 16 0', 'Wihan4 BEN 14 0', 'ian die man BEN 13 0',
      'Wolfgodallahmeen BEN 12 0', 'Eugene BEN 12 0', 'Steven13 BEN 12 0', 'Deon BEN 10 0',
      'Annas BEN 10 0', 'Willie BEN 10 0', 'TheoLotter BEN 7 0', 'DanB97 BEN 7 0', 'Pierre BEN 5 0.5',
    ],
  },
  {
    id: '292585',
    home: 'CON',
    away: 'STO',
    score: [17, 30],
    picks: [
      'ian die man CON 10 0', 'Steven13 CON 6 0', 'Willie CON 6 0', 'DanB97 CON 6 0', 'Deon CON 5 0',
      'Eugene CON 3 0', 'Wihan4 CON 3 0', 'Pierre CON 2 0', 'Annas CON 2 0', 'TheoLotter STO 3 1',
      'Victor Dercksen STO 9 1.5', 'Wolfgodallahmeen STO 13 2.5',
    ],
  },
  {
    id: '292586',
    home: 'ULS',
    away: 'EDI',
    score: [20, 26],
    picks: [
      'Steven13 ULS 18 0', 'ian die man ULS 18 0', 'DanB97 ULS 14 0', 'Willie ULS 13 0',
      'Eugene ULS 12 0', 'Wihan4 ULS 10 0', 'Annas ULS 8 0', 'Victor Dercksen ULS 5 0', 'Deon ULS 5 0',
      'TheoLotter ULS 4 0', 'Pierre ULS 3 0', 'Wolfgodallahmeen EDI 6 2.5',
    ],
  },
  {
    id: '292587',
    home: 'LIO',
    away: 'LEI',
    score: [24, 23],
    picks: [
      'Eugene LIO 9 1', 'Annas LIO 7 1', 'Victor Dercksen LIO 6 2', 'Willie LIO 6 2', 'DanB97 LEI 5 0',
      'Pierre LEI 5 0', 'Wihan4 LEI 7 0', 'Wolfgodallahmeen LEI 7 0', 'TheoLotter LEI 10 0',
      'Steven13 LEI 11 0', 'Deon LEI 14 0', 'ian die man LEI 15 0',
    ],
  },
  {
    id: '292588',
    home: 'SHA',
    away: 'OSP',
    score: [31, 14],
    picks: [
      'ian die man SHA 24 1', 'Steven13 SHA 21 1.5', 'DanB97 SHA 15 2.5', 'Wolfgodallahmeen SHA 14 1.5',
      'Wihan4 SHA 13 1.5', 'Deon SHA 10 1', 'Victor Dercksen SHA 10 1', 'Willie SHA 9 1',
      'Annas SHA 8 1', 'Eugene SHA 8 1', 'TheoLotter SHA 6 1', 'Pierre SHA 3 1',
    ],
  },
  {
    id: '292589',
    home: 'MUN',
    away: 'GLA',
    score: [20, 26],
    picks: [
      'Annas MUN 8 0', 'Wolfgodallahmeen MUN 5 0', 'DanB97 MUN 3 0', 'Victor Dercksen MUN 3 0',
      'Steven13 GLA 1 1.5', 'Pierre GLA 3 1.5', 'Deon GLA 4 1.5', 'TheoLotter GLA 5 1.75',
      'Eugene GLA 5 1.75', 'Willie GLA 5 1.75', 'Wihan4 GLA 7 1.75', 'ian die man GLA 8 1.5',
    ],
  },
  {
    id: '292590',
    home: 'ZEB',
    away: 'BUL',
    score: [10, 45],
    picks: [
      'DanB97 ZEB 15 0', 'Deon BUL 5 1', 'Annas BUL 8 1', 'Willie BUL 11 1', 'Eugene BUL 12 1',
      'Pierre BUL 13 1', 'ian die man BUL 14 1', 'Wolfgodallahmeen BUL 14 1', 'TheoLotter BUL 15 1',
      'Steven13 BUL 18 1', 'Victor Dercksen BUL 20 1', 'Wihan4 BUL 25 2',
    ],
  },
  {
    id: '292591',
    home: 'SCA',
    away: 'CAR',
    score: [15, 20],
    picks: [
      'ian die man SCA 8 0', 'Deon SCA 7 0', 'Steven13 SCA 5 0', 'DanB97 SCA 5 0', 'Willie SCA 4 0',
      'TheoLotter SCA 3 0', 'Eugene SCA 3 0', 'Annas SCA 2 0', 'Wihan4 CAR 4 1.5',
      'Victor Dercksen CAR 5 2', 'Pierre CAR 5 2', 'Wolfgodallahmeen CAR 9 1.5',
    ],
  },
];

/** Superbru's round 1 pool results: WP · MP · GSP · BP · total, in its order. */
const ROUND_1_TABLE: readonly [string, number, number, number, number, number][] = [
  ['Wolfgodallahmeen', 5, 2, 0, 2, 9],
  ['Victor Dercksen', 5, 1.5, 0, 1, 7.5],
  ['Wihan4', 4, 1.5, 0, 1.25, 6.75],
  ['Pierre', 4, 1.5, 0, 0.5, 6],
  ['Willie', 4, 1, 0, 0.75, 5.75],
  ['TheoLotter', 4, 0.5, 0, 0.25, 4.75],
  ['Eugene', 4, 0.5, 0, 0.25, 4.75],
  ['Steven13', 3, 1, 0, 0, 4],
  ['Deon', 3, 0.5, 0, 0, 3.5],
  ['ian die man', 3, 0.5, 0, 0, 3.5],
  ['Annas', 3, 0, 0, 0, 3],
  ['DanB97', 1, 0.5, 0, 1, 2.5],
];

const id = (name: string) => `m-${name.replace(/\s+/g, '-').toLowerCase()}`;
const MEMBERS = ROUND_1_TABLE.map(([name]) => ({ id: id(name), name }));

function parse(line: string, home: string): { pick: MemberPick; points: number } {
  const parts = line.split(' ');
  const points = Number(parts.pop());
  const margin = Number(parts.pop());
  const club = parts.pop();
  const name = parts.join(' ');
  return {
    pick: {
      memberId: id(name),
      memberName: name,
      side: club === home ? 'home' : 'away',
      margin,
      isDefault: false,
      dutyId: null,
    },
    points,
  };
}

function result(home: number, away: number, state: FixtureResult['state'] = 'full_time'): FixtureResult {
  return { homeScore: home, awayScore: away, state };
}

function round1(): FixturePicks[] {
  return ROUND_1.map((f) => ({
    fixtureId: f.id,
    roundId: 1,
    kickoffUtc: null,
    locked: true,
    result: result(...f.score),
    myPick: null,
    picks: f.picks.map((line) => parse(line, f.home).pick),
  }));
}

let next = 0;
function pick(side: MemberPick['side'], margin: number | null, name = `P${++next}`, isDefault = false): MemberPick {
  return { memberId: id(name), memberName: name, side, margin, isDefault, dutyId: null };
}

function fixture(
  roundId: number,
  fixtureId: string,
  res: FixtureResult | null,
  picks: readonly MemberPick[],
): FixturePicks {
  return { fixtureId, roundId, kickoffUtc: null, locked: true, result: res, myPick: null, picks };
}

describe('superbru scoring', () => {
  it('scores every round 1 pick as Superbru did', () => {
    for (const f of ROUND_1) {
      const parsed = f.picks.map((line) => parse(line, f.home));
      const scores = scoreFixture(parsed.map((p) => p.pick), result(...f.score), DEFAULT_RULES, 'regular');
      expect(scores.map((s) => [s.memberId, s.points])).toEqual(
        parsed.map((p) => [p.pick.memberId, p.points]),
      );
      expect(scores.every((s) => s.scored)).toBe(true);
    }
  });

  it('derives the round 1 table: WP, MP, GSP, BP and totals in the pool results order', () => {
    const table = roundTable(round1(), MEMBERS, DEFAULT_RULES, URC);
    expect(table.map((r) => [r.memberName, r.wp, r.mp, r.gsp, r.bp, r.points])).toEqual(ROUND_1_TABLE);
    expect(table.map((r) => r.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(table.every((r) => r.complete && r.override === null)).toBe(true);
    // TheoLotter and Eugene tie on points, WP and MP; TheoLotter was closer overall.
    const theo = table.find((r) => r.memberName === 'TheoLotter')!;
    const eugene = table.find((r) => r.memberName === 'Eugene')!;
    expect(theo.distance).toBe(78);
    expect(eugene.distance).toBe(95);
    expect(roundBadges(table)).toEqual({ cap: [id('Wolfgodallahmeen')], spoon: [id('DanB97')] });
  });

  it('builds the season table from round 1 in the pool results order, with the crown', () => {
    const rules = { ...DEFAULT_RULES, previousChampionMemberId: id('Annas') };
    const season = seasonTable(new Map([[1, roundTable(round1(), MEMBERS, rules, URC)]]), rules);
    expect(season.map((r) => [r.memberName, r.points])).toEqual(
      ROUND_1_TABLE.map(([name, , , , , total]) => [name, total]),
    );
    expect(season.every((r) => r.rounds === 1)).toBe(true);
    expect(season.filter((r) => r.cap).map((r) => r.memberName)).toEqual(['Wolfgodallahmeen']);
    expect(season.filter((r) => r.spoon).map((r) => r.memberName)).toEqual(['DanB97']);
    expect(season.filter((r) => r.crown).map((r) => r.memberName)).toEqual(['Annas']);
  });

  it('treats a recorded total equal to the derived one as no override', () => {
    const overrides = [
      { roundId: 1, memberId: id('Pierre'), points: 6 },
      { roundId: 1, memberId: id('DanB97'), points: 5.5 },
    ];
    const table = roundTable(round1(), MEMBERS, DEFAULT_RULES, URC, overrides);
    const pierre = table.find((r) => r.memberName === 'Pierre')!;
    const dan = table.find((r) => r.memberName === 'DanB97')!;
    expect(pierre.override).toBeNull();
    expect(dan).toEqual(expect.objectContaining({ override: 5.5, points: 5.5, derived: 2.5, rank: 6 }));
    expect(roundBadges(table).spoon).toEqual([id('Annas')]);
  });

  it('lists a member with only a recorded total, and counts it as in', () => {
    const table = roundTable(round1(), [...MEMBERS, { id: 'm-late', name: 'Late' }], DEFAULT_RULES, URC, [
      { roundId: 1, memberId: 'm-late', points: 10 },
    ]);
    expect(table[0]).toEqual(expect.objectContaining({ memberId: 'm-late', override: 10, derived: 0 }));
    expect(table.every((r) => r.complete)).toBe(true);
    // A member without picks or a recorded total is not in the round.
    expect(roundTable(round1(), [{ id: 'm-x', name: 'X' }], DEFAULT_RULES, URC)).toEqual([]);
  });

  it('splits the bonus point but never below the minimum share', () => {
    const picks = ['A', 'B', 'C', 'D', 'E'].map((name) => pick('home', 7, name));
    const scores = scoreFixture([...picks, pick('home', 20, 'F')], result(27, 20), DEFAULT_RULES, 'regular');
    expect(scores.map((s) => s.bp)).toEqual([0.25, 0.25, 0.25, 0.25, 0.25, 0]);
    expect(scores[0].points).toBe(1.75);

    const two = scoreFixture([pick('away', 3), pick('away', 3)], result(10, 13), DEFAULT_RULES, 'regular');
    expect(two.map((s) => s.bp)).toEqual([0.5, 0.5]);
  });

  it('gives every tied qualifier the full point without the split, and none with the bonus off', () => {
    const picks = [pick('home', 7), pick('home', 7), pick('home', 3)];
    const full = scoreFixture(picks, result(27, 20), { ...DEFAULT_RULES, bonusPointSplit: false }, 'regular');
    expect(full.map((s) => s.bp)).toEqual([1, 1, 0]);
    const off = scoreFixture(picks, result(27, 20), { ...DEFAULT_RULES, bonusPoint: false }, 'regular');
    expect(off.map((s) => s.bp)).toEqual([0, 0, 0]);
    expect(off.map((s) => s.points)).toEqual([1.5, 1.5, 1.5]);
  });

  it('caps the bonus point to the bonus range unless the cap is off', () => {
    const picks = [pick('away', 5), pick('home', 3)];
    const capped = scoreFixture(picks, result(10, 45), DEFAULT_RULES, 'regular');
    expect(capped.map((s) => s.bp)).toEqual([0, 0]);
    const open = scoreFixture(picks, result(10, 45), { ...DEFAULT_RULES, bonusPointRangeCapped: false }, 'regular');
    expect(open.map((s) => s.bp)).toEqual([1, 0]);
  });

  it('pays knockout win points by round type and no grand slam', () => {
    expect([1, 18, 19, 20, 21].map((r) => roundType(r, URC))).toEqual([
      'regular',
      'regular',
      'quarterFinal',
      'semiFinal',
      'final',
    ]);
    for (const [roundId, wp] of [
      [19, 1.5],
      [20, 2],
      [21, 3],
    ]) {
      const table = roundTable(
        [fixture(roundId, `k${roundId}`, result(30, 10), [pick('home', 30, 'Ace')])],
        [{ id: id('Ace'), name: 'Ace' }],
        DEFAULT_RULES,
        URC,
      );
      expect(table[0]).toEqual(expect.objectContaining({ wp, gsp: 0, mp: 0, bp: 1, points: wp + 1 }));
    }
  });

  it('awards the grand slam for a perfect regular round, not to a default or missed pick', () => {
    const members = ['Ace', 'Dee', 'Mo'].map((name) => ({ id: id(name), name }));
    const fixtures = [
      fixture(3, 'a', result(20, 10), [pick('home', 10, 'Ace'), pick('home', 10, 'Dee', true), pick('home', 10, 'Mo')]),
      fixture(3, 'b', result(10, 20), [pick('away', 10, 'Ace'), pick('away', 10, 'Dee'), pick('missed', null, 'Mo')]),
    ];
    const table = roundTable(fixtures, members, DEFAULT_RULES, URC);
    const row = (name: string) => table.find((r) => r.memberName === name)!;
    expect(row('Ace')).toEqual(expect.objectContaining({ wp: 2, mp: 1, bp: 1, gsp: 2, points: 6 }));
    // A default pick earns WP only (Ace and Mo share fixture a's bonus point) and no GSP.
    expect(row('Dee')).toEqual(expect.objectContaining({ wp: 2, mp: 0.5, bp: 0.5, gsp: 0, points: 3 }));
    expect(row('Mo')).toEqual(expect.objectContaining({ wp: 1, mp: 0.5, bp: 0.5, gsp: 0, points: 2 }));
    const scores = scoreFixture(fixtures[1].picks, fixtures[1].result, DEFAULT_RULES, 'regular');
    expect(scores[2]).toEqual(expect.objectContaining({ points: 0, distance: null, scored: true, correct: false }));
  });

  it('scores a default pick with win points only', () => {
    const [scored] = scoreFixture([pick('home', 10, 'Dee', true)], result(20, 10), DEFAULT_RULES, 'regular');
    expect(scored).toEqual(expect.objectContaining({ wp: 1, mp: 0, bp: 0, points: 1, distance: null }));
  });

  it('leaves a postponed fixture void and still completes the round around it', () => {
    const members = [{ id: id('Ace'), name: 'Ace' }];
    const fixtures = [
      fixture(4, 'a', result(20, 10), [pick('home', 10, 'Ace')]),
      fixture(4, 'b', result(0, 0, 'postponed'), [pick('away', 5, 'Ace')]),
    ];
    const scores = scoreFixture(fixtures[1].picks, fixtures[1].result, DEFAULT_RULES, 'regular');
    expect(scores[0]).toEqual(expect.objectContaining({ scored: false, points: 0 }));
    const [row] = roundTable(fixtures, members, DEFAULT_RULES, URC);
    expect(row).toEqual(expect.objectContaining({ complete: true, gsp: 2, points: 4.5 }));
    expect(roundBadges([row])).toEqual({ cap: [id('Ace')], spoon: [] });
  });

  it('scores a live fixture provisionally: no grand slam, no badges, not complete', () => {
    const members = ['Ace', 'Bo'].map((name) => ({ id: id(name), name }));
    const fixtures = [
      fixture(5, 'a', result(20, 10, 'live'), [pick('home', 10, 'Ace'), pick('away', 3, 'Bo')]),
      fixture(5, 'b', null, [pick('home', 4, 'Ace'), pick('home', 4, 'Bo')]),
    ];
    const table = roundTable(fixtures, members, DEFAULT_RULES, URC);
    expect(table.map((r) => [r.memberName, r.points, r.gsp, r.complete])).toEqual([
      ['Ace', 2.5, 0, false],
      ['Bo', 0, 0, false],
    ]);
    expect(roundBadges(table)).toEqual({ cap: [], spoon: [] });
    // At full time every fixture is final: the grand slam and badges follow.
    const final = roundTable(
      [
        fixture(5, 'a', result(20, 10), fixtures[0].picks),
        fixture(5, 'b', result(14, 10), fixtures[1].picks),
      ],
      members,
      DEFAULT_RULES,
      URC,
    );
    expect(final.map((r) => [r.memberName, r.points, r.gsp])).toEqual([
      ['Ace', 6.5, 2],
      ['Bo', 2, 0],
    ]);
    expect(roundBadges(final)).toEqual({ cap: [id('Ace')], spoon: [id('Bo')] });
  });

  it('does not score rounds before the starting round', () => {
    const rules = { ...DEFAULT_RULES, startingRound: 2 };
    expect(roundTable(round1(), MEMBERS, rules, URC)).toEqual([]);
  });

  it('breaks ties by WP, then MP, then distance, then shares the rank by name', () => {
    const row = (memberName: string, wp: number, mp: number, distance: number) => ({
      memberName,
      points: 5,
      wp,
      mp,
      distance,
    });
    const ranked = rankRows([
      row('Zed', 3, 1, 50),
      row('Yan', 4, 0.5, 90),
      row('Xia', 3, 1, 40),
      row('Ann', 3, 1, 50),
      row('Ben', 3, 1.5, 99),
    ]);
    expect(ranked.map((r) => [r.memberName, r.rank])).toEqual([
      ['Yan', 1],
      ['Ben', 2],
      ['Xia', 3],
      ['Ann', 4],
      ['Zed', 4],
    ]);
    expect(rankRows([row('A', 1, 1, 1), row('B', 1, 1, 1), row('C', 1, 1, 1), { ...row('D', 1, 1, 1), points: 1 }]).map((r) => r.rank)).toEqual([1, 1, 1, 4]);
  });

  it('adds up the season, counts rounds and shows the latest complete round’s cap and spoon', () => {
    const members = ['Ace', 'Bo', 'Cy'].map((name) => ({ id: id(name), name }));
    const r2 = roundTable(
      [fixture(2, 'x', result(30, 10), [pick('home', 20, 'Ace'), pick('home', 5, 'Bo'), pick('away', 5, 'Cy')])],
      members,
      DEFAULT_RULES,
      URC,
    );
    const r3 = roundTable(
      [fixture(3, 'y', result(10, 12, 'live'), [pick('away', 2, 'Cy'), pick('home', 2, 'Bo')])],
      members,
      DEFAULT_RULES,
      URC,
    );
    const season = seasonTable(new Map<number, RoundRow[]>([[2, r2], [3, r3]]), {
      ...DEFAULT_RULES,
      previousChampionMemberId: id('Bo'),
    });
    expect(season.map((r) => [r.memberName, r.points, r.rounds, r.cap, r.spoon, r.crown])).toEqual([
      ['Ace', 4.5, 1, true, false, false],
      ['Bo', 3.5, 2, false, false, true],
      ['Cy', 2.5, 2, false, true, false],
    ]);
  });

  it('orders picks from home to away with draws in the middle, and measures the sway', () => {
    const picks = [
      pick('away', 3, 'Cy'),
      pick('missed', null, 'Al'),
      pick('draw', 0, 'Di'),
      pick('home', 12, 'Bo'),
      pick('home', 12, 'Ab'),
      pick('away', 20, 'Ed'),
    ];
    expect(orderPicks(picks).map((p) => p.memberName)).toEqual(['Ab', 'Bo', 'Di', 'Cy', 'Ed', 'Al']);
    expect(sway(picks)).toEqual({ home: 40, draw: 20, away: 40 });
    expect(sway([pick('home', 1), pick('home', 1), pick('away', 1)])).toEqual({ home: 67, draw: 0, away: 33 });
    expect(sway([])).toEqual({ home: 0, draw: 0, away: 0 });
    expect(signedMargin(pick('away', 7))).toBe(-7);
    expect(signedMargin(pick('missed', null))).toBeNull();
  });

  it('fills missing rules from the defaults', () => {
    expect(withDefaultRules({ bonusPoint: false, winPoints: { final: 4 } as never })).toEqual({
      ...DEFAULT_RULES,
      bonusPoint: false,
      winPoints: { ...DEFAULT_RULES.winPoints, final: 4 },
    });
  });
});
