import { Injectable, Signal, signal } from '@angular/core';
import {
  AppearanceChange,
  CaseChoice,
  Duty,
  EvidenceCase,
  EvidenceSubmission,
  FeedItem,
  FixturePicks,
  LeagueAppearance,
  LeagueMember,
  LeagueRules,
  LeagueSummary,
  MemberMarks,
  NewDuty,
  NewMember,
  NewPick,
  NotificationsRead,
  Poll,
  RoundNote,
  RoundStanding,
  StandInReviewer,
  StandingEntry,
  StewardPick,
  VetoRuling,
} from '../league.models';
import { loadStoredRead, storeRead } from '../notifications/notifications-read';
import { DEFAULT_RULES } from '../superbru';

/**
 * League records: members, Superbru picks, rules and recorded standings, duties, marks, polls
 * and the feed.
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
  /** Recorded round totals: overrides of the totals derived from the picks. */
  abstract readonly standings: Signal<readonly RoundStanding[]>;
  /**
   * Every scored fixture's picks from the starting round on, with the stored result. Other
   * members' picks are hidden from everyone before kickoff.
   */
  abstract readonly picks: Signal<readonly FixturePicks[]>;
  /** The season's Superbru rules. */
  abstract readonly rules: Signal<LeagueRules>;
  abstract readonly marks: Signal<readonly MemberMarks[]>;
  abstract readonly duties: Signal<readonly Duty[]>;
  /**
   * The season's evidence cases, newest first, as the current viewer may see them. A case
   * whose window closed is settled (auto-accepted) when the records are next read; providers
   * read again once the earliest open case's window has passed.
   */
  abstract readonly cases: Signal<readonly EvidenceCase[]>;
  /** The member who reviews vetoes when the captain is involved. */
  abstract readonly standInReviewer: Signal<StandInReviewer>;
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
  /**
   * An eligible voter accepts the evidence, or vetoes it with a reason, while voting is
   * open. An accept may become a veto; a veto is final.
   */
  abstract respondToCase(caseId: string, choice: CaseChoice, reason: string): Promise<void>;
  /**
   * The permitted reviewer upholds (rejects the evidence) or dismisses the pending veto.
   * `version` is the case's version the ruling is based on: 409 `stale_case` if it changed.
   */
  abstract reviewCase(
    caseId: string,
    ruling: VetoRuling,
    reason: string,
    version: number,
  ): Promise<void>;
  /** Captain or admin: names the stand-in reviewer, or clears it with null. */
  abstract setStandInReviewer(memberId: string | null): Promise<void>;
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
  /** The member's own pick for a fixture, before its kickoff. */
  abstract savePick(fixtureId: string, pick: NewPick): Promise<void>;
  /** Steward: records or corrects the listed members' picks at any time; others stay. */
  abstract recordPicks(fixtureId: string, picks: readonly StewardPick[]): Promise<void>;
  /** Steward: removes a member's pick. */
  abstract removePick(fixtureId: string, memberId: string): Promise<void>;
  /** Steward: changes some of the season's rules. */
  abstract saveRules(change: Partial<LeagueRules>): Promise<void>;
  /** Steward: replaces a round's recorded totals (overrides); members left out lose theirs. */
  abstract recordStandings(roundId: number, entries: readonly StandingEntry[]): Promise<void>;
  /** Steward: clears one member's recorded total for a round. */
  abstract clearStanding(roundId: number, memberId: string): Promise<void>;
}

/** No stand-in reviewer named. */
export const NO_STAND_IN: StandInReviewer = { memberId: null, memberName: null };

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
  readonly picks = signal<readonly FixturePicks[]>([]).asReadonly();
  private readonly rulesState = signal<LeagueRules>(DEFAULT_RULES);
  readonly rules = this.rulesState.asReadonly();
  readonly marks = signal<readonly MemberMarks[]>([]).asReadonly();
  readonly duties = signal<readonly Duty[]>([]).asReadonly();
  readonly cases = signal<readonly EvidenceCase[]>([]).asReadonly();
  readonly standInReviewer = signal<StandInReviewer>(NO_STAND_IN).asReadonly();
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
    this.rulesState.set(league.rules ?? DEFAULT_RULES);
    this.read.set(loadStoredRead(league.slug));
  }

  reload(): void {}

  refreshFeed(): Promise<void> {
    return Promise.resolve();
  }

  async saveNotificationsRead(read: NotificationsRead): Promise<void> {
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

  respondToCase(): Promise<void> {
    return unavailable('Evidence votes');
  }

  reviewCase(): Promise<void> {
    return unavailable('Veto reviews');
  }

  setStandInReviewer(): Promise<void> {
    return unavailable('Stand-in reviewers');
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

  savePick(): Promise<void> {
    return unavailable('Picks');
  }

  recordPicks(): Promise<void> {
    return unavailable('Picks');
  }

  removePick(): Promise<void> {
    return unavailable('Picks');
  }

  saveRules(): Promise<void> {
    return unavailable('Rule changes');
  }

  recordStandings(): Promise<void> {
    return unavailable('Recorded standings');
  }

  clearStanding(): Promise<void> {
    return unavailable('Recorded standings');
  }
}

function unavailable(feature: string): Promise<void> {
  return Promise.reject(new Error(`${feature} are not available yet.`));
}
