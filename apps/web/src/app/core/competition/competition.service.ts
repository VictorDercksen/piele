import { Injectable } from '@angular/core';
import { URC_SCHEDULE } from './urc-fixtures';
import { club } from './teams';
import { CompetitionRound, Fixture } from './competition.models';

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

/** A match is treated as in progress for this long after kickoff. */
const MATCH_LENGTH_MS = 2 * 60 * 60_000;

/**
 * The round containing a match in progress or the next scheduled kickoff, else the final
 * regular round. A round stays current until its last match has had time to finish.
 */
export function currentRoundId(now = Date.now()): number {
  return (
    URC_SCHEDULE.fixtures
      .filter((m) => m.kickoffUtc && new Date(m.kickoffUtc).getTime() + MATCH_LENGTH_MS >= now)
      .sort((a, b) => a.kickoffUtc!.localeCompare(b.kickoffUtc!))[0]?.round ?? REGULAR_ROUNDS
  );
}

/** The earliest published kickoff of a round as a UTC instant, or null when none is known. */
export function firstKickoff(roundId: number): string | null {
  const times = URC_SCHEDULE.fixtures
    .filter((m) => m.round === roundId && m.kickoffUtc)
    .map((m) => m.kickoffUtc!)
    .sort();
  return times[0] ?? null;
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

  /** The fixture with this ID and the round it belongs to. */
  locate(fixtureId: string): { round: CompetitionRound; fixture: Fixture } | undefined {
    for (const round of this.rounds) {
      const fixture = round.fixtures.find((f) => f.id === fixtureId);
      if (fixture) return { round, fixture };
    }
    return undefined;
  }
}
