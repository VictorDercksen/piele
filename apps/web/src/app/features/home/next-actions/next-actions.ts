import { HlmButton } from '@spartan-ng/helm/button';
import { ChangeDetectionStrategy, Component, computed, inject, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideArrowRight } from '@ng-icons/lucide';
import { FixtureService } from '../../../core/competition/fixture.service';
import { LeagueTime } from '../../../core/competition/league-time';
import { CaseService } from '../../../core/league/cases/case.service';
import { RoundDutyView } from '../../../core/league/duties/duty.models';
import { DutyService } from '../../../core/league/duties/duty.service';
import { LeaguePathPipe } from '../../../core/league/league-path.pipe';
import { MemberService } from '../../../core/league/members/member.service';
import { Icon } from '../../../shared/icon/icon';

/**
 * The current member's unsettled duty, evidence waiting for the member's vote or ruling, and the
 * steward's review queue. Renders nothing when none of these needs the member.
 */
@Component({
  selector: 'app-next-actions',
  templateUrl: './next-actions.html',
  styleUrl: './next-actions.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.empty]': '!visible()' },
  /* prettier-ignore */
  imports: [
    RouterLink,
    LeaguePathPipe,
    Icon,
    NgIcon,
    HlmButton,
  ],
  viewProviders: [provideIcons({ lucideArrowRight })],
})
export class NextActions {
  private readonly time = inject(LeagueTime);
  private readonly dutyService = inject(DutyService);
  private readonly cases = inject(CaseService);
  readonly fixtures = inject(FixtureService);
  readonly members = inject(MemberService);
  readonly upload = output<RoundDutyView>();

  /** The member's duty while it is still in play; a completed or voided duty needs nothing. */
  readonly duty = computed(() => {
    const duty = this.dutyService.myDuty();
    return duty && duty.display !== 'completed' && duty.display !== 'voided' ? duty : null;
  });
  readonly voteCount = computed(() => this.cases.roundAwaitingResponse().length);
  readonly rulingCount = computed(() => this.cases.roundAwaitingReview().length);
  readonly captainCount = computed(() =>
    this.members.administers() ? this.dutyService.reviewCount() : 0,
  );
  readonly visible = computed(
    () => !!this.duty() || !!(this.voteCount() || this.rulingCount() || this.captainCount()),
  );

  canUpload(duty: RoundDutyView): boolean {
    return (
      duty.display === 'open' || duty.display === 'overdue' || duty.display === 'pending_deadline'
    );
  }

  status(duty: RoundDutyView): string {
    if (duty.display === 'overdue') {
      const marks = duty.marks.marks;
      return `${marks} house ${marks === 1 ? 'mark' : 'marks'} so far, one more every full week`;
    }
    if (duty.display === 'under_review') {
      if (duty.liveCase?.status === 'in_review') return 'Vetoed, awaiting a ruling';
      if (duty.liveCase?.status === 'open') {
        return `Members vote until ${this.time.format(duty.liveCase.closesAt)}`;
      }
      return 'Waiting for an uninvolved reviewer';
    }
    return this.time.format(duty.deadlineAt, 'Deadline to be confirmed');
  }
}
