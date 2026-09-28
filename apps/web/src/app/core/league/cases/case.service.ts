import { DestroyRef, Service, computed, inject, signal } from '@angular/core';
import { FixtureService } from '../../competition/fixture.service';
import { LeagueTime } from '../../competition/league-time';
import { LeagueData } from '../data/league-data';
import { EvidenceCase } from '../league.models';
import { MemberService } from '../members/member.service';
import { CASE_STATUS_LABELS, caseOutcome, timeLeft } from './case-wording';
import { CaseView } from './case.models';

/** How often the voting countdowns move. */
export const COUNTDOWN_TICK_MS = 30_000;

/**
 * Evidence under the league's vote: the season's cases, the selected round's, and what waits
 * for the member (a response, or a ruling on a veto). Voter identities are never available.
 */
@Service()
export class CaseService {
  private readonly data = inject(LeagueData);
  private readonly fixtures = inject(FixtureService);
  private readonly members = inject(MemberService);
  private readonly time = inject(LeagueTime);
  private readonly clock = signal(Date.now());
  /** Advances every half minute, for the countdowns. */
  readonly now = this.clock.asReadonly();

  /** Every case in the season, newest first. */
  readonly seasonCases = computed(() => this.data.cases().map((c) => this.decorate(c)));
  /**
   * The selected round's cases, and those on season-wide duties (no round), which every
   * round's pages show so they are never out of reach.
   */
  readonly cases = computed(() =>
    this.seasonCases().filter(
      (c) => c.roundNumber === null || c.roundNumber === this.fixtures.round().id,
    ),
  );
  /** Open cases in the season the member may still respond to and has not. */
  readonly awaitingResponse = computed(() =>
    this.seasonCases().filter((c) => c.canRespond && !c.myResponse),
  );
  /** Vetoes in the season the member may rule on. */
  readonly awaitingReview = computed(() => this.seasonCases().filter((c) => c.canReview));
  /** The selected round's cases awaiting the member's response. */
  readonly roundAwaitingResponse = computed(() =>
    this.cases().filter((c) => c.canRespond && !c.myResponse),
  );
  /** The selected round's vetoes the member may rule on. */
  readonly roundAwaitingReview = computed(() => this.cases().filter((c) => c.canReview));
  /**
   * The selected round's vetoes for the captain's desk: those the member may rule on and those
   * nobody in the league may (`needsReviewer`), which only the admin can then decide.
   */
  readonly reviewQueue = computed(() =>
    this.cases().filter((c) => c.status === 'in_review' && (c.canReview || c.needsReviewer)),
  );
  /** The member who reviews vetoes when the captain is involved. */
  readonly standIn = this.data.standInReviewer;

  constructor() {
    const timer = setInterval(() => this.clock.set(Date.now()), COUNTDOWN_TICK_MS);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  /** The time left to vote on an open case. Reads the clock: call it in a template or computed. */
  countdown(view: Pick<EvidenceCase, 'closesAt'>): string {
    return timeLeft(view.closesAt, this.now());
  }

  private decorate(c: EvidenceCase): CaseView {
    const mine = c.subjectId === this.data.currentMemberId();
    return {
      ...c,
      mine,
      spoon: c.dutyType === 'spoon',
      live: c.status === 'open' || c.status === 'in_review',
      subjectName: mine ? this.members.memberName() : c.subjectName,
      statusLabel: CASE_STATUS_LABELS[c.status],
      outcome: caseOutcome(c.status, c.resolution),
      closes: this.time.format(c.closesAt),
    };
  }
}
