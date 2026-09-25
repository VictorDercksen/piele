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
