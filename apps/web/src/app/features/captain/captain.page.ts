import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { LeagueTime } from '../../core/competition/league-time';
import { AlertService } from '../../core/feedback/alert.service';
import { LeagueData } from '../../core/league/league-data';
import { LeagueMember } from '../../core/league/league.models';
import { ReviewView, RoundViewService } from '../../core/league/round-view.service';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucidePlay } from '@ng-icons/lucide';
import { Dropdown } from '../../shared/dropdown/dropdown';
import { Icon } from '../../shared/icon/icon';
import { Loader } from '../../shared/loader/loader';
import { CreateDutyDialog } from '../duties/create-duty-dialog/create-duty-dialog';
import { ReasonDialog } from '../duties/reason-dialog/reason-dialog';
import { AppearanceCard } from './appearance-card/appearance-card';
import { JoinLinkCard } from './join-link-card/join-link-card';
import { PicksCard } from './picks-card/picks-card';
import { RulesCard } from './rules-card/rules-card';

/** The desk's cards by form, so a new attempt replaces the last one's. */
const ALERT_KEYS = {
  playback: 'captain-playback',
  email: 'captain-member-email',
  reinstate: 'captain-reinstate',
  addMember: 'captain-add-member',
} as const;

/**
 * The steward's desk (the captain, or the admin): evidence awaiting a decision in the selected
 * round, the round's Superbru picks and totals (`#picks`), the team sheet with removal and
 * reinstatement, the join link, the league's look and the season's Superbru rules. Each section
 * is closed behind its heading until its chevron opens it; `#picks` opens the picks.
 */
@Component({
  selector: 'app-captain-page',
  templateUrl: './captain.page.html',
  styleUrl: './captain.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    Dropdown,
    Icon,
    NgIcon,
    Loader,
    ReasonDialog,
    CreateDutyDialog,
    PicksCard,
    JoinLinkCard,
    AppearanceCard,
    RulesCard,
  ],
  viewProviders: [provideIcons({ lucidePlay })],
})
export class CaptainPage {
  private readonly league = inject(LeagueData);
  private readonly time = inject(LeagueTime);
  private readonly alerts = inject(AlertService);
  readonly view = inject(RoundViewService);
  private readonly injector = inject(Injector);
  readonly reasonDialog = viewChild.required(ReasonDialog);
  readonly dutyDialog = viewChild.required(CreateDutyDialog);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly withdrawnGroup = viewChild<ElementRef<HTMLDetailsElement>>('withdrawnGroup');
  /** Whether the add-member form's last attempt was refused, so its bad fields show. */
  readonly addAttempted = signal(false);
  /** Whether the email being edited was refused, so its input shows it. */
  readonly emailAttempted = signal(false);
  readonly memberBusy = signal<string | null>(null);
  readonly editing = signal<string | null>(null);
  readonly emailControl = new FormControl('', {
    nonNullable: true,
    validators: [Validators.email, Validators.maxLength(320)],
  });
  readonly newMember = new FormGroup({
    name: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(50), Validators.pattern(/\S/)],
    }),
    fullName: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(120), Validators.pattern(/\S/)],
    }),
    email: new FormControl('', {
      nonNullable: true,
      validators: [Validators.email, Validators.maxLength(320)],
    }),
  });
  readonly addingMember = signal(false);

  constructor() {
    // `/captain#picks` opens at a card: the router does not scroll to fragments by itself.
    inject(ActivatedRoute)
      .fragment.pipe(takeUntilDestroyed())
      .subscribe({
        next: (fragment) => {
          if (!fragment) return;
          afterNextRender(() => document.getElementById(fragment)?.scrollIntoView(), {
            injector: this.injector,
          });
        },
      });
  }

  dutyCreated(duty: { title: string; memberName: string; deadlineAt: string | null }): void {
    this.alerts.success(
      `${duty.title} created for ${duty.memberName}. Due ${this.time.format(duty.deadlineAt)}.`,
    );
  }

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
      action: (reason) => this.league.decideEvidence(evidence.id, decision, reason),
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
      window.open(await this.league.playbackUrl(review.evidence.assetId), '_blank', 'noopener');
      this.alerts.dismissKey(ALERT_KEYS.playback);
    } catch (error) {
      this.alerts.error(error instanceof Error ? error.message : 'The video is unavailable.', {
        key: ALERT_KEYS.playback,
      });
    }
  }

  edit(member: LeagueMember): void {
    this.alerts.dismissKey(ALERT_KEYS.email);
    this.emailAttempted.set(false);
    this.editing.set(member.id);
    this.emailControl.setValue(member.email ?? '');
  }

  cancelEdit(): void {
    this.alerts.dismissKey(ALERT_KEYS.email);
    this.editing.set(null);
  }

  async saveEmail(member: LeagueMember): Promise<void> {
    if (this.emailControl.invalid) {
      this.emailAttempted.set(true);
      this.alerts.warn('Enter a valid email address.', { key: ALERT_KEYS.email });
      this.focus(`email-${member.id}`);
      return;
    }
    this.emailAttempted.set(false);
    this.alerts.dismissKey(ALERT_KEYS.email);
    this.memberBusy.set(member.id);
    try {
      await this.league.updateMember(member.id, this.emailControl.value.trim() || null);
      this.editing.set(null);
      this.alerts.success(
        this.emailControl.value.trim()
          ? `${member.name} is reserved for ${this.emailControl.value.trim()}.`
          : `${member.name} is open for any member to claim.`,
      );
    } catch (error) {
      this.alerts.error(error instanceof Error ? error.message : 'The email could not be saved.', {
        key: ALERT_KEYS.email,
      });
    } finally {
      this.memberBusy.set(null);
    }
  }

  release(member: LeagueMember): void {
    this.reasonDialog().open({
      title: `Release ${member.name}?`,
      description: `The account that claimed ${member.name} loses access to the clubhouse and the name becomes claimable again. Duties and marks stay with ${member.name}.`,
      submitLabel: 'Release name',
      required: false,
      action: () => this.league.releaseMember(member.id),
      done: () => this.alerts.success(`${member.name} can be claimed again.`),
    });
  }

  /** Every row but the league captain's and the steward's own. The API decides the rest. */
  removable(member: LeagueMember): boolean {
    return member.id !== this.view.captainId() && member.id !== this.view.memberId();
  }

  remove(member: LeagueMember): void {
    const deleted = !member.claimed && !this.view.hasRecords(member.id);
    this.reasonDialog().open({
      title: `Remove ${member.name}?`,
      description: deleted
        ? `${member.name} comes off the team sheet. This name has no records yet and will be deleted.`
        : `${member.name} comes off the team sheet and the standings, and their open duties are voided. Their marks and past records stay, and you can reinstate them later.`,
      submitLabel: 'Remove',
      required: true,
      action: async (reason) => {
        this.memberBusy.set(member.id);
        try {
          await this.league.withdrawMember(member.id, reason);
        } finally {
          this.memberBusy.set(null);
        }
      },
      done: () => {
        this.alerts.success(
          deleted
            ? `${member.name} was deleted.`
            : `${member.name} was removed from the team sheet.`,
        );
        // The row is gone; focus moves to the withdrawn group (or the heading) instead.
        afterNextRender(
          () =>
            (
              this.withdrawnGroup()?.nativeElement.querySelector('summary') ??
              document.getElementById('members-heading')
            )?.focus(),
          { injector: this.injector },
        );
      },
    });
  }

  async reinstate(member: LeagueMember): Promise<void> {
    this.memberBusy.set(member.id);
    try {
      await this.league.reinstateMember(member.id);
      this.alerts.success(`${member.name} is back on the team sheet.`, {
        key: ALERT_KEYS.reinstate,
      });
    } catch (error) {
      this.alerts.error(
        error instanceof Error ? error.message : `${member.name} could not be reinstated.`,
        { key: ALERT_KEYS.reinstate },
      );
    } finally {
      this.memberBusy.set(null);
    }
  }

  removedOn(member: LeagueMember): string {
    return this.time.formatDate(member.leftAt, '');
  }

  async addMember(): Promise<void> {
    if (this.addingMember()) return;
    const { controls } = this.newMember;
    const problems = [
      ...(controls.name.invalid || controls.fullName.invalid
        ? [
            {
              field: controls.name.invalid ? 'name' : 'fullName',
              message: 'Give the member a nickname and full name.',
            },
          ]
        : []),
      ...(controls.email.invalid
        ? [{ field: 'email', message: 'Enter a valid email address.' }]
        : []),
    ];
    if (problems.length) {
      const [first, ...rest] = problems;
      this.addAttempted.set(true);
      this.alerts.warn(first.message, {
        key: ALERT_KEYS.addMember,
        details: rest.map((problem) => problem.message),
      });
      this.focus(`new-member-${first.field}`);
      return;
    }
    this.addAttempted.set(false);
    this.alerts.dismissKey(ALERT_KEYS.addMember);
    const { name, fullName, email } = this.newMember.getRawValue();
    this.addingMember.set(true);
    try {
      await this.league.addMember({
        name: name.trim(),
        fullName: fullName.trim(),
        email: email.trim() || null,
      });
      this.newMember.reset();
      this.alerts.success(`${name.trim()} added to the league.`, { key: ALERT_KEYS.addMember });
    } catch (error) {
      this.alerts.error(error instanceof Error ? error.message : 'The member could not be added.', {
        key: ALERT_KEYS.addMember,
      });
    } finally {
      this.addingMember.set(false);
    }
  }

  /** Moves focus to an input by id once its `aria-invalid` has rendered. */
  private focus(id: string): void {
    afterNextRender(
      () => this.host.nativeElement.querySelector<HTMLElement>(`[id="${id}"]`)?.focus(),
      { injector: this.injector },
    );
  }

  private completionInstant(review: ReviewView): string {
    const { evidence, duty } = review;
    return this.time.format(
      evidence.submitterId === duty.memberId ? evidence.submittedAt : evidence.claimedCompletedAt,
    );
  }
}
