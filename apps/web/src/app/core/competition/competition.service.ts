import { Injectable } from '@angular/core';
import { URC_SCHEDULE } from './urc-fixtures';
import { club } from './teams';
import { CompetitionRound } from './competition.models';

const ZONE = 'Africa/Johannesburg';
const dateFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: ZONE,
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});
const dayFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: ZONE,
  weekday: 'short',
  day: '2-digit',
  month: 'short',
});
const timeFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});
const REGULAR_ROUNDS = 18;
const PLAYOFFS = [
  { code: 'QF', title: 'Quarter-finals', dates: '28–29 May 2027' },
  { code: 'SF', title: 'Semi-finals', dates: '05 Jun 2027' },
  { code: 'F', title: 'Grand final', dates: '19 Jun 2027' },
];

/** The round containing the next scheduled kickoff, or the final regular round. */
export function currentRoundId(now = Date.now()): number {
  return (
    URC_SCHEDULE.fixtures
      .filter((m) => m.kickoffUtc && new Date(m.kickoffUtc).getTime() >= now)
      .sort((a, b) => a.kickoffUtc!.localeCompare(b.kickoffUtc!))[0]?.round ?? REGULAR_ROUNDS
  );
}

/** Builds the published schedule. Times are UTC in the source and displayed in SAST. */
export function buildRounds(current: number): readonly CompetitionRound[] {
  return Array.from({ length: REGULAR_ROUNDS + PLAYOFFS.length }, (_, index) => {
    const id = index + 1;
    const playoff = PLAYOFFS[id - REGULAR_ROUNDS - 1];
    const matches = URC_SCHEDULE.fixtures.filter((m) => m.round === id);
    const times = matches
      .map((m) => m.kickoffUtc)
      .filter((value): value is NonNullable<typeof value> => !!value)
      .sort();
    const code = playoff?.code ?? String(id).padStart(2, '0');
    const dates = times.length
      ? dateFormat.formatRange(new Date(times[0]), new Date(times[times.length - 1]))
      : (playoff?.dates ?? 'Dates to be confirmed');
    return {
      id,
      code,
      title: playoff?.title ?? `Round ${code}`,
      dates,
      status: id === current ? 'Current' : id < current ? 'Completed' : 'Upcoming',
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
    };
  });
}

/** Published URC fixtures from the local official snapshot. */
@Injectable({ providedIn: 'root' })
export class CompetitionService {
  readonly season = URC_SCHEDULE.season;
  readonly source = URC_SCHEDULE.source;
  readonly retrievedAt = URC_SCHEDULE.retrievedAt;
  readonly currentRoundId = currentRoundId();
  readonly rounds = buildRounds(this.currentRoundId);
  readonly fixtureCount = URC_SCHEDULE.fixtures.filter((m) => m.round <= REGULAR_ROUNDS).length;

  round(id: number): CompetitionRound | undefined {
    return this.rounds[id - 1];
  }
}
