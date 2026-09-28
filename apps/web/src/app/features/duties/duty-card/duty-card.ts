import { HlmButton } from '@spartan-ng/helm/button';
import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { CompetitionService } from '../../../core/competition/competition.service';
import { LeagueTime } from '../../../core/competition/league-time';
import { AlertService } from '../../../core/feedback/alert.service';
import { RoundDutyView } from '../../../core/league/duties/duty.models';
import { DutyService } from '../../../core/league/duties/duty.service';
import { openPlaybackTab } from '../../../core/league/duties/playback-tab';
import { caseOutcome } from '../../../core/league/cases/case-wording';
import { LeaguePathPipe } from '../../../core/league/league-path.pipe';
import { DutyEvidence } from '../../../core/league/league.models';
import { Icon } from '../../../shared/icon/icon';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideArrowRight,
  lucideChevronDown,
  lucideClock,
  lucideFlag,
  lucidePlay,
  lucideRotateCcw,
  lucideX,
} from '@ng-icons/lucide';

/** The card's lead panel: where the duty stands and, while it is live, what happens next. */
export interface DutyStep {
  readonly eyebrow: 'Now' | 'Outcome';
  readonly headline: string;
  readonly detail: string | null;
  /** The case link, while members vote or a veto awaits a ruling. */
  readonly link: string | null;
}

/**
 * One register entry, next step first: status and title, deadline and marks as chips, a panel
 * saying where the duty stands, the latest evidence (older submissions fold away), then the
 * viewer's action and, for the captain, the captain's tools.
 */
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
    NgTemplateOutlet,
    RouterLink,
    HlmButton,
  ],
  viewProviders: [
    provideIcons({
      lucideArrowRight,
      lucideChevronDown,
      lucideClock,
      lucideFlag,
      lucidePlay,
      lucideRotateCcw,
      lucideX,
    }),
  ],
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
  readonly deadline = computed(() => this.short(this.duty().deadlineAt));
  readonly nextMark = computed(() => {
    const at = this.duty().marks.nextMarkAt;
    return at ? this.short(at) : null;
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
    return at ? this.short(at) : null;
  });
  /** The captain's tools: restart the clock on an upheld challenge, or void the duty. */
  readonly captainTools = computed(() => this.canReset() || (this.captain() && this.live()));
  /** Newest first: the latest submission leads and the rest fold away. */
  private readonly trail = computed(() =>
    [...this.duty().evidence].sort((a, b) => b.submittedAt.localeCompare(a.submittedAt)),
  );
  readonly latest = computed(() => this.trail()[0] ?? null);
  readonly earlier = computed(() => this.trail().slice(1));
  readonly step = computed((): DutyStep => {
    const duty = this.duty();
    const now = (headline: string, detail: string | null = null, link: string | null = null) =>
      ({ eyebrow: 'Now', headline, detail, link }) as const;
    if (duty.status === 'completed')
      return {
        eyebrow: 'Outcome',
        headline: 'Completed',
        detail: `Accepted · ${this.short(duty.completedAt)}`,
        link: null,
      };
    if (duty.status === 'voided')
      return {
        eyebrow: 'Outcome',
        headline: 'Voided',
        detail: duty.voidReason || 'No reason given',
        link: null,
      };
    const live = duty.liveCase;
    if (live?.status === 'open')
      return now(
        'Members are voting on the evidence',
        `Vote closes ${this.short(live.closesAt)}`,
        'View the vote',
      );
    if (live?.status === 'in_review')
      return now('Vetoed: an uninvolved reviewer will rule', null, 'View the veto');
    const latest = this.latest();
    if (latest?.decision === 'pending') return now('Submitted for review', 'Awaiting a decision');
    const overdue = duty.display === 'overdue' ? `Overdue since ${this.deadline()}` : null;
    if (latest?.decision === 'rejected') return now('Rejected · submit again', overdue);
    return now(duty.mine ? 'Upload your evidence' : `Waiting on ${duty.memberName}`, overdue);
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

  /**
   * Where the evidence's vote stands: open with its close time, in review, or how it ended.
   * The duty's live case is left to the lead panel, which already says so.
   */
  caseState(evidence: DutyEvidence): string | null {
    const c = evidence.evidenceCase;
    if (!c || c.id === this.duty().liveCase?.id) return null;
    if (c.status === 'open') return `Voting open until ${this.short(c.closesAt)}`;
    if (c.status === 'in_review') return 'Vetoed: an uninvolved reviewer will rule';
    if (c.status === 'superseded') return null;
    return caseOutcome(c.status, c.resolution);
  }

  /** `02 Oct · 20:45` on the league's clock; the card is read in the current season. */
  private short(iso: string | null | undefined): string {
    return this.time.pattern(iso, 'dd MMM · HH:mm', 'To be confirmed');
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
