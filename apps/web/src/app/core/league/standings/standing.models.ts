import { MemberLook } from '../members/member.models';
import { RoundRow, SeasonRow } from '../superbru';

export interface RoundRowView extends RoundRow, MemberLook {
  readonly cap: boolean;
  readonly spoon: boolean;
}

export type SeasonRowView = SeasonRow & MemberLook;

/** A member's derived round total beside the recorded one, for the captain's desk. */
export interface DerivedVsRecorded extends MemberLook {
  readonly memberId: string;
  /** Rank in the round table, or null when the member has no line in the round. */
  readonly rank: number | null;
  readonly derived: number;
  /** The recorded total, or null. */
  readonly recorded: number | null;
  /** The recorded total differs from the derived one: an override. */
  readonly differs: boolean;
}

/** One line of the selected round's standings, as the home board and standings page show it. */
export type RoundStandingView = Pick<
  RoundRowView,
  'roundId' | 'memberId' | 'rank' | 'points' | 'you' | 'name' | 'photo' | 'teamId'
>;
