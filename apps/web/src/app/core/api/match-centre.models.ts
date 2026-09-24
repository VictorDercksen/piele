/** Contract of `GET /v1/matches/{fixtureId}` in the Python API. */

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
}
