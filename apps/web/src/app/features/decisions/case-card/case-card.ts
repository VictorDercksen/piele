import { HlmButton } from '@spartan-ng/helm/button';
import { Component, computed, inject, input, signal } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucidePlay, lucideX } from '@ng-icons/lucide';
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
 * One piece of evidence under the league's vote: the duty, the video, the countdown,
 * participation (never who) and the viewer's own response, with Accept and Veto while voting
 * is open and, for the permitted reviewer, Uphold and Dismiss on a pending veto.
 */
@Component({
  selector: 'app-case-card',
  templateUrl: './case-card.html',
  styleUrl: './case-card.scss',
  host: {
    class: 'case-card',
    '[class.closed-case]': '!evidenceCase().live',
  },
  /* prettier-ignore */
  imports: [
    Icon,
    Loader,
    NgIcon,
    HlmButton,
  ],
  viewProviders: [provideIcons({ lucidePlay, lucideX })],
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
  readonly accepting = signal(false);
  readonly submitted = computed(() => this.time.relative(this.evidenceCase().submittedAt));
  readonly resolved = computed(() => {
    const at = this.evidenceCase().resolvedAt;
    return at ? this.time.format(at) : null;
  });
  readonly turnout = computed(() => {
    const { respondedCount, eligibleCount } = this.evidenceCase();
    return eligibleCount ? Math.min(100, (respondedCount / eligibleCount) * 100) : 0;
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
