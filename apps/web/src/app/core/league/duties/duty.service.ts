import { Service, computed, inject } from '@angular/core';
import { FixtureService } from '../../competition/fixture.service';
import { LeagueData } from '../data/league-data';
import { Duty } from '../league.models';
import { MemberService } from '../members/member.service';
import { ReviewView, RoundDutyView } from './duty.models';

/** The season's duties, the selected round's, and evidence waiting for the captain. */
@Service()
export class DutyService {
  private readonly data = inject(LeagueData);
  private readonly fixtures = inject(FixtureService);
  private readonly members = inject(MemberService);

  /** Every duty in the season, decorated for display. */
  readonly seasonDuties = computed(() => this.data.duties().map((d) => this.decorate(d)));
  readonly duties = computed(() =>
    this.seasonDuties().filter((d) => d.roundId === this.fixtures.round().id),
  );
  readonly myDuty = computed(
    () =>
      this.duties().find((d) => d.mine && d.status !== 'voided' && d.status !== 'completed') ??
      this.duties().find((d) => d.mine),
  );
  /** Evidence in the selected round waiting for the captain, excluding the captain's own. */
  readonly reviews = computed<readonly ReviewView[]>(() =>
    this.duties().flatMap((duty) =>
      duty.evidence
        .filter((e) => e.decision === 'pending')
        .map((evidence) => ({ duty, evidence, selfReview: duty.mine })),
    ),
  );
  readonly reviewCount = computed(() => this.reviews().filter((r) => !r.selfReview).length);

  /** A short-lived playback URL for a submitted video. */
  playbackUrl(assetId: string): Promise<string> {
    return this.data.playbackUrl(assetId);
  }

  private decorate(duty: Duty): RoundDutyView {
    const mine = duty.memberId === this.data.currentMemberId();
    return {
      ...duty,
      mine,
      spoon: duty.type === 'spoon',
      memberName: mine ? this.members.memberName() : duty.memberName,
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
