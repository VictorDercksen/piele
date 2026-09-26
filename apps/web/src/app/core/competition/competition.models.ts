import { MatchState } from '../api/match-centre.models';

export type RoundStatus = 'Completed' | 'Current' | 'Upcoming';

export interface Fixture {
  readonly id: string;
  readonly kickoffUtc: string | null;
  readonly home: string;
  readonly away: string;
  readonly homeAsset: string;
  readonly awayAsset: string;
  readonly day: string;
  readonly time: string;
  readonly venue: string;
  /** `home–away` once the match has started. */
  readonly score?: string;
  /** Live state from the league API; absent until the round has started. */
  readonly state?: MatchState;
  /** Match minute while live. */
  readonly minute?: number | null;
}

export interface CompetitionRound {
  readonly id: number;
  readonly code: string;
  readonly title: string;
  readonly dates: string;
  readonly status: RoundStatus;
  readonly fixtures: readonly Fixture[];
}

/** A club in a competition's catalogue, with the artwork paths the app shows for it. */
export interface ClubTeam {
  readonly id: string;
  readonly sourceId: number;
  readonly name: string;
  readonly shortName: string;
  readonly colour: string;
  readonly accent: string;
  readonly jersey: string;
  /** Square club artwork used for member avatars. */
  readonly avatar: string;
  readonly stadiumBackground: string;
  readonly illustrated: boolean;
}

/** Official club banner artwork for the match hero and teamsheets. */
export interface ClubBanner {
  readonly name: string;
  readonly colour: string;
  readonly pattern: string;
  readonly crest: string;
}

/** A country with a flag shipped in public/assets/images/flags. */
export interface Country {
  readonly name: string;
  readonly flag: string;
}

/** A competition's venues, looked up by name regardless of case. */
export interface StadiumCatalogue {
  /** The country of a known venue, or undefined for an unconfirmed or unknown one. */
  country(venue: string | null | undefined): Country | undefined;
  /** The icon of a known venue, or undefined for an unconfirmed or unknown one. */
  icon(venue: string | null | undefined): string | undefined;
  /** Match-night artwork for the actual venue. Alternate grounds have none. */
  background(venue: string | null | undefined): string | undefined;
}

/** Flags for the country names a competition's player feed reports. */
export interface CountryCatalogue {
  named(name: string | null | undefined): Country | undefined;
}

/** One match as the imported schedule records it. Times are UTC; unknowns stay unknown. */
export interface ScheduledMatch {
  readonly id: string;
  readonly round: number;
  readonly homeId?: string | null;
  readonly awayId?: string | null;
  readonly kickoffUtc?: string | null;
  readonly dateConfirmed?: boolean;
  readonly venue?: string | null;
}

/** A knockout round after the regular season. */
export interface PlayoffRound {
  readonly code: string;
  readonly title: string;
  /** Shown until the schedule publishes kickoffs for the round. */
  readonly dates: string;
}

export interface FixtureLocation {
  readonly round: CompetitionRound;
  readonly fixture: Fixture;
}

/**
 * A rugby competition: its schedule, rounds, clubs, venues and artwork. Registered in
 * `registry.ts` by id; a league's active season points at one.
 */
export interface Competition {
  readonly id: string;
  readonly name: string;
  readonly shortName: string;
  /** `2026/27`. */
  readonly season: string;
  /** The official schedule source. */
  readonly source: string;
  /** The date the schedule snapshot was checked, `YYYY-MM-DD`. */
  readonly retrievedAt: string;
  /** The competition's own display zone; a league's zone takes precedence. */
  readonly timezone: string;
  readonly regularRounds: number;
  readonly lastRound: number;
  readonly playoffs: readonly PlayoffRound[];
  readonly fixtures: readonly ScheduledMatch[];
  /** Regular-season fixtures in the schedule. */
  readonly fixtureCount: number;
  /** Playoff fixtures in the schedule, whether or not their teams are known. */
  readonly playoffSlots: number;
  /** Rounds displayed in the competition's zone, with statuses as of first use. */
  readonly rounds: readonly CompetitionRound[];
  readonly teams: readonly ClubTeam[];
  readonly stadiums: StadiumCatalogue;
  readonly banners: Readonly<Record<string, ClubBanner>>;
  readonly countries: CountryCatalogue;
  /** The match ball for loaders. */
  readonly ball: string;
  readonly emblem: string;
  team(id: string | null | undefined): ClubTeam | undefined;
  /** The club's jersey, else the placeholder for an unconfirmed side. */
  jersey(id: string | null | undefined): string;
  /** `01` to the last regular round, then the playoff codes (`QF`, `SF`, `F`). */
  roundCode(roundId: number): string;
  /**
   * The round containing a match in progress or the next scheduled kickoff, else the final
   * regular round.
   */
  currentRoundId(now?: number): number;
  /** The earliest published kickoff of a round as a UTC instant, or null when none is known. */
  firstKickoff(roundId: number): string | null;
  /** Every round with its fixtures, displayed in the zone, statuses relative to `current`. */
  buildRounds(current: number, zone?: string): readonly CompetitionRound[];
  /** The fixture with this id and its round, from `rounds`. */
  locate(fixtureId: string, rounds?: readonly CompetitionRound[]): FixtureLocation | undefined;
}
