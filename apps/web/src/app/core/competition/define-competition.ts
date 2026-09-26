import {
  ClubBanner,
  ClubTeam,
  Competition,
  CompetitionRound,
  CountryCatalogue,
  FixtureLocation,
  PlayoffRound,
  ScheduledMatch,
  StadiumCatalogue,
} from './competition.models';
import { DEFAULT_ZONE, fixtureDayAndTime, formatLeagueDateRange } from './league-time';

/** A match is treated as in progress for this long after kickoff. */
const MATCH_LENGTH_MS = 2 * 60 * 60_000;

/** What a competition folder declares; `defineCompetition` derives the rest. */
export interface CompetitionSpec {
  readonly id: string;
  readonly name: string;
  readonly shortName: string;
  readonly timezone?: string;
  readonly schedule: {
    readonly season: string;
    readonly source: string;
    readonly retrievedAt: string;
    readonly fixtures: readonly ScheduledMatch[];
  };
  readonly regularRounds: number;
  readonly playoffs: readonly PlayoffRound[];
  readonly teams: readonly ClubTeam[];
  readonly stadiums: StadiumCatalogue;
  readonly banners: Readonly<Record<string, ClubBanner>>;
  readonly countries: CountryCatalogue;
  readonly ball: string;
  readonly emblem: string;
  /** Shown for a side that is not yet known. */
  readonly placeholderJersey: string;
}

/** Builds a registered competition from its schedule and catalogues. */
export function defineCompetition(spec: CompetitionSpec): Competition {
  return new ScheduledCompetition(spec);
}

class ScheduledCompetition implements Competition {
  readonly id: string;
  readonly name: string;
  readonly shortName: string;
  readonly season: string;
  readonly source: string;
  readonly retrievedAt: string;
  readonly timezone: string;
  readonly regularRounds: number;
  readonly lastRound: number;
  readonly playoffs: readonly PlayoffRound[];
  readonly fixtures: readonly ScheduledMatch[];
  readonly fixtureCount: number;
  readonly playoffSlots: number;
  readonly teams: readonly ClubTeam[];
  readonly stadiums: StadiumCatalogue;
  readonly banners: Readonly<Record<string, ClubBanner>>;
  readonly countries: CountryCatalogue;
  readonly ball: string;
  readonly emblem: string;
  private readonly placeholderJersey: string;
  private readonly byTeam: ReadonlyMap<string, ClubTeam>;
  private builtRounds?: readonly CompetitionRound[];

  constructor(spec: CompetitionSpec) {
    this.id = spec.id;
    this.name = spec.name;
    this.shortName = spec.shortName;
    this.season = spec.schedule.season;
    this.source = spec.schedule.source;
    this.retrievedAt = spec.schedule.retrievedAt;
    this.timezone = spec.timezone ?? DEFAULT_ZONE;
    this.regularRounds = spec.regularRounds;
    this.lastRound = spec.regularRounds + spec.playoffs.length;
    this.playoffs = spec.playoffs;
    this.fixtures = spec.schedule.fixtures;
    this.fixtureCount = this.fixtures.filter((m) => m.round <= this.regularRounds).length;
    this.playoffSlots = this.fixtures.length - this.fixtureCount;
    this.teams = spec.teams;
    this.stadiums = spec.stadiums;
    this.banners = spec.banners;
    this.countries = spec.countries;
    this.ball = spec.ball;
    this.emblem = spec.emblem;
    this.placeholderJersey = spec.placeholderJersey;
    this.byTeam = new Map(spec.teams.map((team) => [team.id, team]));
  }

  get rounds(): readonly CompetitionRound[] {
    return (this.builtRounds ??= this.buildRounds(this.currentRoundId()));
  }

  team(id: string | null | undefined): ClubTeam | undefined {
    return this.byTeam.get(id ?? '');
  }

  jersey(id: string | null | undefined): string {
    return this.team(id)?.jersey ?? this.placeholderJersey;
  }

  roundCode(roundId: number): string {
    return roundId <= this.regularRounds
      ? String(roundId).padStart(2, '0')
      : (this.playoffs[roundId - this.regularRounds - 1]?.code ?? String(roundId));
  }

  currentRoundId(now = Date.now()): number {
    return (
      this.fixtures
        .filter((m) => m.kickoffUtc && new Date(m.kickoffUtc).getTime() + MATCH_LENGTH_MS >= now)
        .sort((a, b) => a.kickoffUtc!.localeCompare(b.kickoffUtc!))[0]?.round ?? this.regularRounds
    );
  }

  firstKickoff(roundId: number): string | null {
    const times = this.fixtures
      .filter((m) => m.round === roundId && m.kickoffUtc)
      .map((m) => m.kickoffUtc!)
      .sort();
    return times[0] ?? null;
  }

  buildRounds(current: number, zone = this.timezone): readonly CompetitionRound[] {
    return Array.from({ length: this.lastRound }, (_, index) => {
      const id = index + 1;
      const playoff = this.playoffs[id - this.regularRounds - 1];
      const matches = this.fixtures.filter((m) => m.round === id);
      const times = matches
        .map((m) => m.kickoffUtc)
        .filter((value): value is string => !!value)
        .sort();
      const code = this.roundCode(id);
      const dates = times.length
        ? formatLeagueDateRange(times[0], times[times.length - 1], zone)
        : (playoff?.dates ?? 'Dates to be confirmed');
      return {
        id,
        code,
        title: playoff?.title ?? `Round ${code}`,
        dates,
        status: id === current ? 'Current' : id < current ? 'Completed' : 'Upcoming',
        fixtures: matches.map((m) => {
          const kickoff = m.kickoffUtc ? fixtureDayAndTime(m.kickoffUtc, zone) : null;
          return {
            id: m.id,
            home: this.team(m.homeId)?.shortName ?? 'To be confirmed',
            away: this.team(m.awayId)?.shortName ?? 'To be confirmed',
            homeAsset: m.homeId ?? 'tbc',
            awayAsset: m.awayId ?? 'tbc',
            day: kickoff?.day ?? dates,
            time: kickoff?.time ?? 'TBC',
            kickoffUtc: m.kickoffUtc ?? null,
            venue: m.venue ?? 'Venue to be confirmed',
          };
        }),
      };
    });
  }

  locate(fixtureId: string, rounds = this.rounds): FixtureLocation | undefined {
    for (const round of rounds) {
      const fixture = round.fixtures.find((f) => f.id === fixtureId);
      if (fixture) return { round, fixture };
    }
    return undefined;
  }
}
