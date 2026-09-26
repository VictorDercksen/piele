import { Injectable, computed, inject, signal } from '@angular/core';
import { LiveScoresService } from '../api/live-scores.service';
import { CompetitionService } from '../competition/competition.service';
import { SelectedRoundService } from '../competition/selected-round.service';
import { ProfileStore } from '../profile/profile.store';
import { LeagueContext } from './league-context';
import { LeagueData } from './league-data';
import { Duty } from './league.models';

/** League records scoped to the selected round, shared by the shell and every page. */
@Injectable({ providedIn: 'root' })
export class RoundViewService {
  private readonly league = inject(LeagueData);
  private readonly profile = inject(ProfileStore);
  private readonly selected = inject(SelectedRoundService);
  private readonly live = inject(LiveScoresService);
  private readonly competition = inject(CompetitionService);
  private readonly context = inject(LeagueContext);

  readonly sample = this.league.source === 'sample';
  /** The league being shown, e.g. for "PIELE / ROUND 02" eyebrows. */
  readonly leagueName = this.context.name;
  readonly source = this.league.source;
  readonly loading = this.league.loading;
  readonly error = this.league.error;
  readonly round = this.selected.round;
  /** The round's fixtures with live scores merged in once the round has started. */
  readonly fixtures = computed(() => this.round().fixtures.map((f) => this.live.merge(f)));
  private readonly featuredId = signal<string | null>(null);
  /** The fixture shown in the match centre: the chosen one, else the member's team, else the opener. */
  readonly featured = computed(() => {
    const fixtures = this.fixtures();
    const team = this.profile.profile()?.teamId;
    return (
      fixtures.find((f) => f.id === this.featuredId()) ??
      fixtures.find((f) => f.homeAsset === team || f.awayAsset === team) ??
      fixtures[0]
    );
  });
  readonly memberId = this.league.currentMemberId;
  /** The league's name for the member, else the browser profile's. */
  readonly memberName = computed(
    () => this.league.currentMemberName() ?? this.profile.profile()?.displayName ?? 'You',
  );
  readonly isCaptain = computed(
    () =>
      !!this.league.currentMemberId() &&
      this.league.captainMemberId() === this.league.currentMemberId(),
  );
  /** Captain or admin: the captain's desk and captain actions. The API decides each one. */
  readonly administers = this.league.administers;
  /** The admin in a league it holds no membership in: attributed actions need a membership. */
  readonly adminView = computed(() => !this.league.currentMemberId());
  readonly members = this.league.members;
  /** Members the steward removed this season, newest first. */
  readonly withdrawn = this.league.withdrawnMembers;
  readonly captainId = this.league.captainMemberId;
  /** The league captain's Superbru name, when the team sheet has loaded. */
  readonly captainName = computed(() => {
    const id = this.league.captainMemberId();
    return id === this.league.currentMemberId()
      ? this.memberName()
      : (this.league.members().find((m) => m.id === id)?.name ?? null);
  });
  readonly note = computed(() => this.league.notes().find((n) => n.roundId === this.round().id));
  readonly deadline = computed(() => this.note()?.deadline ?? 'Not confirmed by the captain');
  readonly activity = computed(
    () =>
      this.note()?.activity ??
      (this.round().id <= this.competition.regularRounds
        ? `${this.fixtures().length} published fixtures. League results, duties and decisions have not been recorded.`
        : 'Playoff window published. Teams, venues and kickoffs are to be confirmed.'),
  );
  readonly standings = computed(() => {
    const members = this.league.members();
    const me = this.profile.profile();
    return this.league
      .standings()
      .filter((s) => s.roundId === this.round().id)
      .map((s) => {
        const member = members.find((m) => m.id === s.memberId);
        const you = s.memberId === this.league.currentMemberId();
        return {
          ...s,
          you,
          name: you ? this.memberName() : (member?.name ?? 'Unknown member'),
          photo: you ? (me?.photo ?? null) : null,
          teamId: you ? (me?.teamId ?? member?.teamId ?? '') : (member?.teamId ?? ''),
        };
      })
      .sort((a, b) => a.rank - b.rank);
  });
  /** Season house marks per member, with the current member first-person. */
  readonly marksTable = computed(() => {
    const me = this.profile.profile();
    const members = this.league.members();
    return this.league.marks().map((m) => {
      const you = m.memberId === this.league.currentMemberId();
      return {
        ...m,
        you,
        name: you ? this.memberName() : m.memberName,
        photo: you ? (me?.photo ?? null) : null,
        teamId: you
          ? (me?.teamId ?? '')
          : (members.find((member) => member.id === m.memberId)?.teamId ?? ''),
      };
    });
  });
  readonly ownMarks = computed(
    () => this.league.marks().find((m) => m.memberId === this.league.currentMemberId())?.marks ?? 0,
  );
  /** Every duty in the season, decorated for display. */
  readonly seasonDuties = computed(() => this.league.duties().map((d) => this.decorate(d)));
  readonly duties = computed(() =>
    this.seasonDuties().filter((d) => d.roundId === this.round().id),
  );
  readonly myDuty = computed(
    () =>
      this.duties().find((d) => d.mine && d.status !== 'voided' && d.status !== 'completed') ??
      this.duties().find((d) => d.mine),
  );
  readonly poll = computed(() => this.league.polls().find((p) => p.roundId === this.round().id));
  readonly pollNeedsVote = computed(() => this.poll()?.status === 'Open' && !this.poll()?.myChoice);
  /** Evidence in the selected round waiting for the captain, excluding the captain's own. */
  readonly reviews = computed(() =>
    this.duties().flatMap((duty) =>
      duty.evidence
        .filter((e) => e.decision === 'pending')
        .map((evidence) => ({ duty, evidence, selfReview: duty.mine })),
    ),
  );
  readonly reviewCount = computed(() => this.reviews().filter((r) => !r.selfReview).length);
  readonly feed = computed(() =>
    this.league.feed().filter((item) => item.roundId === this.round().id),
  );
  readonly seasonFeed = this.league.feed;

  /** Whether a member has duties or round standings on record in the loaded league. */
  hasRecords(memberId: string): boolean {
    return (
      this.league.duties().some((d) => d.memberId === memberId) ||
      this.league.standings().some((s) => s.memberId === memberId)
    );
  }

  feature(fixtureId: string): void {
    this.featuredId.set(fixtureId);
  }

  reload(): void {
    this.league.reload();
  }

  voidDuty(dutyId: string, reason: string): Promise<void> {
    return this.league.voidDuty(dutyId, reason);
  }

  resetClock(dutyId: string, reason: string): Promise<void> {
    return this.league.resetClock(dutyId, reason);
  }

  castVote(pollId: string, choice: string): Promise<void> {
    return this.league.castVote(pollId, choice);
  }

  private decorate(duty: Duty): RoundDutyView {
    const mine = duty.memberId === this.league.currentMemberId();
    return {
      ...duty,
      mine,
      spoon: duty.type === 'spoon',
      memberName: mine ? this.memberName() : duty.memberName,
      statusLabel: STATUS_LABELS[duty.display],
    };
  }
}

const STATUS_LABELS: Record<Duty['display'], string> = {
  pending_deadline: 'Deadline pending',
  open: 'Open',
  overdue: 'Overdue',
  under_review: 'Under review',
  completed: 'Completed',
  voided: 'Voided',
};

export interface RoundDutyView extends Duty {
  readonly mine: boolean;
  readonly spoon: boolean;
  readonly statusLabel: string;
}
export type RoundStandingView = ReturnType<RoundViewService['standings']>[number];
export type ReviewView = ReturnType<RoundViewService['reviews']>[number];
