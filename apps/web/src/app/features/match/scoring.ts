import { ScoreEvent, ScoreEventKind, ScoreSection } from '../../core/api/match-centre.models';
import { Competition, Fixture } from '../../core/competition/competition.models';

/** A live score older than this is labelled as delayed. */
export const STALE_MS = 2 * 60_000;
/** The panel appears this long before kickoff. */
export const SHOW_BEFORE_KICKOFF_MS = 10 * 60_000;

/** Kickoff sits at the top try line and full time at the bottom one, this far apart per minute. */
export const PX_PER_MINUTE = 12;
/** Space between the try lines and the first and last possible row. */
const FIELD_PAD = 30;
export const ROW_HEIGHT = { try: 50, slim: 30 } as const;
/** Space between rows on the same side. */
const ROW_GAP = 6;
/** Space kept clear either side of the halfway line and the live marker. */
const LINE_GAP = 12;
const FULL_TIME = 80;
const HALF_TIME = 40;

/** Pitch lines as metres from the top try line over 100 m, which maps onto 80 minutes. */
const LINES: readonly { kind: PitchLine['kind']; at: number; paint: string | null }[] = [
  { kind: 'l22', at: 17.6, paint: '22' },
  { kind: 'l10', at: 32, paint: '10' },
  { kind: 'half', at: HALF_TIME, paint: null },
  { kind: 'l10', at: 48, paint: '10' },
  { kind: 'l22', at: 62.4, paint: '22' },
];

export interface ScoringView {
  readonly tag: string;
  readonly live: boolean;
  readonly stale: boolean;
  readonly home: SideView;
  readonly away: SideView;
  /** Scoring events and cards in match order, placed on the pitch. */
  readonly rows: readonly PitchRow[];
  readonly latest: PitchRow | null;
  readonly lines: readonly PitchLine[];
  /** The current minute while the match clock runs. */
  readonly marker: PitchMarker | null;
  /** Height of the field between the try lines, in pixels. */
  readonly fieldHeight: number;
  readonly finished: boolean;
  /** Label for the bottom in-goal area. */
  readonly result: string;
  /** Shown when there are no rows. */
  readonly empty: string | null;
}

export interface SideView {
  readonly name: string;
  readonly crest: string | undefined;
  readonly colour: string;
  readonly accent: string;
  /** Current points, or a dash before kickoff. */
  readonly score: string;
}

export interface PitchRow {
  readonly key: string;
  readonly side: 'home' | 'away';
  readonly team: string;
  /** Display minute, for example `80+1`. */
  readonly time: string;
  readonly label: string;
  /** Label for narrow screens. */
  readonly short: string;
  readonly player: string | null;
  readonly surname: string | null;
  readonly points: number;
  /** Tries get a full row; kicks and cards a slim one. */
  readonly try: boolean;
  readonly card: 'yellow' | 'red' | null;
  /** Running score after the event, home first. */
  readonly score: readonly [number, number] | null;
  readonly colour: string;
  readonly accent: string;
  /** Top edge on the field, in pixels. */
  readonly top: number;
  /** Position along the summary timeline, as a percentage of the match. */
  readonly x: number;
}

export interface PitchLine {
  readonly key: string;
  readonly kind: 'l22' | 'l10' | 'half';
  readonly paint: string | null;
  readonly top: number;
  /** Not yet reached in a live match. */
  readonly future: boolean;
  /** Text on the line: the half-time score, or the empty message on the halfway line. */
  readonly label: string | null;
  readonly message: boolean;
}

export interface PitchMarker {
  readonly top: number;
  readonly x: number;
  readonly label: string;
}

const LABELS: Record<ScoreEventKind, string> = {
  try: 'Try',
  penalty_try: 'Penalty try',
  conversion: 'Conversion',
  penalty_goal: 'Penalty goal',
  drop_goal: 'Drop goal',
  yellow_card: 'Yellow card',
  red_card: 'Red card',
};

const SHORT: Record<ScoreEventKind, string> = {
  try: 'Try',
  penalty_try: 'Pen. try',
  conversion: 'Conv.',
  penalty_goal: 'Pen.',
  drop_goal: 'Drop',
  yellow_card: 'Yellow',
  red_card: 'Red',
};

const POINTS: Record<ScoreEventKind, number> = {
  try: 5,
  penalty_try: 7,
  conversion: 2,
  penalty_goal: 3,
  drop_goal: 3,
  yellow_card: 0,
  red_card: 0,
};

const TAGS: Record<string, string> = {
  scheduled: 'awaiting kickoff',
  live: 'live',
  half_time: 'half time',
  full_time: 'full time',
  postponed: 'postponed',
  cancelled: 'cancelled',
};

const FALLBACK_COLOUR = '#3b5a63';
const FALLBACK_ACCENT = '#9fb6b0';

/**
 * The scoring panel for a fixture, or null while it is hidden: until ten minutes before
 * kickoff, and while the API reports the scores as too early.
 */
export function scoringView(
  competition: Competition,
  fixture: Fixture,
  section: ScoreSection | undefined,
  now: number,
  kickoffUtc: string | null = fixture.kickoffUtc,
): ScoringView | null {
  if (!section || section.status === 'too_early') return null;
  const kickoff = kickoffUtc ? Date.parse(kickoffUtc) : Number.NaN;
  if (now < kickoff - SHOW_BEFORE_KICKOFF_MS) return null;

  const home = side(competition, fixture, 'home', section);
  const away = side(competition, fixture, 'away', section);
  const centre = `${competition.shortName} match centre`;
  if (section.status !== 'ok') {
    return {
      tag: 'unavailable',
      live: false,
      stale: false,
      home,
      away,
      rows: [],
      latest: null,
      lines: pitchLines(null, null, `Live scores could not be loaded from the ${centre}.`),
      marker: null,
      fieldHeight: fieldHeight([]),
      finished: false,
      result: 'Full time',
      empty: `Live scores could not be loaded from the ${centre}.`,
    };
  }

  const state = section.state ?? 'scheduled';
  const live = state === 'live' || state === 'half_time';
  const fetched = section.fetchedAt ? Date.parse(section.fetchedAt) : now;
  const stale = live && now - fetched > STALE_MS;
  const events = (section.events ?? []).map((e) => placedEvent(e)).filter((e) => e !== null);
  const clock =
    state === 'live' && section.minute !== null && section.minute !== undefined
      ? Math.min(Math.max(section.minute, 0), FULL_TIME)
      : null;
  const secondHalf =
    events.some((e) => e.half === 2) ||
    state === 'half_time' ||
    state === 'full_time' ||
    (clock !== null && clock > HALF_TIME);
  const halfTime = secondHalf ? halfTimeLabel(section) : null;
  const noTimeline = section.timeline === false && state !== 'scheduled';
  const empty = events.length
    ? null
    : noTimeline
      ? `The ${centre} is unreachable, so the score comes from ${section.source} and the scoring timeline is unavailable.`
      : state === 'scheduled'
        ? 'Scores appear here from kickoff.'
        : state === 'postponed' || state === 'cancelled'
          ? `The match has been ${state}.`
          : 'No points scored yet.';
  const rows = layout(competition, fixture, events, clock);
  const score = state === 'scheduled' ? null : scoreOf(section);
  return {
    tag: stale ? 'delayed' : (TAGS[state] ?? state.replace('_', ' ')),
    live,
    stale,
    home,
    away,
    rows,
    latest: rows.at(-1) ?? null,
    lines: pitchLines(clock, halfTime, empty),
    marker: clock === null ? null : { top: y(clock), x: x(clock), label: `${clock}' live` },
    fieldHeight: fieldHeight(rows),
    finished: state === 'full_time',
    result: state === 'full_time' && score ? `Full time · ${score[0]}–${score[1]}` : 'Full time',
    empty,
  };
}

interface PlacedEvent {
  readonly event: ScoreEvent & { readonly side: 'home' | 'away' };
  /** Minute on the pitch: first-half stoppage time stays on the kickoff side of halfway. */
  readonly t: number;
  readonly half: 1 | 2;
}

function placedEvent(event: ScoreEvent): PlacedEvent | null {
  const side = event.side;
  if (!side) return null;
  const minute = event.minute ?? Number.parseInt(event.time, 10);
  const m = Number.isFinite(minute) ? Math.max(minute, 0) : 0;
  const half = event.period === 'first half' || (!event.period && m <= HALF_TIME) ? 1 : 2;
  const t = half === 1 ? Math.min(m, HALF_TIME) : Math.min(Math.max(m, HALF_TIME), FULL_TIME);
  return { event: { ...event, side }, t, half };
}

const y = (t: number) => FIELD_PAD + t * PX_PER_MINUTE;
const x = (t: number) => (Math.min(Math.max(t, 0), FULL_TIME) / FULL_TIME) * 100;

/**
 * Places each row at its minute. Rows on one side never overlap, and none crosses the
 * halfway line or the live marker: a row that would is held back and earlier rows on its
 * side move up to make room.
 */
function layout(
  competition: Competition,
  fixture: Fixture,
  events: readonly PlacedEvent[],
  clock: number | null,
) {
  const barriers = [HALF_TIME, ...(clock === null ? [] : [clock])].sort((a, b) => a - b);
  const placed: Record<'home' | 'away', { centre: number; height: number; row: PitchRowBase }[]> = {
    home: [],
    away: [],
  };
  const order: { side: 'home' | 'away'; index: number }[] = [];
  for (const { event, t, half } of events) {
    const row = pitchRow(competition, fixture, event, t);
    const height = row.try ? ROW_HEIGHT.try : ROW_HEIGHT.slim;
    // A second-half event at exactly 40 minutes belongs below the halfway line.
    const past = (b: number) => b < t || (half === 2 && b === HALF_TIME);
    const before = barriers.filter(past);
    const after = barriers.filter((b) => !past(b));
    const min = before.length ? y(before.at(-1)!) + height / 2 + LINE_GAP : height / 2 + ROW_GAP;
    const max = after.length ? y(after[0]) - height / 2 - LINE_GAP : Infinity;
    const list = placed[event.side];
    const prev = list.at(-1);
    let centre = Math.max(
      y(t),
      min,
      prev ? prev.centre + prev.height / 2 + height / 2 + ROW_GAP : 0,
    );
    if (centre > max) {
      centre = max;
      let below: { centre: number; height: number } = { centre, height };
      for (let i = list.length - 1; i >= 0; i--) {
        const limit = below.centre - below.height / 2 - list[i].height / 2 - ROW_GAP;
        if (list[i].centre <= limit) break;
        list[i].centre = limit;
        below = list[i];
      }
    }
    order.push({ side: event.side, index: list.length });
    list.push({ centre, height, row });
  }
  return order.map(({ side, index }) => {
    const { centre, height, row } = placed[side][index];
    return { ...row, top: centre - height / 2 };
  });
}

type PitchRowBase = Omit<PitchRow, 'top'>;

function pitchRow(
  competition: Competition,
  fixture: Fixture,
  event: ScoreEvent & { side: 'home' | 'away' },
  t: number,
): PitchRowBase {
  const clubId = event.side === 'home' ? fixture.homeAsset : fixture.awayAsset;
  const colours = competition.team(clubId);
  const points = event.points || POINTS[event.kind];
  return {
    key: `${event.id ?? `${event.time}-${event.kind}-${event.side}`}`,
    side: event.side,
    team: event.side === 'home' ? fixture.home : fixture.away,
    time: event.time,
    label: LABELS[event.kind],
    short: SHORT[event.kind],
    player: event.player,
    surname: event.player ? surname(event.player) : null,
    points,
    try: event.kind === 'try' || event.kind === 'penalty_try',
    card: event.kind === 'yellow_card' ? 'yellow' : event.kind === 'red_card' ? 'red' : null,
    score: event.score,
    colour: colours?.colour ?? FALLBACK_COLOUR,
    accent: colours?.accent ?? FALLBACK_ACCENT,
    x: x(t),
  };
}

/** `J. van Wyk` becomes `van Wyk`; a single name stays whole. */
function surname(player: string): string {
  const parts = player.trim().split(/\s+/);
  return parts.length > 1 && /^\p{L}\.?$/u.test(parts[0]) ? parts.slice(1).join(' ') : player;
}

function side(
  competition: Competition,
  fixture: Fixture,
  which: 'home' | 'away',
  section: ScoreSection,
): SideView {
  const clubId = which === 'home' ? fixture.homeAsset : fixture.awayAsset;
  const colours = competition.team(clubId);
  const points = section.state === 'scheduled' ? null : section[which]?.score;
  return {
    name: which === 'home' ? fixture.home : fixture.away,
    crest: competition.banners[clubId]?.crest,
    colour: colours?.colour ?? FALLBACK_COLOUR,
    accent: colours?.accent ?? FALLBACK_ACCENT,
    score: points === null || points === undefined ? '–' : String(points),
  };
}

function scoreOf(section: ScoreSection): readonly [number, number] | null {
  const home = section.home?.score;
  const away = section.away?.score;
  return home === null || home === undefined || away === null || away === undefined
    ? null
    : [home, away];
}

function halfTimeLabel(section: ScoreSection): string {
  const home = section.home?.halfTime;
  const away = section.away?.halfTime;
  const score = home !== null && home !== undefined && away !== null && away !== undefined;
  return score ? `Half time ${home}–${away}` : 'Half time';
}

function pitchLines(
  clock: number | null,
  halfTime: string | null,
  empty: string | null,
): PitchLine[] {
  return LINES.map((line) => {
    const message = line.kind === 'half' && !!empty && !halfTime;
    return {
      key: `${line.kind}-${line.at}`,
      kind: line.kind,
      paint: line.paint,
      top: y(line.at),
      future: clock !== null && line.at > clock,
      label: line.kind === 'half' ? (halfTime ?? (message ? empty : null)) : null,
      message,
    };
  });
}

function fieldHeight(rows: readonly PitchRow[]): number {
  const bottom = rows.reduce(
    (max, row) => Math.max(max, row.top + (row.try ? ROW_HEIGHT.try : ROW_HEIGHT.slim)),
    0,
  );
  return Math.max(y(FULL_TIME) + FIELD_PAD, bottom + LINE_GAP);
}
