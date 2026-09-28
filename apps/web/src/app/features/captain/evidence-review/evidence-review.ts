import { HlmButton } from '@spartan-ng/helm/button';
import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucidePlay, lucideX } from '@ng-icons/lucide';
import { FixtureService } from '../../../core/competition/fixture.service';
import { CaseService } from '../../../core/league/cases/case.service';
import { LeagueTime } from '../../../core/competition/league-time';
import { AlertService } from '../../../core/feedback/alert.service';
import { DutyControlService } from '../../../core/league/duties/duty-control.service';
import { ReviewView } from '../../../core/league/duties/duty.models';
import { DutyService } from '../../../core/league/duties/duty.service';
import { openPlaybackTab } from '../../../core/league/duties/playback-tab';
import { LeagueRecordsService } from '../../../core/league/league-records.service';
import { Dropdown } from '../../../shared/dropdown/dropdown';
import { Icon } from '../../../shared/icon/icon';
import { ReasonDialog } from '../../duties/reason-dialog/reason-dialog';
import { CaseCard } from '../../decisions/case-card/case-card';
import { overrideRefusal } from './evidence-review.refusals';
const ALERT_KEYS = { playback: 'captain-playback' } as const;
/**
 * The selected round's evidence on the captain's desk: vetoes waiting for a ruling (and those
 * nobody in the league may rule on), then the captain's override on pending evidence, which
 * closes its vote.
 */
@Component({
  selector: 'app-evidence-review',
  templateUrl: './evidence-review.html',
  styleUrl: './evidence-review.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  /* prettier-ignore */
  imports: [
    CaseCard,
    Dropdown,
    Icon,
    NgIcon,
    HlmButton,
  ],
  viewProviders: [provideIcons({ lucidePlay, lucideX })],
})
export class EvidenceReview {
  private readonly dutyControl = inject(DutyControlService);
  private readonly time = inject(LeagueTime);
  private readonly alerts = inject(AlertService);
  readonly duties = inject(DutyService);
  readonly cases = inject(CaseService);
  readonly fixtures = inject(FixtureService);
  readonly records = inject(LeagueRecordsService);
  readonly reasonDialog = input.required<ReasonDialog>();
  when(review: ReviewView): string {
    return this.time.relative(review.evidence.submittedAt);
  }

  /** Where the evidence's vote stands, for the override row. */
  voteState(review: ReviewView): string | null {
    const c = review.evidence.evidenceCase;
    if (c?.status === 'open') return `Members voting until ${this.time.format(c.closesAt)}`;
    if (c?.status === 'in_review') return 'Vetoed: waiting for a ruling';
    return null;
  }

  completion(review: ReviewView): string {
    const { evidence, duty } = review;
    const own = evidence.submitterId === duty.memberId;
    return own
      ? `Counts from submission · ${this.time.format(evidence.submittedAt)}`
      : `Recorded by ${evidence.submitterName} · completed ${this.time.format(evidence.claimedCompletedAt)}`;
  }

  decide(review: ReviewView, decision: 'accepted' | 'rejected'): void {
    const { duty, evidence } = review;
    this.reasonDialog().open({
      title: decision === 'accepted' ? 'Accept this evidence?' : 'Reject this evidence?',
      description:
        decision === 'accepted'
          ? `${duty.title} for ${duty.memberName} will be completed as of ${this.completionInstant(review)}, closing the members' vote. Marks already earned stay on the record.`
          : `${duty.memberName} keeps the duty open and can submit again. This closes the members' vote. Say what was missing.`,
      submitLabel: decision === 'accepted' ? 'Accept evidence' : 'Reject evidence',
      required: decision === 'rejected',
      spoon: duty.spoon,
      action: (reason) => this.dutyControl.decideEvidence(evidence.id, decision, reason),
      refused: overrideRefusal,
      done: () =>
        this.alerts.success(
          decision === 'accepted'
            ? `${duty.title} completed for ${duty.memberName}.`
            : `Evidence for ${duty.title} rejected.`,
        ),
    });
  }

  async watch(review: ReviewView): Promise<void> {
    try {
      await openPlaybackTab(() => this.duties.playbackUrl(review.evidence.assetId));
      this.alerts.dismissKey(ALERT_KEYS.playback);
    } catch (error) {
      this.alerts.error(error instanceof Error ? error.message : 'The video is unavailable.', {
        key: ALERT_KEYS.playback,
      });
    }
  }

  private completionInstant(review: ReviewView): string {
    const { evidence, duty } = review;
    return this.time.format(
      evidence.submitterId === duty.memberId ? evidence.submittedAt : evidence.claimedCompletedAt,
    );
  }
}
