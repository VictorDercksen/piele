import { Injectable, Signal, signal } from '@angular/core';
import {
  Duty,
  EvidenceSubmission,
  LeagueMember,
  Poll,
  ReviewItem,
  RoundNote,
  RoundStanding,
} from './league.models';

/**
 * League records: members, standings, duties, polls and captain reviews.
 * The Python API will provide an HTTP implementation. Until then the app uses
 * either sample data (development) or an empty league (production).
 */
export abstract class LeagueData {
  /** `sample` records are illustrative and must be labelled as such in the UI. */
  abstract readonly source: 'sample' | 'none';
  abstract readonly currentMemberId: string | null;
  abstract readonly captainMemberId: Signal<string | null>;
  abstract readonly members: Signal<readonly LeagueMember[]>;
  abstract readonly standings: Signal<readonly RoundStanding[]>;
  abstract readonly duties: Signal<readonly Duty[]>;
  abstract readonly polls: Signal<readonly Poll[]>;
  abstract readonly reviews: Signal<readonly ReviewItem[]>;
  abstract readonly notes: Signal<readonly RoundNote[]>;
  abstract submitEvidence(submission: EvidenceSubmission): Promise<void>;
  abstract castVote(pollId: string, choice: string): Promise<void>;
}

/** No league records yet. Used until the league API is connected. */
@Injectable()
export class EmptyLeagueData extends LeagueData {
  readonly source = 'none';
  readonly currentMemberId = null;
  readonly captainMemberId = signal(null).asReadonly();
  readonly members = signal<readonly LeagueMember[]>([]).asReadonly();
  readonly standings = signal<readonly RoundStanding[]>([]).asReadonly();
  readonly duties = signal<readonly Duty[]>([]).asReadonly();
  readonly polls = signal<readonly Poll[]>([]).asReadonly();
  readonly reviews = signal<readonly ReviewItem[]>([]).asReadonly();
  readonly notes = signal<readonly RoundNote[]>([]).asReadonly();

  submitEvidence(): Promise<void> {
    return Promise.reject(new Error('Evidence uploads are not available yet.'));
  }

  castVote(): Promise<void> {
    return Promise.reject(new Error('Voting is not available yet.'));
  }
}
