import { Injectable, Signal, signal } from '@angular/core';
import {
  Duty,
  EvidenceSubmission,
  FeedItem,
  LeagueMember,
  MemberMarks,
  NewDuty,
  NewMember,
  Poll,
  RoundNote,
  RoundStanding,
} from './league.models';

/**
 * League records: members, standings, duties, marks, polls and the feed.
 * `HttpLeagueData` talks to the Python API. Development builds can use labelled sample
 * data instead, and `EmptyLeagueData` stands in when neither is configured.
 */
export abstract class LeagueData {
  /** `sample` records are illustrative and must be labelled as such in the UI. */
  abstract readonly source: 'sample' | 'api' | 'none';
  abstract readonly currentMemberId: Signal<string | null>;
  abstract readonly currentMemberName: Signal<string | null>;
  abstract readonly captainMemberId: Signal<string | null>;
  abstract readonly members: Signal<readonly LeagueMember[]>;
  abstract readonly standings: Signal<readonly RoundStanding[]>;
  abstract readonly marks: Signal<readonly MemberMarks[]>;
  abstract readonly duties: Signal<readonly Duty[]>;
  abstract readonly polls: Signal<readonly Poll[]>;
  abstract readonly notes: Signal<readonly RoundNote[]>;
  abstract readonly feed: Signal<readonly FeedItem[]>;
  /** True while league records are being fetched. */
  abstract readonly loading: Signal<boolean>;
  /** A safe message when the last fetch failed. */
  abstract readonly error: Signal<string | null>;
  abstract reload(): void;
  abstract submitEvidence(submission: EvidenceSubmission): Promise<void>;
  abstract createDuty(duty: NewDuty): Promise<void>;
  abstract voidDuty(dutyId: string, reason: string): Promise<void>;
  abstract decideEvidence(
    linkId: string,
    decision: 'accepted' | 'rejected',
    reason: string,
  ): Promise<void>;
  /** A short-lived playback URL for a submitted video. */
  abstract playbackUrl(assetId: string): Promise<string>;
  abstract addMember(member: NewMember): Promise<void>;
  abstract updateMember(memberId: string, email: string | null): Promise<void>;
  abstract castVote(pollId: string, choice: string): Promise<void>;
}

/** No league records. Used when neither the API nor sample data is configured. */
@Injectable()
export class EmptyLeagueData extends LeagueData {
  readonly source = 'none';
  readonly currentMemberId = signal<string | null>(null).asReadonly();
  readonly currentMemberName = signal<string | null>(null).asReadonly();
  readonly captainMemberId = signal<string | null>(null).asReadonly();
  readonly members = signal<readonly LeagueMember[]>([]).asReadonly();
  readonly standings = signal<readonly RoundStanding[]>([]).asReadonly();
  readonly marks = signal<readonly MemberMarks[]>([]).asReadonly();
  readonly duties = signal<readonly Duty[]>([]).asReadonly();
  readonly polls = signal<readonly Poll[]>([]).asReadonly();
  readonly notes = signal<readonly RoundNote[]>([]).asReadonly();
  readonly feed = signal<readonly FeedItem[]>([]).asReadonly();
  readonly loading = signal(false).asReadonly();
  readonly error = signal<string | null>(null).asReadonly();

  reload(): void {}

  submitEvidence(): Promise<void> {
    return unavailable('Evidence uploads');
  }

  createDuty(): Promise<void> {
    return unavailable('Duties');
  }

  voidDuty(): Promise<void> {
    return unavailable('Duties');
  }

  decideEvidence(): Promise<void> {
    return unavailable('Evidence review');
  }

  playbackUrl(): Promise<string> {
    return Promise.reject(new Error('Evidence playback is not available yet.'));
  }

  addMember(): Promise<void> {
    return unavailable('Membership changes');
  }

  updateMember(): Promise<void> {
    return unavailable('Membership changes');
  }

  castVote(): Promise<void> {
    return unavailable('Voting');
  }
}

function unavailable(feature: string): Promise<void> {
  return Promise.reject(new Error(`${feature} are not available yet.`));
}
