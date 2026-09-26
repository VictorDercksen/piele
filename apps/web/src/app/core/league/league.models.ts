export interface LeagueMember {
  readonly id: string;
  /** The member's Superbru nickname. */
  readonly name: string;
  readonly fullName: string;
  readonly initials: string;
  readonly teamId: string;
  /** Whether a signed-in account has claimed this membership. */
  readonly claimed: boolean;
  readonly inSeason: boolean;
  /** Invitation email. Only the captain receives it. */
  readonly email?: string | null;
}

/** Superbru points and house marks are separate measures with no exchange rate. */
export interface RoundStanding {
  readonly roundId: number;
  readonly memberId: string;
  readonly rank: number;
  readonly points: number;
}

/** Season house marks per member, computed by the API from duties. */
export interface MemberMarks {
  readonly memberId: string;
  readonly memberName: string;
  readonly marks: number;
  readonly openDuties: number;
}

export type DutyType = 'spoon' | 'pick_confirmation';
/** Persisted lifecycle (plan M17). */
export type DutyLifecycle = 'pending_deadline' | 'open' | 'completed' | 'voided';
/** Lifecycle plus the derived display states. */
export type DutyDisplay = DutyLifecycle | 'overdue' | 'under_review';
export type EvidenceDecision = 'pending' | 'accepted' | 'rejected' | 'superseded';

export interface DutyEvidence {
  readonly id: string;
  readonly submissionId: string;
  readonly assetId: string;
  readonly decision: EvidenceDecision;
  readonly submittedAt: string;
  readonly claimedCompletedAt: string | null;
  readonly decidedAt: string | null;
  readonly reason: string | null;
  readonly effectiveCompletedAt: string | null;
  readonly note: string;
  readonly submitterId: string;
  readonly submitterName: string;
}

export interface DutyMarks {
  readonly marks: number;
  readonly overdueHours: number;
  readonly asOf: string;
  readonly nextMarkAt: string | null;
  readonly explanation: string;
}

export interface Duty {
  readonly id: string;
  readonly memberId: string;
  readonly memberName: string;
  /** Round position in the published schedule, or null for a season-wide duty. */
  readonly roundId: number | null;
  readonly type: DutyType;
  readonly title: string;
  readonly reason: string;
  /** UTC instant, or null while the deadline is unknown. */
  readonly deadlineAt: string | null;
  readonly status: DutyLifecycle;
  readonly display: DutyDisplay;
  readonly completedAt: string | null;
  /** Set when a challenge was resolved in the member's favour: the overdue clock restarted here. */
  readonly clockResetAt: string | null;
  readonly voidReason: string | null;
  readonly createdAt: string;
  readonly marks: DutyMarks;
  readonly evidence: readonly DutyEvidence[];
}

export interface NewDuty {
  readonly memberId: string;
  readonly type: DutyType;
  readonly roundId: number;
  /** Omit to let the league apply the default for the type. */
  readonly deadlineAt: string | null;
  readonly reason: string;
}

export interface Poll {
  readonly id: string;
  readonly roundId: number;
  readonly question: string;
  readonly description: string;
  readonly options: readonly string[];
  readonly closes: string;
  readonly status: 'Open' | 'Closed';
  readonly participants: number;
  readonly eligible: number;
  readonly result?: string;
  /** The current member's own choice. Other members' choices are never exposed. */
  readonly myChoice?: string;
}

export interface RoundNote {
  readonly roundId: number;
  readonly deadline: string;
  readonly activity: string;
}

export type FeedKind =
  | 'season_opened'
  | 'standings_recorded'
  | 'member_joined'
  | 'member_added'
  | 'duty_created'
  | 'duty_voided'
  | 'duty_clock_reset'
  | 'evidence_submitted'
  | 'evidence_accepted'
  | 'evidence_rejected'
  | 'match_result'
  | 'poll_opened'
  | 'poll_closed'
  | 'captain_note';

export interface FeedItem {
  readonly id: string;
  readonly kind: FeedKind | string;
  readonly roundId: number | null;
  readonly title: string;
  readonly detail: string;
  readonly occurredAt: string;
  readonly actorName: string | null;
  readonly subjectName: string | null;
  readonly dutyId: string | null;
}

export interface EvidenceSubmission {
  readonly dutyIds: readonly string[];
  readonly file: File;
  readonly note: string;
  /** Captain only: the member the evidence is for and when they completed the duty. */
  readonly subjectMemberId?: string;
  readonly claimedCompletedAt?: string;
}

/** A Superbru name a signed-in account may claim. */
export interface UnclaimedName {
  readonly id: string;
  readonly displayName: string;
  readonly fullName: string;
}

export interface NewMember {
  readonly name: string;
  readonly fullName: string;
  readonly email: string | null;
}

/**
 * What the member has read in the notifications panel: a high-water mark (everything at or
 * before it is read) plus the keys of items read individually above it.
 */
export interface NotificationsRead {
  readonly readAt: string | null;
  readonly readKeys: readonly string[];
}
