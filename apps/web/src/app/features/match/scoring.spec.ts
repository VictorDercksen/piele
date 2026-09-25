import { ScoreEvent, ScoreSection } from '../../core/api/match-centre.models';
import { Fixture } from '../../core/competition/competition.models';
import { STALE_MS, scoringView } from './scoring';

const FIXTURE: Fixture = {
  id: '292584',
  kickoffUtc: '2026-09-25T18:45:00Z',
  home: 'Benetton',
  away: 'Dragons',
  homeAsset: 'benetton-rugby',
  awayAsset: 'dragons-rfc',
  day: 'FRI 25 SEP',
  time: '20:45',
  venue: 'Stadio Monigo',
};
const NOW = Date.parse('2026-09-25T20:00:00Z');

function event(
  id: number,
  time: string,
  side: 'home' | 'away',
  kind: ScoreEvent['kind'],
  period = 'first half',
  score: [number, number] | null = null,
): ScoreEvent {
  return {
    id,
    minute: Number.parseInt(time),
    time,
    period,
    side,
    kind,
    points: 0,
    player: `Player ${id}`,
    score,
  };
}

function section(overrides: Partial<ScoreSection> = {}): ScoreSection {
  return {
    status: 'ok',
    source: 'URC match centre',
    fetchedAt: new Date(NOW - 20_000).toISOString(),
    state: 'live',
    minute: 55,
    home: { score: 13, halfTime: 10 },
    away: { score: 7, halfTime: 7 },
    events: [
      event(1, '6', 'home', 'penalty_goal', 'first half', [3, 0]),
      event(2, '18', 'away', 'try', 'first half', [3, 5]),
      event(3, '30', 'home', 'yellow_card'),
      event(4, '52', 'home', 'penalty_goal', 'second half', [13, 7]),
    ],
    ...overrides,
  };
}

describe('scoring view', () => {
  it('stays hidden before the kickoff window', () => {
    expect(scoringView(FIXTURE, undefined, NOW)).toBeNull();
    expect(
      scoringView(FIXTURE, { status: 'too_early', source: 'x', fetchedAt: null }, NOW),
    ).toBeNull();
  });

  it('lists events by side with a half-time divider', () => {
    const view = scoringView(FIXTURE, section(), NOW)!;
    expect(view.tag).toBe('live');
    expect(view.live).toBe(true);
    expect(view.rows.map((r) => (r.divider ? r.label : `${r.side} ${r.label}`))).toEqual([
      'home Penalty goal',
      'away Try',
      'home Yellow card',
      'Half time 10–7',
      'home Penalty goal',
    ]);
    const card = view.rows[2];
    expect(!card.divider && card.card).toBe('yellow');
    expect(!card.divider && card.score).toBeNull();
    const tr = view.rows[1];
    expect(!tr.divider && tr.team).toBe('Dragons');
    expect(!tr.divider && tr.score).toBe('3–5');
  });

  it('marks half time, delayed data and failures', () => {
    const half = scoringView(
      FIXTURE,
      section({ state: 'half_time', events: section().events!.slice(0, 2) }),
      NOW,
    )!;
    expect(half.tag).toBe('half time');
    expect(half.rows.at(-1)).toEqual({ divider: true, key: 'half-time', label: 'Half time 10–7' });
    const old = new Date(NOW - STALE_MS - 1000).toISOString();
    expect(scoringView(FIXTURE, section({ fetchedAt: old }), NOW)!.tag).toBe('delayed');
    const waiting = scoringView(FIXTURE, section({ state: 'scheduled', events: [] }), NOW)!;
    expect(waiting.empty).toBe('Scores appear here from kickoff.');
    const fallback = scoringView(
      FIXTURE,
      section({ source: 'ESPN', timeline: false, events: [] }),
      NOW,
    )!;
    expect(fallback.rows).toEqual([]);
    expect(fallback.empty).toContain('score comes from ESPN');
    const down = scoringView(
      FIXTURE,
      { status: 'unavailable', source: 'x', fetchedAt: null },
      NOW,
    )!;
    expect(down.tag).toBe('unavailable');
  });
});
