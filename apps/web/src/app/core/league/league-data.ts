import { Injectable, Signal, signal } from '@angular/core';
import {
  AppearanceChange,
  Duty,
  EvidenceSubmission,
  FeedItem,
  LeagueAppearance,
  LeagueMember,
  LeagueSummary,
  MemberMarks,
  NewDuty,
  NewMember,
  NotificationsRead,
  Poll,
  RoundNote,
  RoundStanding,
} from './league.models';
import { loadStoredRead, storeRead } from './notifications-read';

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
  /** Captain or admin: may use the captain's desk. The API decides every action. */
  abstract readonly administers: Signal<boolean>;
  /** The league's join code for its steward; null for members, or when joining is closed. */
  abstract readonly joinCode: Signal<string | null>;
  /** Active members, the team sheet. */
  abstract readonly members: Signal<readonly LeagueMember[]>;
  /** Members the steward removed, with the date and reason. Empty for plain members. */
  abstract readonly withdrawnMembers: Signal<readonly LeagueMember[]>;
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
  /** What the member has read in the notifications panel. */
  abstract readonly notificationsRead: Signal<NotificationsRead>;
  /**
   * Points the records at a league. `LeagueContext.select` calls this; the API client
   * clears the previous league's records and loads the new one.
   */
  abstract selectLeague(league: LeagueSummary): void;
  abstract reload(): void;
  /** Fetches only the feed, for the notifications panel's periodic refresh. */
  abstract refreshFeed(): Promise<void>;
  abstract saveNotificationsRead(read: NotificationsRead): Promise<void>;
  abstract submitEvidence(submission: EvidenceSubmission): Promise<void>;
  abstract createDuty(duty: NewDuty): Promise<void>;
  abstract voidDuty(dutyId: string, reason: string): Promise<void>;
  /** A challenge resolved in the member's favour: the overdue clock restarts now. */
  abstract resetClock(dutyId: string, reason: string): Promise<void>;
  abstract decideEvidence(
    linkId: string,
    decision: 'accepted' | 'rejected',
    reason: string,
  ): Promise<void>;
  /** A short-lived playback URL for a submitted video. */
  abstract playbackUrl(assetId: string): Promise<string>;
  abstract addMember(member: NewMember): Promise<void>;
  abstract updateMember(memberId: string, email: string | null): Promise<void>;
  /** Undo a wrong claim so the right account can take the name. */
  abstract releaseMember(memberId: string): Promise<void>;
  abstract castVote(pollId: string, choice: string): Promise<void>;
  /**
   * Takes a member off the team sheet: open duties are voided, standings and marks stay. An
   * unclaimed name without records is deleted instead.
   */
  abstract withdrawMember(memberId: string, reason: string): Promise<void>;
  /** Puts a withdrawn member back on the team sheet in the active season. */
  abstract reinstateMember(memberId: string): Promise<void>;
  /** A new join code; the old link stops working. Resolves to the new code. */
  abstract rotateJoinCode(): Promise<string>;
  /** Closes joining: the join link stops working until a new code is made. */
  abstract closeJoinCode(): Promise<void>;
  /** Saves the league's emblem and accent colour and resolves to how the league now looks. */
  abstract saveAppearance(change: AppearanceChange): Promise<LeagueAppearance>;
}

/** No league records. Used when neither the API nor sample data is configured. */
@Injectable()
export class EmptyLeagueData extends LeagueData {
  readonly source = 'none';
  readonly currentMemberId = signal<string | null>(null).asReadonly();
  readonly currentMemberName = signal<string | null>(null).asReadonly();
  readonly captainMemberId = signal<string | null>(null).asReadonly();
  readonly administers = signal(false).asReadonly();
  readonly joinCode = signal<string | null>(null).asReadonly();
  readonly members = signal<readonly LeagueMember[]>([]).asReadonly();
  readonly withdrawnMembers = signal<readonly LeagueMember[]>([]).asReadonly();
  readonly standings = signal<readonly RoundStanding[]>([]).asReadonly();
  readonly marks = signal<readonly MemberMarks[]>([]).asReadonly();
  readonly duties = signal<readonly Duty[]>([]).asReadonly();
  readonly polls = signal<readonly Poll[]>([]).asReadonly();
  readonly notes = signal<readonly RoundNote[]>([]).asReadonly();
  readonly feed = signal<readonly FeedItem[]>([]).asReadonly();
  readonly loading = signal(false).asReadonly();
  readonly error = signal<string | null>(null).asReadonly();
  private slug: string | null = null;
  private readonly read = signal<NotificationsRead>(loadStoredRead());
  readonly notificationsRead = this.read.asReadonly();

  selectLeague(league: LeagueSummary): void {
    this.slug = league.slug;
    this.read.set(loadStoredRead(league.slug));
  }

  reload(): void {}

  refreshFeed(): Promise<void> {
    return Promise.resolve();
  }

  saveNotificationsRead(read: NotificationsRead): Promise<void> {
    this.read.set(read);
    storeRead(read, this.slug);
    return Promise.resolve();
  }

  submitEvidence(): Promise<void> {
    return unavailable('Evidence uploads');
  }

  createDuty(): Promise<void> {
    return unavailable('Duties');
  }

  voidDuty(): Promise<void> {
    return unavailable('Duties');
  }

  resetClock(): Promise<void> {
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

  releaseMember(): Promise<void> {
    return unavailable('Membership changes');
  }

  castVote(): Promise<void> {
    return unavailable('Voting');
  }

  withdrawMember(): Promise<void> {
    return unavailable('Membership changes');
  }

  reinstateMember(): Promise<void> {
    return unavailable('Membership changes');
  }

  rotateJoinCode(): Promise<string> {
    return Promise.reject(new Error('Join links are not available yet.'));
  }

  closeJoinCode(): Promise<void> {
    return unavailable('Join links');
  }

  saveAppearance(): Promise<LeagueAppearance> {
    return Promise.reject(new Error('League emblems are not available yet.'));
  }
}

function unavailable(feature: string): Promise<void> {
  return Promise.reject(new Error(`${feature} are not available yet.`));
}
