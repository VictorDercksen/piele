import { Competition, Fixture } from '../../../core/competition/competition.models';
import { DEFAULT_ZONE, fixtureDayAndTime } from '../../../core/competition/league-time';
import { MemberPick } from '../../../core/league/league.models';
import { KickoffRulerView, RulerDot, RulerSlot } from './kickoff-ruler.models';

const weekdays = new Map<string, Intl.DateTimeFormat>();

/** `THU`: the weekday on the zone's clock. */
function weekday(instant: number, zone: string): string {
  let format = weekdays.get(zone);
  if (!format) {
    format = new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone: zone });
    weekdays.set(zone, format);
  }
  return format.format(instant).toUpperCase();
}

function dayAndTime(instant: number, zone: string): { day: string; time: string } {
  return {
    day: weekday(instant, zone),
    time: fixtureDayAndTime(new Date(instant).toISOString(), zone).time,
  };
}

/** The pick in words: `Glasgow by 7`, `Glasgow by 5 (default)`, `Draw`, `No pick`. */
function pickText(pick: MemberPick, fixture: Fixture, competition: Competition): string {
  if (pick.side === 'missed') return 'No pick';
  if (pick.side === 'draw') return 'Draw';
  const club = competition.team(pick.side === 'home' ? fixture.homeAsset : fixture.awayAsset);
  const name = club?.shortName ?? (pick.side === 'home' ? fixture.home : fixture.away);
  return `${name} by ${pick.margin}${pick.isDefault ? ' (default)' : ''}`;
}

function dot(
  fixture: Fixture,
  pick: MemberPick | null,
  locked: boolean,
  when: { day: string; time: string } | null,
  competition: Competition,
): RulerDot {
  const matchup = `${fixture.home} v ${fixture.away}`;
  if (pick && pick.side !== 'missed') {
    const clubId =
      pick.side === 'home' ? fixture.homeAsset : pick.side === 'away' ? fixture.awayAsset : null;
    return {
      fixtureId: fixture.id,
      state: 'picked',
      colour: competition.team(clubId)?.colour ?? null,
      crest: clubId ? (competition.banners[clubId]?.crest ?? null) : null,
      label: `${matchup}: ${pickText(pick, fixture, competition)}`,
    };
  }
  if (pick || locked) {
    return {
      fixtureId: fixture.id,
      state: 'missed',
      colour: null,
      crest: null,
      label: `${matchup}: no pick`,
    };
  }
  const locks = when ? `, locks ${when.day} ${when.time}` : '';
  return {
    fixtureId: fixture.id,
    state: 'open',
    colour: null,
    crest: null,
    label: `${matchup}: no pick yet${locks}`,
  };
}

/**
 * The member's picks for a round along its kickoffs, for the match hero's footer. Fixtures
 * sharing a kickoff share a slot, in kickoff order; fixtures without a kickoff share a trailing
 * `TBC` slot. A pick is open until its kickoff passes `now` and missed after that. Null for a
 * round without fixtures.
 */
export function kickoffRuler(
  fixtures: readonly Fixture[],
  myPick: (fixtureId: string) => MemberPick | null,
  competition: Competition,
  now: number,
  zone = DEFAULT_ZONE,
): KickoffRulerView | null {
  if (!fixtures.length) return null;
  const groups = new Map<number | null, Fixture[]>();
  for (const fixture of fixtures) {
    const kickoff = fixture.kickoffUtc ? Date.parse(fixture.kickoffUtc) : NaN;
    const key = Number.isNaN(kickoff) ? null : kickoff;
    groups.set(key, [...(groups.get(key) ?? []), fixture]);
  }
  const kickoffs = [...groups.keys()]
    .filter((key): key is number => key !== null)
    .sort((a, b) => a - b);
  let made = 0;
  let open = 0;
  let missed = 0;
  const slot = (key: number | null): RulerSlot => {
    const when = key === null ? null : dayAndTime(key, zone);
    const locked = key !== null && key <= now;
    const dots = groups.get(key)!.map((fixture) => {
      const d = dot(fixture, myPick(fixture.id), locked, when, competition);
      if (d.state === 'picked') made += 1;
      else if (d.state === 'open') open += 1;
      else missed += 1;
      return d;
    });
    return {
      key: key === null ? 'tbc' : String(key),
      day: when?.day ?? 'TBC',
      time: when?.time ?? '',
      open: dots.some((d) => d.state === 'open'),
      dots,
    };
  };
  const slots = kickoffs.map(slot);
  if (groups.has(null)) slots.push(slot(null));
  return {
    made,
    total: fixtures.length,
    open,
    missed,
    now: dayAndTime(now, zone),
    pin: kickoffs.filter((kickoff) => kickoff <= now).length,
    slots,
  };
}
