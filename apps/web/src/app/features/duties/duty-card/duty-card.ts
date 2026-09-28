import { HlmButton } from '@spartan-ng/helm/button';
import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CompetitionService } from '../../../core/competition/competition.service';
import { LeagueTime } from '../../../core/competition/league-time';
import { AlertService } from '../../../core/feedback/alert.service';
import { RoundDutyView } from '../../../core/league/duties/duty.models';
import { DutyService } from '../../../core/league/duties/duty.service';
import { openPlaybackTab } from '../../../core/league/duties/playback-tab';
import { LeaguePathPipe } from '../../../core/league/league-path.pipe';
import { DutyEvidence } from '../../../core/league/league.models';
import { Icon } from '../../../shared/icon/icon';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideArrowRight, lucidePlay, lucideRotateCcw, lucideX } from '@ng-icons/lucide';

/** One register entry: status, deadline, marks, evidence trail and the actions the viewer may take. */
@Component({
  selector: 'app-duty-card',
  templateUrl: './duty-card.html',
  styleUrl: './duty-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'register-card',
    '[class.personal-duty]': 'duty().mine',
    '[class.spoon-duty]': 'duty().spoon',
    '[class.closed-duty]': 'duty().status === "voided" || duty().status === "completed"',
  },
  /* prettier-ignore */
  imports: [
    Icon,
    LeaguePathPipe,
    NgIcon,
    RouterLink,
    HlmButton,
  ],
  viewProviders: [provideIcons({ lucideArrowRight, lucidePlay, lucideRotateCcw, lucideX })],
})
export class DutyCard {
  private readonly alerts = inject(AlertService);
  private readonly duties = inject(DutyService);
  private readonly time = inject(LeagueTime);
  private readonly competition = inject(CompetitionService);
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
  readonly deadline = computed(() => this.time.format(this.duty().deadlineAt));
  readonly nextMark = computed(() => {
    const at = this.duty().marks.nextMarkAt;
    return at ? this.time.format(at) : null;
  });
  /** The fixtures whose picks a pick confirmation duty covers, named "Bulls v Zebre". */
  readonly pickFixtures = computed(() => {
    const competition = this.competition.current();
    return this.duty().pickFixtureIds.map((id) => {
      const fixture = competition.locate(id)?.fixture;
      const name = (clubId: string, fallback: string) =>
        competition.team(clubId)?.shortName ?? fallback;
      return {
        id,
        label: fixture
          ? `${name(fixture.homeAsset, fixture.home)} v ${name(fixture.awayAsset, fixture.away)}`
          : `Match ${id}`,
      };
    });
  });
  readonly live = computed(
    () => this.duty().status === 'open' || this.duty().status === 'pending_deadline',
  );
  readonly canUpload = computed(() => this.duty().mine && this.live());
  readonly canRecord = computed(() => this.captain() && !this.duty().mine && this.live());
  readonly canReset = computed(
    () =>
      this.captain() &&
      !this.duty().mine &&
      this.duty().status === 'open' &&
      !!this.duty().deadlineAt,
  );
  readonly clockReset = computed(() => {
    const at = this.duty().clockResetAt;
    return at ? this.time.format(at) : null;
  });
  readonly evidenceSummary = computed(() => {
    const duty = this.duty();
    if (duty.status === 'completed')
      return `Accepted · completed ${this.time.format(duty.completedAt)}`;
    if (duty.status === 'voided') return `Voided · ${duty.voidReason || 'no reason given'}`;
    if (duty.evidence.some((e) => e.decision === 'pending')) return 'Submitted for review';
    if (duty.evidence.some((e) => e.decision === 'rejected')) return 'Rejected · submit again';
    return 'Not submitted';
  });

  when(evidence: DutyEvidence): string {
    return this.time.relative(evidence.submittedAt);
  }

  decisionLabel(evidence: DutyEvidence): string {
    return (
      {
        pending: 'Pending',
        accepted: 'Accepted',
        rejected: 'Rejected',
        superseded: 'Superseded',
      }[evidence.decision] ?? evidence.decision
    );
  }

  async watch(evidence: DutyEvidence): Promise<void> {
    const key = `playback-${evidence.assetId}`;
    try {
      await openPlaybackTab(() => this.duties.playbackUrl(evidence.assetId));
      this.alerts.dismissKey(key);
    } catch (error) {
      this.alerts.error(error instanceof Error ? error.message : 'The video is unavailable.', {
        key,
      });
    }
  }
}
