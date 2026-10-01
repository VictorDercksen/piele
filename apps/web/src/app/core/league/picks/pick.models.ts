import { CompetitionRound, Fixture } from '../../competition/competition.models';
import { FixtureResult, MemberPick } from '../league.models';
import { MemberLook } from '../members/member.models';
import { Sway } from '../superbru';

/** One pick on the match page: the member, the picked club and the pick's points. */
export interface PickRowView extends MemberPick, MemberLook {
  readonly clubId: string | null;
  readonly clubShortName: string | null;
  readonly clubColour: string | null;
  readonly clubAccent: string | null;
  readonly wp: number;
  readonly mp: number;
  readonly bp: number;
  readonly points: number;
  readonly distance: number | null;
  readonly scored: boolean;
  readonly correct: boolean;
}

/** A fixture's picks as the match page shows them (`PickService.picksFor`). */
export interface FixturePicksView {
  readonly fixture: Fixture;
  readonly round: CompetitionRound;
  readonly locked: boolean;
  readonly provisional: boolean;
  readonly final: boolean;
  /** Postponed or cancelled: not scored. */
  readonly void: boolean;
  /** The member's own pick is in. */
  readonly recorded: boolean;
  /** Before kickoff: the pool's picks are hidden from everyone; only the member's own shows. */
  readonly hidden: boolean;
  readonly result: FixtureResult | null;
  readonly myPick: MemberPick | null;
  readonly rows: readonly PickRowView[];
  readonly sway: Sway;
  /** The member's rank among the fixture's picks by points, once scored. */
  readonly myPlace: number | null;
}
