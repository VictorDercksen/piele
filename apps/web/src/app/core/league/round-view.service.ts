import { Injectable, inject } from '@angular/core';
import { FixtureService } from '../competition/fixture.service';
import { DutyControlService } from './duties/duty-control.service';
import { DutyService } from './duties/duty.service';
import { FeedService } from './feed/feed.service';
import { LeagueContext } from './league-context';
import { LeagueRecordsService } from './league-records.service';
import { LeagueRules, MemberPick, NewPick, StandingEntry, StewardPick } from './league.models';
import { MarkService } from './marks/mark.service';
import { MemberService } from './members/member.service';
import { NoteService } from './notes/note.service';
import { PickControlService } from './picks/pick-control.service';
import { FixturePicksView } from './picks/pick.models';
import { PickService } from './picks/pick.service';
import { PollControlService } from './polls/poll-control.service';
import { PollService } from './polls/poll.service';
import { RulesControlService } from './rules/rules-control.service';
import { RulesService } from './rules/rules.service';
import { StandingControlService } from './standings/standing-control.service';
import { StandingService } from './standings/standing.service';

export { liveResult } from '../competition/fixture.service';
export type { ReviewView, RoundDutyView } from './duties/duty.models';
export type { MemberLook } from './members/member.models';
export type { FixturePicksView, PickRowView } from './picks/pick.models';
export type {
  DerivedVsRecorded,
  RoundRowView,
  RoundStandingView,
  SeasonRowView,
} from './standings/standing.models';

/**
 * League records scoped to the selected round, delegating to the entity services.
 * Temporary: removed in P3.
 */
@Injectable({ providedIn: 'root' })
export class RoundViewService {
  private readonly records = inject(LeagueRecordsService);
  private readonly context = inject(LeagueContext);
  private readonly fixtureService = inject(FixtureService);
  private readonly memberService = inject(MemberService);
  private readonly rulesService = inject(RulesService);
  private readonly rulesControl = inject(RulesControlService);
  private readonly pickService = inject(PickService);
  private readonly pickControl = inject(PickControlService);
  private readonly standingService = inject(StandingService);
  private readonly standingControl = inject(StandingControlService);
  private readonly markService = inject(MarkService);
  private readonly dutyService = inject(DutyService);
  private readonly dutyControl = inject(DutyControlService);
  private readonly pollService = inject(PollService);
  private readonly pollControl = inject(PollControlService);
  private readonly noteService = inject(NoteService);
  private readonly feedService = inject(FeedService);

  readonly sample = this.records.sample;
  /** The league being shown, e.g. for "PIELE / ROUND 02" eyebrows. */
  readonly leagueName = this.context.name;
  readonly source = this.records.source;
  readonly loading = this.records.loading;
  readonly error = this.records.error;
  readonly round = this.fixtureService.round;
  readonly fixtures = this.fixtureService.fixtures;
  readonly featured = this.fixtureService.featured;
  readonly memberId = this.memberService.memberId;
  readonly memberName = this.memberService.memberName;
  readonly isCaptain = this.memberService.isCaptain;
  readonly administers = this.memberService.administers;
  readonly adminView = this.memberService.adminView;
  readonly members = this.memberService.members;
  readonly withdrawn = this.memberService.withdrawn;
  readonly captainId = this.memberService.captainId;
  readonly captainName = this.memberService.captainName;
  readonly note = this.noteService.note;
  readonly activity = this.noteService.activity;
  readonly rules = this.rulesService.rules;
  readonly roundTable = this.standingService.roundTable;
  readonly roundBadges = this.standingService.roundBadges;
  readonly roundProvisional = this.fixtureService.roundProvisional;
  readonly seasonStandings = this.standingService.seasonStandings;
  readonly derivedVsRecorded = this.standingService.derivedVsRecorded;
  readonly standings = this.standingService.standings;
  readonly marksTable = this.markService.marksTable;
  readonly ownMarks = this.markService.ownMarks;
  readonly seasonDuties = this.dutyService.seasonDuties;
  readonly duties = this.dutyService.duties;
  readonly myDuty = this.dutyService.myDuty;
  readonly poll = this.pollService.poll;
  readonly pollNeedsVote = this.pollService.pollNeedsVote;
  readonly reviews = this.dutyService.reviews;
  readonly reviewCount = this.dutyService.reviewCount;
  readonly feed = this.feedService.feed;
  readonly seasonFeed = this.feedService.seasonFeed;

  hasRecords(memberId: string): boolean {
    return this.memberService.hasRecords(memberId);
  }

  myPickFor(fixtureId: string): MemberPick | null {
    return this.pickService.myPickFor(fixtureId);
  }

  picksFor(fixtureId: string): FixturePicksView | null {
    return this.pickService.picksFor(fixtureId);
  }

  savePick(fixtureId: string, pick: NewPick): Promise<void> {
    return this.pickControl.savePick(fixtureId, pick);
  }

  recordPicks(fixtureId: string, picks: readonly StewardPick[]): Promise<void> {
    return this.pickControl.recordPicks(fixtureId, picks);
  }

  removePick(fixtureId: string, memberId: string): Promise<void> {
    return this.pickControl.removePick(fixtureId, memberId);
  }

  saveRules(change: Partial<LeagueRules>): Promise<void> {
    return this.rulesControl.saveRules(change);
  }

  recordStandings(roundId: number, entries: readonly StandingEntry[]): Promise<void> {
    return this.standingControl.recordStandings(roundId, entries);
  }

  clearStanding(roundId: number, memberId: string): Promise<void> {
    return this.standingControl.clearStanding(roundId, memberId);
  }

  feature(fixtureId: string): void {
    this.fixtureService.feature(fixtureId);
  }

  reload(): void {
    this.records.reload();
  }

  voidDuty(dutyId: string, reason: string): Promise<void> {
    return this.dutyControl.voidDuty(dutyId, reason);
  }

  resetClock(dutyId: string, reason: string): Promise<void> {
    return this.dutyControl.resetClock(dutyId, reason);
  }

  castVote(pollId: string, choice: string): Promise<void> {
    return this.pollControl.castVote(pollId, choice);
  }
}
