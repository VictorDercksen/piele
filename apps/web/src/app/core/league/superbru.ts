import type { MatchState } from '../api/match-centre.models';
import type { Competition } from '../competition/competition.models';
import type {
  FixturePicks,
  FixtureResult,
  LeagueMember,
  LeagueRules,
  MemberPick,
  PickSide,
  RoundStanding,
  WinPoints,
} from './league.models';

/**
 * Superbru scoring, pure. Round tables and the season table are derived from the members'
 * picks and the fixtures' results; a recorded round total (`RoundStanding`) overrides the
 * derived one for that member and round. Margins are signed from the home side: home by m is
 * +m, away by m is −m, a draw is 0.
 */

/** Piele's rules, the defaults for a new league. */
export const DEFAULT_RULES: LeagueRules = {
  defaultPicks: true,
  picksHiddenBeforeKickoff: false,
  bonusPoint: true,
  bonusPointSplit: true,
  bonusPointRangeCapped: true,
  startingRound: 1,
  winPoints: { regular: 1, quarterFinal: 1.5, semiFinal: 2, final: 3 },
  marginPoint: 0.5,
  marginWindow: 5,
  bonusPointValue: 1,
  bonusPointMinimumShare: 0.25,
  bonusRange: 15,
  grandSlamPoints: 2,
  previousChampionMemberId: null,
};

/** Rules with every missing key taken from `DEFAULT_RULES`. */
export function withDefaultRules(rules: Partial<LeagueRules> | null | undefined): LeagueRules {
  return {
    ...DEFAULT_RULES,
    ...(rules ?? {}),
    winPoints: { ...DEFAULT_RULES.winPoints, ...(rules?.winPoints ?? {}) },
  };
}

/** Which win points a round earns. Only regular rounds have a grand slam. */
export type RoundType = keyof WinPoints;

const PLAYOFF_TYPES: Readonly<Record<string, RoundType>> = {
  QF: 'quarterFinal',
  SF: 'semiFinal',
  F: 'final',
};

/**
 * `regular` up to the competition's last regular round, then the playoff round's type from
 * its code (`QF`, `SF`, `F`). An unknown knockout code counts as a quarter-final.
 */
export function roundType(
  roundId: number,
  competition: Pick<Competition, 'regularRounds' | 'roundCode'>,
): RoundType {
  if (roundId <= competition.regularRounds) return 'regular';
  return PLAYOFF_TYPES[competition.roundCode(roundId)] ?? 'quarterFinal';
}

/** A pick's margin from the home side, or null for a missed pick. */
export function signedMargin(pick: {
  readonly side: PickSide;
  readonly margin: number | null;
}): number | null {
  switch (pick.side) {
    case 'home':
      return pick.margin ?? 0;
    case 'away':
      return -(pick.margin ?? 0);
    case 'draw':
      return 0;
    default:
      return null;
  }
}

/** The result's margin from the home side. */
export function actualMargin(result: Pick<FixtureResult, 'homeScore' | 'awayScore'>): number {
  return result.homeScore - result.awayScore;
}

const SCORING: ReadonlySet<MatchState> = new Set(['live', 'half_time', 'full_time']);
const VOID: ReadonlySet<MatchState> = new Set(['postponed', 'cancelled']);

/** The fixture has a score to count: live and half time count provisionally. */
export function isScored(result: FixtureResult | null | undefined): result is FixtureResult {
  return !!result && SCORING.has(result.state);
}

/** At full time: the fixture's points are final. */
export function isFinal(result: FixtureResult | null | undefined): boolean {
  return result?.state === 'full_time';
}

/** Postponed or cancelled: the fixture is void and never scored. */
export function isVoided(result: FixtureResult | null | undefined): boolean {
  return !!result && VOID.has(result.state);
}

/** Nothing more will change: full time, postponed or cancelled. */
export function isSettled(result: FixtureResult | null | undefined): boolean {
  return isFinal(result) || isVoided(result);
}

/** One pick's points for one fixture. */
export interface PickScore {
  readonly memberId: string;
  /** Win points: the correct outcome. */
  readonly wp: number;
  /** Margin point: within the margin window of the actual margin. */
  readonly mp: number;
  /** Bonus point, or this pick's share of it. */
  readonly bp: number;
  readonly points: number;
  /** |pick − actual| for a scored pick that is neither missed nor a default; else null. */
  readonly distance: number | null;
  /** False while the fixture has no score to count (not started, postponed, cancelled). */
  readonly scored: boolean;
  /** The pick named the winning side, or a draw on a draw. */
  readonly correct: boolean;
}

/** Floating-point noise off a total (a split point can be a third). */
function tidy(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

/** Two totals are the same to the hundredth a recorded total keeps. */
export function sameTotal(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.005;
}

/**
 * Scores one fixture's picks. WP for the correct outcome by round type; MP within the margin
 * window; the bonus point to the closest correct picks (within the bonus range when capped),
 * split among ties but never below the minimum share. A default pick earns WP only, a missed
 * pick nothing. Without a score to count, every pick is unscored.
 */
export function scoreFixture(
  picks: readonly Pick<MemberPick, 'memberId' | 'side' | 'margin' | 'isDefault'>[],
  result: FixtureResult | null | undefined,
  rules: LeagueRules,
  type: RoundType,
): PickScore[] {
  if (!isScored(result)) {
    return picks.map((p) => ({
      memberId: p.memberId,
      wp: 0,
      mp: 0,
      bp: 0,
      points: 0,
      distance: null,
      scored: false,
      correct: false,
    }));
  }
  const actual = actualMargin(result);
  const base = picks.map((pick) => {
    const margin = signedMargin(pick);
    if (margin === null) {
      return {
        memberId: pick.memberId,
        wp: 0,
        mp: 0,
        distance: null,
        correct: false,
        bonus: false,
      };
    }
    const correct = Math.sign(margin) === Math.sign(actual);
    const wp = correct ? rules.winPoints[type] : 0;
    if (pick.isDefault) {
      return { memberId: pick.memberId, wp, mp: 0, distance: null, correct, bonus: false };
    }
    const distance = Math.abs(margin - actual);
    const mp = distance <= rules.marginWindow ? rules.marginPoint : 0;
    const bonus = correct && (!rules.bonusPointRangeCapped || distance <= rules.bonusRange);
    return { memberId: pick.memberId, wp, mp, distance, correct, bonus };
  });
  const candidates = rules.bonusPoint ? base.filter((b) => b.bonus) : [];
  const closest = Math.min(...candidates.map((c) => c.distance ?? Infinity));
  const winners = candidates.filter((c) => c.distance === closest).length;
  const share = !winners
    ? 0
    : rules.bonusPointSplit
      ? Math.min(
          rules.bonusPointValue,
          Math.max(rules.bonusPointValue / winners, rules.bonusPointMinimumShare),
        )
      : rules.bonusPointValue;
  return base.map(({ memberId, wp, mp, distance, correct, bonus }) => {
    const bp = bonus && distance === closest ? share : 0;
    return { memberId, wp, mp, bp, points: tidy(wp + mp + bp), distance, scored: true, correct };
  });
}

/**
 * Picks from the biggest home margin to the biggest away margin, draws in the middle and
 * missed picks last; equal margins by name.
 */
export function orderPicks<T extends Pick<MemberPick, 'side' | 'margin' | 'memberName'>>(
  picks: readonly T[],
): T[] {
  return [...picks].sort((a, b) => {
    const ma = signedMargin(a);
    const mb = signedMargin(b);
    if (ma === null || mb === null) {
      if (ma !== mb) return ma === null ? 1 : -1;
    } else if (ma !== mb) {
      return mb - ma;
    }
    return a.memberName.localeCompare(b.memberName);
  });
}

/** How the picks lean, in whole percentages that add up to 100 (missed picks left out). */
export interface Sway {
  readonly home: number;
  readonly draw: number;
  readonly away: number;
}

export function sway(picks: readonly Pick<MemberPick, 'side'>[]): Sway {
  const sides = ['home', 'draw', 'away'] as const;
  const counts = sides.map((side) => picks.filter((p) => p.side === side).length);
  const total = counts.reduce((sum, n) => sum + n, 0);
  if (!total) return { home: 0, draw: 0, away: 0 };
  // Largest remainder, so the three shares always make 100.
  const exact = counts.map((n) => (n * 100) / total);
  const shares = exact.map(Math.floor);
  let left = 100 - shares.reduce((sum, n) => sum + n, 0);
  const byRemainder = exact
    .map((value, index) => ({ index, remainder: value - Math.floor(value) }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (const { index } of byRemainder) {
    if (left <= 0) break;
    shares[index] += 1;
    left -= 1;
  }
  return { home: shares[0], draw: shares[1], away: shares[2] };
}

/** What Superbru's tie order compares. */
export interface Rankable {
  readonly memberName: string;
  readonly points: number;
  readonly wp: number;
  readonly mp: number;
  readonly distance: number;
}

function compareRank(a: Rankable, b: Rankable): number {
  if (!sameTotal(a.points, b.points)) return b.points - a.points;
  if (!sameTotal(a.wp, b.wp)) return b.wp - a.wp;
  if (!sameTotal(a.mp, b.mp)) return b.mp - a.mp;
  if (!sameTotal(a.distance, b.distance)) return a.distance - b.distance;
  return 0;
}

/**
 * Superbru's tie order: points, then higher WP, then higher MP, then lower total distance;
 * rows equal on all four share a rank (1, 2, 2, 4) and are listed by name.
 */
export function rankRows<T extends Rankable>(
  rows: readonly T[],
): (T & { readonly rank: number })[] {
  const sorted = [...rows].sort(
    (a, b) => compareRank(a, b) || a.memberName.localeCompare(b.memberName),
  );
  let rank = 0;
  return sorted.map((row, index) => {
    if (index === 0 || compareRank(sorted[index - 1], row) !== 0) rank = index + 1;
    return { ...row, rank };
  });
}

/** One member's line in a round table. */
export interface RoundRow extends Rankable {
  readonly memberId: string;
  readonly roundId: number;
  readonly wp: number;
  readonly mp: number;
  readonly gsp: number;
  readonly bp: number;
  /** The round total: the recorded override where there is one, else the derived total. */
  readonly points: number;
  /** The total derived from the picks. */
  readonly derived: number;
  /** Sum of |pick − actual| over scored picks; missed and default picks add nothing. */
  readonly distance: number;
  readonly rank: number;
  /** Every fixture settled and every member's picks in (or their total recorded). */
  readonly complete: boolean;
  /** The recorded total when it differs from the derived one, else null. */
  readonly override: number | null;
}

/** A fixture as the round table reads it: its round, result and picks. */
export type RoundFixture = Pick<FixturePicks, 'fixtureId' | 'roundId' | 'result' | 'picks'>;
export type RoundMember = Pick<LeagueMember, 'id' | 'name'>;

/**
 * A round's table from its fixtures' picks and results. A member is listed when they have a
 * pick in the round or a recorded total (`overrides`, that round's `RoundStanding` rows); a
 * recorded total replaces the derived one. GSP needs a regular round with every fixture
 * settled and every counted fixture picked correctly, without a missed or default pick.
 * Rounds before `rules.startingRound` are not scored and have no table.
 */
export function roundTable(
  fixtures: readonly RoundFixture[],
  members: readonly RoundMember[],
  rules: LeagueRules,
  competition: Pick<Competition, 'regularRounds' | 'roundCode'>,
  overrides: readonly Pick<RoundStanding, 'memberId' | 'points' | 'roundId'>[] = [],
): RoundRow[] {
  const roundId = fixtures[0]?.roundId ?? overrides[0]?.roundId;
  if (roundId === undefined || roundId < rules.startingRound) return [];
  const type = roundType(roundId, competition);
  const scores = new Map(
    fixtures.map((f) => [f.fixtureId, scoreFixture(f.picks, f.result, rules, type)]),
  );
  const settled = fixtures.length > 0 && fixtures.every((f) => isSettled(f.result));
  const counted = fixtures.filter((f) => !isVoided(f.result));
  const rows = members.flatMap((member) => {
    const stored = overrides.find((o) => o.memberId === member.id && o.roundId === roundId);
    const own = fixtures.flatMap((f) => {
      const pick = f.picks.find((p) => p.memberId === member.id);
      const score = scores.get(f.fixtureId)?.find((s) => s.memberId === member.id);
      return pick && score ? [{ fixture: f, pick, score }] : [];
    });
    if (!own.length && !stored) return [];
    const sum = (key: 'wp' | 'mp' | 'bp') =>
      own.reduce((total, { score }) => total + score[key], 0);
    const wp = tidy(sum('wp'));
    const mp = tidy(sum('mp'));
    const bp = tidy(sum('bp'));
    const pickedAll = counted.every((f) => own.some((o) => o.fixture.fixtureId === f.fixtureId));
    const grandSlam =
      type === 'regular' &&
      settled &&
      counted.length > 0 &&
      pickedAll &&
      own
        .filter((o) => !isVoided(o.fixture.result))
        .every((o) => o.score.correct && !o.pick.isDefault && o.pick.side !== 'missed');
    const gsp = grandSlam ? rules.grandSlamPoints : 0;
    const derived = tidy(wp + mp + bp + gsp);
    const distance = own.reduce((total, { score }) => total + (score.distance ?? 0), 0);
    return [
      {
        memberId: member.id,
        memberName: member.name,
        roundId,
        wp,
        mp,
        gsp,
        bp,
        derived,
        points: stored ? stored.points : derived,
        distance,
        override: stored && !sameTotal(stored.points, derived) ? stored.points : null,
        inAll: pickedAll || !!stored,
      },
    ];
  });
  const complete = settled && rows.every((row) => row.inAll);
  return rankRows(rows.map(({ inAll: _, ...row }) => ({ ...row, rank: 0, complete })));
}

/** A completed round's cap (winners) and spoon (last on equal points). */
export interface RoundBadges {
  readonly cap: readonly string[];
  readonly spoon: readonly string[];
}

/**
 * The cap goes to the round's top points, the spoon to everyone on its lowest points, once
 * the round is complete; before then, and in a round with nobody behind the leaders, nobody
 * holds the spoon.
 */
export function roundBadges(
  table: readonly Pick<RoundRow, 'memberId' | 'points' | 'complete'>[],
): RoundBadges {
  if (!table.length || !table.every((row) => row.complete)) return { cap: [], spoon: [] };
  const points = table.map((row) => row.points);
  const top = Math.max(...points);
  const bottom = Math.min(...points);
  return {
    cap: table.filter((row) => sameTotal(row.points, top)).map((row) => row.memberId),
    spoon: sameTotal(top, bottom)
      ? []
      : table.filter((row) => sameTotal(row.points, bottom)).map((row) => row.memberId),
  };
}

/** One member's season line. */
export interface SeasonRow extends Rankable {
  readonly memberId: string;
  readonly points: number;
  readonly wp: number;
  readonly mp: number;
  readonly gsp: number;
  readonly bp: number;
  readonly distance: number;
  /** Rounds the member has a line in. */
  readonly rounds: number;
  readonly rank: number;
  /** Holds the cap or spoon of the latest complete round. */
  readonly cap: boolean;
  readonly spoon: boolean;
  /** Last season's champion. */
  readonly crown: boolean;
}

/** The latest round whose table is complete, or null. */
export function latestCompleteRound(
  roundTables: ReadonlyMap<number, readonly Pick<RoundRow, 'complete'>[]>,
): number | null {
  const complete = [...roundTables]
    .filter(([, rows]) => rows.length > 0 && rows.every((row) => row.complete))
    .map(([roundId]) => roundId);
  return complete.length ? Math.max(...complete) : null;
}

/**
 * The season table from round tables (by round id, overrides already applied): totals per
 * member in Superbru's tie order, the cap and spoon of the latest complete round and the
 * crown for `rules.previousChampionMemberId`.
 */
export function seasonTable(
  roundTables: ReadonlyMap<number, readonly RoundRow[]>,
  rules: LeagueRules,
): SeasonRow[] {
  const totals = new Map<string, Omit<SeasonRow, 'rank' | 'cap' | 'spoon' | 'crown'>>();
  for (const [roundId, rows] of roundTables) {
    if (roundId < rules.startingRound) continue;
    for (const row of rows) {
      const entry = totals.get(row.memberId) ?? {
        memberId: row.memberId,
        memberName: row.memberName,
        points: 0,
        wp: 0,
        mp: 0,
        gsp: 0,
        bp: 0,
        distance: 0,
        rounds: 0,
      };
      totals.set(row.memberId, {
        ...entry,
        points: tidy(entry.points + row.points),
        wp: tidy(entry.wp + row.wp),
        mp: tidy(entry.mp + row.mp),
        gsp: tidy(entry.gsp + row.gsp),
        bp: tidy(entry.bp + row.bp),
        distance: entry.distance + row.distance,
        rounds: entry.rounds + 1,
      });
    }
  }
  const badgeRound = latestCompleteRound(roundTables);
  const badges =
    badgeRound === null ? { cap: [], spoon: [] } : roundBadges(roundTables.get(badgeRound)!);
  return rankRows(
    [...totals.values()].map((row) => ({
      ...row,
      rank: 0,
      cap: badges.cap.includes(row.memberId),
      spoon: badges.spoon.includes(row.memberId),
      crown: row.memberId === rules.previousChampionMemberId,
    })),
  );
}
