import { URC_SCHEDULE } from './urc-fixtures';
import { club } from './teams';
import type { SeasonRound } from './season-preview';

const dateFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Africa/Johannesburg',
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});
const dayFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Africa/Johannesburg',
  weekday: 'short',
  day: '2-digit',
  month: 'short',
});
const timeFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Africa/Johannesburg',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});
export const CURRENT_ROUND =
  URC_SCHEDULE.fixtures
    .filter((m) => m.kickoffUtc && new Date(m.kickoffUtc).getTime() >= Date.now())
    .sort((a, b) => a.kickoffUtc!.localeCompare(b.kickoffUtc!))[0]?.round ?? 18;
export const COMPETITION_ROUNDS: readonly SeasonRound[] = Array.from({ length: 21 }, (_, index) => {
  const id = index + 1;
  const matches = URC_SCHEDULE.fixtures.filter((m) => m.round === id);
  const times = matches
    .map((m) => m.kickoffUtc)
    .filter((value): value is NonNullable<typeof value> => !!value)
    .sort();
  const code = id <= 18 ? String(id).padStart(2, '0') : ['QF', 'SF', 'F'][id - 19];
  const title =
    id <= 18 ? `Round ${code}` : ['Quarter-finals', 'Semi-finals', 'Grand final'][id - 19];
  const dates = times.length
    ? dateFormat.formatRange(new Date(times[0]), new Date(times[times.length - 1]))
    : ['28–29 May 2027', '05 Jun 2027', '19 Jun 2027'][id - 19];
  return {
    id,
    code,
    title,
    dates,
    status: id === CURRENT_ROUND ? 'Current' : 'Upcoming',
    deadline: 'Not confirmed by the captain',
    fixtures: matches.map((m) => ({
      id: m.id,
      home: club(m.homeId ?? '')?.shortName ?? 'To be confirmed',
      away: club(m.awayId ?? '')?.shortName ?? 'To be confirmed',
      homeAsset: m.homeId ?? 'tbc',
      awayAsset: m.awayId ?? 'tbc',
      day: m.kickoffUtc ? dayFormat.format(new Date(m.kickoffUtc)).toUpperCase() : dates,
      time: m.kickoffUtc ? timeFormat.format(new Date(m.kickoffUtc)) : 'TBC',
      kickoffUtc: m.kickoffUtc,
      venue: m.venue ?? 'Venue to be confirmed',
    })),
    members: [],
    duties: [],
    reviews: [],
    activity:
      id <= 18
        ? `${matches.length} published fixtures. League results, duties and decisions have not been recorded.`
        : 'Playoff window published. Teams, venues and kickoffs are to be confirmed.',
  };
});
