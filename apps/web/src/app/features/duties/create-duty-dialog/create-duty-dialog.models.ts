import { DutyType } from '../../../core/league/league.models';

/** What a caller can fill in when it opens the form. */
export interface DutyPrefill {
  readonly memberId?: string;
  readonly type?: DutyType;
  readonly roundId?: number;
  readonly reason?: string;
}

/** A fixture the pick confirmation can cover, with the member's pick state there. */
export interface PickFixtureOption {
  readonly id: string;
  readonly label: string;
  readonly state: 'No pick' | 'Missed' | 'Default pick';
  readonly checked: boolean;
}

/** A form control an attempt can find wanting. */
export type DutyField = 'memberId' | 'deadline';

/** One thing the captain must fix, and the control it concerns. */
export interface DutyProblem {
  readonly control: DutyField;
  readonly message: string;
}

/** The duty just created, as the page announces it. */
export interface CreatedDuty {
  readonly title: string;
  readonly memberName: string;
  readonly deadlineAt: string | null;
}
