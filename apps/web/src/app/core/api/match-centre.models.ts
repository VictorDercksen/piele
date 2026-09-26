/** Contracts of `GET /v1/competitions/{competitionId}/matches/{fixtureId}` and `GET /v1/competitions/{competitionId}/rounds/{round}/scores` in the Python API. */

export type SectionStatus = 'ok' | 'not_published' | 'too_early' | 'past' | 'unavailable';

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

export interface SideScore {
  readonly score: number | null;
  readonly halfTime: number | null;
}

export interface MatchScore {
  readonly state: MatchState;
  /** The feed's period name, for example `first half`. */
  readonly period: string | null;
  /** Match minute while live or at half time. */
  readonly minute: number | null;
  readonly clockRunning: boolean;
  readonly home: SideScore;
  readonly away: SideScore;
}

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

export interface RoundMatchScore extends MatchScore {
  readonly fixtureId: string;
}

export interface RoundScores {
  readonly round: number;
  readonly generatedAt: string;
  /** Feed status: `too_early` before the round's first kickoff window, `unavailable` on failure. */
  readonly status: SectionStatus;
  readonly source: string;
  readonly fetchedAt: string | null;
  readonly matches: readonly RoundMatchScore[];
}

export interface MatchCentreClub {
  readonly id: string;
  readonly name: string;
  readonly shortName: string;
}

export interface MatchCentre {
  readonly fixtureId: string;
  readonly round: number;
  readonly kickoffUtc: string | null;
  readonly venue: string | null;
  readonly home: MatchCentreClub | null;
  readonly away: MatchCentreClub | null;
  readonly generatedAt: string;
  readonly teamsheets: TeamsheetsSection;
  readonly weather: WeatherSection;
  /** Absent from API builds before live scoring. */
  readonly score?: ScoreSection;
}

/**
 * Contract of `GET /v1/competitions/{competitionId}/matches/{fixtureId}/preview`. Written by the preview agent from
 * public sources; render every field as plain text.
 */
export interface PreviewSource {
  readonly url: string;
  readonly title: string;
  readonly publisher: string | null;
  readonly publishedAt: string | null;
}

export interface PreviewFactor {
  readonly text: string;
  /** Indexes into `MatchPreview.sources`. */
  readonly sources: readonly number[];
}

export interface PreviewMood {
  /** -2 (troubled) to +2 (buoyant). */
  readonly score: number;
  readonly note: string;
  readonly sources: readonly number[];
}

export interface MatchPreview {
  readonly revision: number;
  readonly generatedAt: string;
  readonly summary: string;
  readonly keyFactors: {
    readonly home: readonly PreviewFactor[];
    readonly away: readonly PreviewFactor[];
  };
  readonly sentiment: { readonly home: PreviewMood; readonly away: PreviewMood };
  readonly sources: readonly PreviewSource[];
}

export interface MatchPreviewResponse {
  readonly fixtureId: string;
  readonly preview: MatchPreview | null;
}

/** Contract of `GET /v1/competitions/{competitionId}/rounds/{round}/updates`: the round's competition milestones. */
export type RoundEventKind =
  'teamsheets_published' | 'preview_published' | 'kicked_off' | 'full_time';

export interface RoundEvent {
  readonly kind: RoundEventKind;
  readonly fixtureId: string;
  /** Stays put once reported, so read state can compare against it. */
  readonly occurredAt: string;
  readonly revision?: number | null;
  readonly homeScore?: number | null;
  readonly awayScore?: number | null;
}

export interface RoundUpdates {
  readonly round: number;
  readonly generatedAt: string;
  readonly events: readonly RoundEvent[];
}
