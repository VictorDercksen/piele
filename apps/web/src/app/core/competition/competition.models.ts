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
  readonly score?: string;
}

export interface CompetitionRound {
  readonly id: number;
  readonly code: string;
  readonly title: string;
  readonly dates: string;
  readonly status: RoundStatus;
  readonly fixtures: readonly Fixture[];
}
