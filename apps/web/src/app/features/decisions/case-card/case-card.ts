import { HlmBadge } from '@spartan-ng/helm/badge';
import { HlmButton } from '@spartan-ng/helm/button';
import { Component, computed, inject, input, signal } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideCheck,
  lucideChevronDown,
  lucideCircleCheck,
  lucideCircleSlash,
  lucideCircleX,
  lucideClock,
  lucidePlay,
  lucideX,
} from '@ng-icons/lucide';
import { NgTemplateOutlet } from '@angular/common';
import { LeagueTime } from '../../../core/competition/league-time';
import { AlertService } from '../../../core/feedback/alert.service';
import { CaseControlService } from '../../../core/league/cases/case-control.service';
import { CaseService } from '../../../core/league/cases/case.service';
import { CaseView } from '../../../core/league/cases/case.models';
import { DutyService } from '../../../core/league/duties/duty.service';
import { openPlaybackTab } from '../../../core/league/duties/playback-tab';
import { LeagueContext } from '../../../core/league/league-context';
import { VetoRuling } from '../../../core/league/league.models';
import { Icon } from '../../../shared/icon/icon';
import { Loader } from '../../../shared/loader/loader';
import { ReasonDialog } from '../../duties/reason-dialog/reason-dialog';
import { caseRefusal } from './case-card.refusals';
import { myResponseText } from './case-card.view';

/**
 * Which lead panel the viewer sees: a voter's two steps (`ballot`), a voter who accepted and
 * may still veto, the permitted reviewer's ruling, a veto awaiting someone else's ruling, a
 * vote the viewer only watches, or how a closed case ended.
 */
export type CasePanel = 'ballot' | 'accepted' | 'ruling' | 'vetoed' | 'watching' | 'outcome';

/**
 * One piece of evidence under the league's vote, the viewer's call first: a panel says what
 * the viewer can do (watch then accept or veto, rule on a veto) or where the vote stands, with
 * participation (never who) and the countdown at its foot.
 */
@Component({
  selector: 'app-case-card',
  templateUrl: './case-card.html',
  styleUrl: './case-card.scss',
  host: {
    class: 'case-card',
    '[class.spoon-duty]': 'evidenceCase().spoon',
    '[class.closed-case]': '!evidenceCase().live',
  },
  /* prettier-ignore */
  imports: [
    Icon,
    Loader,
    NgIcon,
    NgTemplateOutlet,
    HlmBadge,
    HlmButton,
  ],
  viewProviders: [
    provideIcons({
      lucideCheck,
      lucideChevronDown,
      lucideCircleCheck,
      lucideCircleSlash,
      lucideCircleX,
      lucideClock,
      lucidePlay,
      lucideX,
    }),
  ],
})
export class CaseCard {
  private readonly alerts = inject(AlertService);
  private readonly caseControl = inject(CaseControlService);
  private readonly duties = inject(DutyService);
  private readonly time = inject(LeagueTime);
  private readonly leagueName = inject(LeagueContext).name;
  readonly cases = inject(CaseService);
  readonly evidenceCase = input.required<CaseView>();
  /** The page's reason dialog, for a veto and a ruling. */
  readonly reasonDialog = input.required<ReasonDialog>();
  /** Sample evidence has no video to watch. */
  readonly sample = input(false);
  readonly roundCode = input('');
  /** `ROUND 02`, or `SEASON` for a duty that belongs to no round. */
  readonly roundLabel = computed(() =>
    this.evidenceCase().roundNumber === null ? 'SEASON' : `ROUND ${this.roundCode()}`,
  );
  /** The subject, with `SEASON` for a duty that belongs to no round; the list names the round. */
  readonly subjectLabel = computed(() => {
    const c = this.evidenceCase();
    return c.roundNumber === null ? `SEASON / ${c.subjectName}` : c.subjectName;
  });
  readonly accepting = signal(false);
  /** The viewer opened the video from this card, which ticks the ballot's first step. */
  readonly watched = signal(false);
  readonly panel = computed((): CasePanel => {
    const c = this.evidenceCase();
    if (c.status === 'open') {
      if (!c.canRespond) return 'watching';
      return c.myResponse === 'accept' ? 'accepted' : 'ballot';
    }
    if (c.status === 'in_review') return c.canReview ? 'ruling' : 'vetoed';
    return 'outcome';
  });
  /** `05 Oct · 10:00` on the league's clock. */
  readonly closes = computed(() =>
    this.time.pattern(this.evidenceCase().closesAt, 'dd MMM · HH:mm'),
  );
  /** One slot per voting member: filled once responded, the majority's slot marked. */
  readonly slots = computed(() => {
    const { respondedCount, eligibleCount } = this.evidenceCase();
    return Array.from({ length: eligibleCount }, (_, i) => ({
      on: i < respondedCount,
      needed: i === this.majority() - 1,
    }));
  });
  readonly submitted = computed(() => this.time.relative(this.evidenceCase().submittedAt));
  readonly resolved = computed(() => {
    const at = this.evidenceCase().resolvedAt;
    return at ? this.time.pattern(at, 'dd MMM · HH:mm') : null;
  });
  /** The icon beside the date a closed case was decided. */
  readonly resolvedIcon = computed(() => {
    const status = this.evidenceCase().status;
    if (status === 'accepted') return 'lucideCircleCheck';
    return status === 'rejected' ? 'lucideCircleX' : 'lucideCircleSlash';
  });
  readonly myResponse = computed(() => myResponseText(this.evidenceCase()));
  /** A majority is more than half of the members voting. */
  readonly majority = computed(() => Math.floor(this.evidenceCase().eligibleCount / 2) + 1);

  async accept(): Promise<void> {
    const c = this.evidenceCase();
    if (this.accepting()) return;
    this.accepting.set(true);
    try {
      await this.caseControl.accept(c.id);
      this.alerts.dismissKey(this.alertKey());
      this.alerts.success(
        this.sample()
          ? 'Your sample accept is recorded. It resets when you reload.'
          : `You accepted the evidence for ${c.dutyTitle}. You can still veto it until voting closes.`,
      );
    } catch (error) {
      const warning = caseRefusal(error);
      if (warning) this.alerts.warn(warning, { key: this.alertKey() });
      else
        this.alerts.error(
          error instanceof Error ? error.message : 'Your accept was not recorded.',
          {
            key: this.alertKey(),
          },
        );
    } finally {
      this.accepting.set(false);
    }
  }

  veto(): void {
    const c = this.evidenceCase();
    this.reasonDialog().open({
      eyebrow: this.eyebrow(),
      title: 'Veto this evidence?',
      description: `Voting on ${c.subjectName}'s ${c.dutyTitle} stops and an uninvolved reviewer rules on your veto. A veto cannot be withdrawn. Other members never see that it was yours. Say what is wrong with the evidence.`,
      submitLabel: 'Veto evidence',
      required: true,
      spoon: c.spoon,
      action: (reason) => this.caseControl.veto(c.id, reason),
      refused: caseRefusal,
      done: () =>
        this.alerts.success('Your veto is recorded. An uninvolved reviewer will rule on it.'),
    });
  }

  rule(ruling: VetoRuling): void {
    const c = this.evidenceCase();
    const upheld = ruling === 'upheld';
    this.reasonDialog().open({
      eyebrow: this.eyebrow(),
      title: upheld ? 'Uphold this veto?' : 'Dismiss this veto?',
      description: upheld
        ? `The evidence is rejected. ${c.subjectName}'s duty stays open and a new submission opens a new vote. Say why the veto stands.`
        : `Voting reopens until ${c.closes}. Accepts already cast still count: with a majority, or once that time has passed, the evidence is accepted at once. Say why the veto fails.`,
      submitLabel: upheld ? 'Uphold veto' : 'Dismiss veto',
      required: true,
      spoon: c.spoon,
      action: (reason) => this.caseControl.review(c, ruling, reason),
      refused: caseRefusal,
      done: () =>
        this.alerts.success(
          upheld
            ? `Veto upheld. The evidence for ${c.dutyTitle} is rejected.`
            : `Veto dismissed. Voting on ${c.dutyTitle} is open again.`,
        ),
    });
  }

  async watch(): Promise<void> {
    const key = `playback-${this.evidenceCase().assetId}`;
    try {
      await openPlaybackTab(() => this.duties.playbackUrl(this.evidenceCase().assetId));
      this.watched.set(true);
      this.alerts.dismissKey(key);
    } catch (error) {
      this.alerts.error(error instanceof Error ? error.message : 'The video is unavailable.', {
        key,
      });
    }
  }

  private alertKey(): string {
    return `case-${this.evidenceCase().id}`;
  }

  private eyebrow(): string {
    return `${this.leagueName().toUpperCase()} / ${this.roundLabel()} DECISION`;
  }
}
