import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { formatLeagueTime, formatRelative } from '../../../core/competition/league-time';
import { LeagueData } from '../../../core/league/league-data';
import { DutyEvidence } from '../../../core/league/league.models';
import { RoundDutyView } from '../../../core/league/round-view.service';
import { Icon } from '../../../shared/icon/icon';

/** One register entry: status, deadline, marks, evidence trail and the actions the viewer may take. */
@Component({
  selector: 'app-duty-card',
  templateUrl: './duty-card.html',
  styleUrl: './duty-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon],
  host: {
    class: 'register-card',
    '[class.personal-duty]': 'duty().mine',
    '[class.spoon-duty]': 'duty().spoon',
    '[class.closed-duty]': 'duty().status === "voided" || duty().status === "completed"',
  },
})
export class DutyCard {
  private readonly league = inject(LeagueData);
  readonly duty = input.required<RoundDutyView>();
  readonly captain = input(false);
  readonly sample = input(false);
  readonly roundCode = input('');
  /** The member uploads their own evidence. */
  readonly upload = output<void>();
  /** The captain records evidence on the member's behalf. */
  readonly record = output<void>();
  readonly voided = output<void>();
  /** The captain records a challenge resolved in the member's favour. */
  readonly resetClock = output<void>();
  readonly playbackError = signal('');
  readonly deadline = computed(() => formatLeagueTime(this.duty().deadlineAt));
  readonly nextMark = computed(() => {
    const at = this.duty().marks.nextMarkAt;
    return at ? formatLeagueTime(at) : null;
  });
  readonly live = computed(
    () => this.duty().status === 'open' || this.duty().status === 'pending_deadline',
  );
  readonly canUpload = computed(() => this.duty().mine && this.live());
  readonly canRecord = computed(() => this.captain() && !this.duty().mine && this.live());
  readonly canReset = computed(
    () => this.captain() && !this.duty().mine && this.duty().status === 'open' && !!this.duty().deadlineAt,
  );
  readonly clockReset = computed(() => {
    const at = this.duty().clockResetAt;
    return at ? formatLeagueTime(at) : null;
  });
  readonly evidenceSummary = computed(() => {
    const duty = this.duty();
    if (duty.status === 'completed') return `Accepted · completed ${formatLeagueTime(duty.completedAt)}`;
    if (duty.status === 'voided') return `Voided · ${duty.voidReason || 'no reason given'}`;
    if (duty.evidence.some((e) => e.decision === 'pending')) return 'Submitted for review';
    if (duty.evidence.some((e) => e.decision === 'rejected')) return 'Rejected · submit again';
    return 'Not submitted';
  });

  when(evidence: DutyEvidence): string {
    return formatRelative(evidence.submittedAt);
  }

  decisionLabel(evidence: DutyEvidence): string {
    return { pending: 'Pending', accepted: 'Accepted', rejected: 'Rejected', superseded: 'Superseded' }[
      evidence.decision
    ];
  }

  async watch(evidence: DutyEvidence): Promise<void> {
    this.playbackError.set('');
    try {
      const url = await this.league.playbackUrl(evidence.assetId);
      window.open(url, '_blank', 'noopener');
    } catch (error) {
      this.playbackError.set(error instanceof Error ? error.message : 'The video is unavailable.');
    }
  }
}
