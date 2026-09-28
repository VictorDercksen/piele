import { HlmButton } from '@spartan-ng/helm/button';
import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucidePlay, lucideX } from '@ng-icons/lucide';
import { FixtureService } from '../../../core/competition/fixture.service';
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
const ALERT_KEYS = { playback: 'captain-playback' } as const;
/** Evidence decisions for the selected round. */
@Component({
  selector: 'app-evidence-review',
  templateUrl: './evidence-review.html',
  styleUrl: './evidence-review.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  /* prettier-ignore */
  imports: [
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
  readonly fixtures = inject(FixtureService);
  readonly records = inject(LeagueRecordsService);
  readonly reasonDialog = input.required<ReasonDialog>();
  when(review: ReviewView): string {
    return this.time.relative(review.evidence.submittedAt);
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
          ? `${duty.title} for ${duty.memberName} will be completed as of ${this.completionInstant(review)}. Marks already earned stay on the record.`
          : `${duty.memberName} keeps the duty open and can submit again. Say what was missing.`,
      submitLabel: decision === 'accepted' ? 'Accept evidence' : 'Reject evidence',
      required: decision === 'rejected',
      spoon: duty.spoon,
      action: (reason) => this.dutyControl.decideEvidence(evidence.id, decision, reason),
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
