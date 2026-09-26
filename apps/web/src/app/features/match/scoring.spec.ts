import { ScoreEvent, ScoreSection } from '../../core/api/match-centre.models';
import { Fixture } from '../../core/competition/competition.models';
import {
  PX_PER_MINUTE,
  ROW_HEIGHT,
  SHOW_BEFORE_KICKOFF_MS,
  STALE_MS,
  scoringView,
} from './scoring';

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
  const kickoff = Date.parse(FIXTURE.kickoffUtc!);
  const waiting = () => section({ state: 'scheduled', minute: null, events: [] });

  it('stays hidden until ten minutes before kickoff', () => {
    expect(scoringView(FIXTURE, undefined, NOW)).toBeNull();
    expect(
      scoringView(FIXTURE, { status: 'too_early', source: 'x', fetchedAt: null }, NOW),
    ).toBeNull();
    expect(scoringView(FIXTURE, waiting(), kickoff - SHOW_BEFORE_KICKOFF_MS - 1)).toBeNull();
    const open = scoringView(FIXTURE, waiting(), kickoff - SHOW_BEFORE_KICKOFF_MS)!;
    expect(open.tag).toBe('awaiting kickoff');
    expect(open.home.score).toBe('–');
    expect(open.empty).toBe('Scores appear here from kickoff.');
    expect(open.lines.find((l) => l.kind === 'half')?.label).toBe(open.empty);
    // A moved kickoff from the match centre wins over the fixture list.
    const later = new Date(kickoff + 60 * 60_000).toISOString();
    expect(scoringView(FIXTURE, waiting(), kickoff, later)).toBeNull();
  });

  it('places events by side and minute, with half time on the halfway line', () => {
    const view = scoringView(FIXTURE, section(), NOW)!;
    expect(view.tag).toBe('live');
    expect(view.home.score).toBe('13');
    expect(view.away.score).toBe('7');
    expect(view.rows.map((r) => `${r.side} ${r.label}`)).toEqual([
      'home Penalty goal',
      'away Try',
      'home Yellow card',
      'home Penalty goal',
    ]);
    const [kick, tr, card, second] = view.rows;
    expect(tr.try).toBe(true);
    expect(tr.points).toBe(5);
    expect(tr.score).toEqual([3, 5]);
    expect(tr.team).toBe('Dragons');
    expect(kick.try).toBe(false);
    expect(kick.short).toBe('Pen.');
    expect(card.card).toBe('yellow');
    expect(card.score).toBeNull();
    expect(view.latest).toBe(second);

    const half = view.lines.find((l) => l.kind === 'half')!;
    expect(half.label).toBe('Half time 10–7');
    expect(card.top + ROW_HEIGHT.slim).toBeLessThan(half.top);
    expect(second.top).toBeGreaterThan(half.top);
    // Rows sit at their minute when nothing is in the way.
    expect(kick.top + ROW_HEIGHT.slim / 2).toBe(30 + 6 * PX_PER_MINUTE);
    expect(tr.x).toBe((18 / 80) * 100);

    expect(view.marker?.label).toBe("55' live");
    expect(view.lines.filter((l) => l.future).map((l) => l.paint)).toEqual(['22']);
  });

  it('keeps rows on one side apart and on their side of the halfway line', () => {
    const events = [
      event(1, '36', 'away', 'try', 'first half', [0, 5]),
      event(2, '37', 'away', 'conversion', 'first half', [0, 7]),
      event(3, '40+2', 'away', 'penalty_goal', 'first half', [0, 10]),
      event(4, '41', 'home', 'try', 'second half', [5, 10]),
    ];
    const view = scoringView(FIXTURE, section({ state: 'full_time', minute: null, events }), NOW)!;
    const half = view.lines.find((l) => l.kind === 'half')!.top;
    const height = (r: { try: boolean }) => (r.try ? ROW_HEIGHT.try : ROW_HEIGHT.slim);
    const away = view.rows.filter((r) => r.side === 'away');
    for (let i = 1; i < away.length; i++) {
      expect(away[i].top).toBeGreaterThanOrEqual(away[i - 1].top + height(away[i - 1]));
    }
    expect(away.at(-1)!.top + height(away.at(-1)!)).toBeLessThan(half);
    expect(view.rows.at(-1)!.top).toBeGreaterThan(half);
    expect(view.marker).toBeNull();
    expect(view.finished).toBe(true);
    expect(view.result).toBe('Full time · 13–7');
  });

  it('marks half time, delayed data and failures', () => {
    const half = scoringView(
      FIXTURE,
      section({ state: 'half_time', events: section().events!.slice(0, 2) }),
      NOW,
    )!;
    expect(half.tag).toBe('half time');
    expect(half.marker).toBeNull();
    expect(half.lines.find((l) => l.kind === 'half')?.label).toBe('Half time 10–7');
    const old = new Date(NOW - STALE_MS - 1000).toISOString();
    expect(scoringView(FIXTURE, section({ fetchedAt: old }), NOW)!.tag).toBe('delayed');
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
    expect(down.home.score).toBe('–');
  });
});
