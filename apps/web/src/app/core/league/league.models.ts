export interface LeagueMember {
  readonly id: string;
  readonly name: string;
  readonly initials: string;
  readonly teamId: string;
}

/** Superbru points and house marks are separate measures with no exchange rate. */
export interface RoundStanding {
  readonly roundId: number;
  readonly memberId: string;
  readonly rank: number;
  readonly points: number;
  readonly marks: number;
}

export type DutyStatus = 'Open' | 'Awaiting review' | 'Completed';

export interface Duty {
  readonly id: string;
  readonly roundId: number;
  readonly memberId: string;
  readonly title: string;
  readonly deadline: string;
  readonly status: DutyStatus;
  readonly marks: number;
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

export interface ReviewItem {
  readonly id: string;
  readonly roundId: number;
  readonly title: string;
}

export interface RoundNote {
  readonly roundId: number;
  readonly deadline: string;
  readonly activity: string;
}

export interface EvidenceSubmission {
  readonly dutyId: string;
  readonly file: File;
  readonly note: string;
}
