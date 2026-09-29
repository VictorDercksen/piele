import type { components } from './generated';
/** Contracts of `GET /v1/competitions/{competitionId}/matches/{fixtureId}` and `GET /v1/competitions/{competitionId}/rounds/{round}/scores` in the Python API. */

export type SectionStatus = components['schemas']['Section']['status'];

export interface Section {
  readonly status: SectionStatus;
  readonly source: string;
  readonly fetchedAt: string | null;
}

export interface TeamsheetPlayer {
  readonly number: number;
  readonly name: string;
  readonly position: string | null;
  readonly captain: boolean;
  /** `YYYY-MM-DD`. Absent from snapshots cached before the feed lookup existed. */
  readonly dateOfBirth?: string | null;
  /** Country of birth as the URC feed names it; the feed has no reliable nationality. */
  readonly birthCountry?: string | null;
}

export interface Teamsheet {
  readonly starters: readonly TeamsheetPlayer[];
  readonly replacements: readonly TeamsheetPlayer[];
}

export interface TeamsheetsSection extends Section {
  readonly home?: Teamsheet;
  readonly away?: Teamsheet;
}

export interface WeatherSection extends Section {
  readonly forecastHourUtc?: string;
  readonly stadium?: string;
  readonly city?: string;
  readonly temperatureC?: number | null;
  readonly feelsLikeC?: number | null;
  readonly rainChancePercent?: number | null;
  readonly precipitationMm?: number | null;
  readonly windKmh?: number | null;
  readonly gustKmh?: number | null;
  readonly weatherCode?: number | null;
  readonly condition?: string;
  readonly isDay?: boolean | null;
}

export type MatchState =
  'scheduled' | 'live' | 'half_time' | 'full_time' | 'postponed' | 'cancelled';

export type SideScore = components['schemas']['SideScore'];

export type MatchScore = Omit<components['schemas']['MatchScore'], 'fixtureId'>;

export type ScoreEventKind =
  'try' | 'penalty_try' | 'conversion' | 'penalty_goal' | 'drop_goal' | 'yellow_card' | 'red_card';

/** A scoring event or card. `score` is the running score after it, or null for cards. */
export interface ScoreEvent {
  readonly id: number | null;
  readonly minute: number | null;
  /** Display minute, for example `80+1`. */
  readonly time: string;
  readonly period: string | null;
  readonly side: 'home' | 'away' | null;
  readonly kind: ScoreEventKind;
  readonly points: number;
  readonly player: string | null;
  readonly score: readonly [number, number] | null;
}

export interface ScoreSection extends Section, Partial<MatchScore> {
  readonly events?: readonly ScoreEvent[];
  /** False when the score comes from the ESPN fallback, which has no scoring timeline. */
  readonly timeline?: boolean;
}

export type RoundMatchScore = components['schemas']['MatchScore'];

export type RoundScores = components['schemas']['RoundScores'];

/** Contract of `GET /v1/competitions/{competitionId}/rounds/{round}/weather`: each fixture's kickoff forecast. */
export type FixtureWeather = components['schemas']['FixtureWeather'];

export type RoundWeather = components['schemas']['RoundWeather'];

export type MatchCentreClub = components['schemas']['ClubView'];

/** Provider section extras are not described by OpenAPI and remain explicit view contracts. */
export type MatchCentre = Omit<
  components['schemas']['MatchCentre'],
  'teamsheets' | 'weather' | 'score'
> & {
  readonly teamsheets: TeamsheetsSection;
  readonly weather: WeatherSection;
  readonly score?: ScoreSection;
};

/**
 * Contract of `GET /v1/competitions/{competitionId}/matches/{fixtureId}/preview`. Written by the preview agent from
 * public sources; render every field as plain text.
 */
export type PreviewSource = components['schemas']['Source'];

export type PreviewFactor = components['schemas']['Factor'];

export type PreviewMood = components['schemas']['Mood'];

export type MatchPreview = components['schemas']['PreviewView'];

export type MatchPreviewResponse = components['schemas']['MatchPreview'];

/** Contract of `GET /v1/competitions/{competitionId}/rounds/{round}/updates`: the round's competition milestones. */
export type RoundEventKind =
  'teamsheets_published' | 'preview_published' | 'kicked_off' | 'full_time';

export type RoundEvent = components['schemas']['RoundEvent'];

export type RoundUpdates = components['schemas']['RoundUpdates'];
