import { ScoreEvent, ScoreEventKind, ScoreSection } from '../../core/api/match-centre.models';
import { CLUB_BANNERS } from '../../core/competition/club-banners';
import { Fixture } from '../../core/competition/competition.models';
import { club } from '../../core/competition/teams';

/** A live score older than this is labelled as delayed. */
export const STALE_MS = 2 * 60_000;

export interface ScoringView {
  readonly tag: string;
  readonly live: boolean;
  readonly stale: boolean;
  readonly rows: readonly TimelineRow[];
  /** Shown when there are no rows. */
  readonly empty: string;
}

export type TimelineRow = EventRow | DividerRow;

export interface EventRow {
  readonly divider: false;
  readonly key: string;
  readonly side: 'home' | 'away';
  readonly time: string;
  readonly label: string;
  readonly team: string;
  readonly player: string | null;
  readonly crest: string | undefined;
  readonly accent: string | undefined;
  readonly card: 'yellow' | 'red' | null;
  /** Running score after the event, `home–away`. */
  readonly score: string | null;
}

export interface DividerRow {
  readonly divider: true;
  readonly key: string;
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

const TAGS: Record<string, string> = {
  scheduled: 'awaiting kickoff',
  live: 'live',
  half_time: 'half time',
  full_time: 'full time',
  postponed: 'postponed',
  cancelled: 'cancelled',
};

/**
 * The scoring panel for a fixture, or null before its kickoff window when the panel is
 * hidden. Events run in match order with a half-time divider once the second half starts.
 */
export function scoringView(
  fixture: Fixture,
  section: ScoreSection | undefined,
  now: number,
): ScoringView | null {
  if (!section || section.status === 'too_early') return null;
  if (section.status !== 'ok') {
    return {
      tag: 'unavailable',
      live: false,
      stale: false,
      rows: [],
      empty: 'Live scores could not be loaded from the URC match centre.',
    };
  }
  const state = section.state ?? 'scheduled';
  const live = state === 'live' || state === 'half_time';
  const fetched = section.fetchedAt ? Date.parse(section.fetchedAt) : now;
  const stale = live && now - fetched > STALE_MS;
  const events = section.events ?? [];
  const rows: TimelineRow[] = [];
  let secondHalf = false;
  for (const event of events) {
    if (!secondHalf && event.period && event.period !== 'first half') {
      secondHalf = true;
      rows.push(halfTime(section));
    }
    const row = eventRow(fixture, event);
    if (row) rows.push(row);
  }
  if (!secondHalf && (state === 'half_time' || (state === 'full_time' && rows.length))) {
    rows.push(halfTime(section));
  }
  const noTimeline = section.timeline === false && state !== 'scheduled';
  return {
    tag: stale ? 'delayed' : (TAGS[state] ?? state.replace('_', ' ')),
    live,
    stale,
    rows,
    empty: noTimeline
      ? `The URC match centre is unreachable, so the score comes from ${section.source} and the scoring timeline is unavailable.`
      : state === 'scheduled'
        ? 'Scores appear here from kickoff.'
        : state === 'postponed' || state === 'cancelled'
          ? `The match has been ${state}.`
          : 'No points scored yet.',
  };
}

function halfTime(section: ScoreSection): DividerRow {
  const home = section.home?.halfTime;
  const away = section.away?.halfTime;
  const score = home !== null && home !== undefined && away !== null && away !== undefined;
  return {
    divider: true,
    key: 'half-time',
    label: score ? `Half time ${home}–${away}` : 'Half time',
  };
}

function eventRow(fixture: Fixture, event: ScoreEvent): EventRow | null {
  if (!event.side) return null;
  const clubId = event.side === 'home' ? fixture.homeAsset : fixture.awayAsset;
  return {
    divider: false,
    key: `${event.id ?? `${event.time}-${event.kind}`}`,
    side: event.side,
    time: event.time,
    label: LABELS[event.kind],
    team: event.side === 'home' ? fixture.home : fixture.away,
    player: event.player,
    crest: CLUB_BANNERS[clubId]?.crest,
    accent: club(clubId)?.accent,
    card: event.kind === 'yellow_card' ? 'yellow' : event.kind === 'red_card' ? 'red' : null,
    score: event.score ? `${event.score[0]}–${event.score[1]}` : null,
  };
}
