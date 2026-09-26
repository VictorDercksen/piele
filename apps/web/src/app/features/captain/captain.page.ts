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
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { LeagueTime } from '../../core/competition/league-time';
import { ToastService } from '../../core/feedback/toast.service';
import { LeagueData } from '../../core/league/league-data';
import { LeagueMember } from '../../core/league/league.models';
import { ReviewView, RoundViewService } from '../../core/league/round-view.service';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucidePlay } from '@ng-icons/lucide';
import { Icon } from '../../shared/icon/icon';
import { Loader } from '../../shared/loader/loader';
import { ReasonDialog } from '../duties/reason-dialog/reason-dialog';
import { AppearanceCard } from './appearance-card/appearance-card';
import { JoinLinkCard } from './join-link-card/join-link-card';

/**
 * The steward's desk (the captain, or the admin): evidence awaiting a decision in the selected
 * round, the team sheet with removal and reinstatement, the join link and the league's look.
 */
@Component({
  selector: 'app-captain-page',
  templateUrl: './captain.page.html',
  styleUrl: './captain.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, Icon, NgIcon, Loader, ReasonDialog, JoinLinkCard, AppearanceCard],
  viewProviders: [provideIcons({ lucidePlay })],
})
export class CaptainPage {
  private readonly league = inject(LeagueData);
  private readonly time = inject(LeagueTime);
  private readonly toast = inject(ToastService);
  readonly view = inject(RoundViewService);
  private readonly injector = inject(Injector);
  readonly reasonDialog = viewChild.required(ReasonDialog);
  private readonly withdrawnGroup = viewChild<ElementRef<HTMLDetailsElement>>('withdrawnGroup');
  readonly withdrawError = signal('');
  readonly playbackError = signal('');
  readonly memberError = signal('');
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
        this.toast.show(
          decision === 'accepted'
            ? `${duty.title} completed for ${duty.memberName}.`
            : `Evidence for ${duty.title} rejected.`,
        ),
    });
  }

  async watch(review: ReviewView): Promise<void> {
    this.playbackError.set('');
    try {
      window.open(await this.league.playbackUrl(review.evidence.assetId), '_blank', 'noopener');
    } catch (error) {
      this.playbackError.set(error instanceof Error ? error.message : 'The video is unavailable.');
    }
  }

  edit(member: LeagueMember): void {
    this.memberError.set('');
    this.editing.set(member.id);
    this.emailControl.setValue(member.email ?? '');
  }

  cancelEdit(): void {
    this.editing.set(null);
  }

  async saveEmail(member: LeagueMember): Promise<void> {
    if (this.emailControl.invalid) {
      this.memberError.set('Enter a valid email address.');
      return;
    }
    this.memberBusy.set(member.id);
    this.memberError.set('');
    try {
      await this.league.updateMember(member.id, this.emailControl.value.trim() || null);
      this.editing.set(null);
      this.toast.show(
        this.emailControl.value.trim()
          ? `${member.name} is reserved for ${this.emailControl.value.trim()}.`
          : `${member.name} is open for any member to claim.`,
      );
    } catch (error) {
      this.memberError.set(
        error instanceof Error ? error.message : 'The email could not be saved.',
      );
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
      done: () => this.toast.show(`${member.name} can be claimed again.`),
    });
  }

  /** Every row but the league captain's and the steward's own. The API decides the rest. */
  removable(member: LeagueMember): boolean {
    return member.id !== this.view.captainId() && member.id !== this.view.memberId();
  }

  remove(member: LeagueMember): void {
    const deleted = !member.claimed && !this.view.hasRecords(member.id);
    this.withdrawError.set('');
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
        this.toast.show(
          deleted ? `${member.name} was deleted.` : `${member.name} was removed from the team sheet.`,
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
    this.withdrawError.set('');
    try {
      await this.league.reinstateMember(member.id);
      this.toast.show(`${member.name} is back on the team sheet.`);
    } catch (error) {
      this.withdrawError.set(
        error instanceof Error ? error.message : `${member.name} could not be reinstated.`,
      );
    } finally {
      this.memberBusy.set(null);
    }
  }

  removedOn(member: LeagueMember): string {
    return this.time.formatDate(member.leftAt, '');
  }

  async addMember(): Promise<void> {
    if (this.newMember.invalid || this.addingMember()) {
      this.newMember.markAllAsTouched();
      this.memberError.set('Give the member a nickname and full name.');
      return;
    }
    const { name, fullName, email } = this.newMember.getRawValue();
    this.addingMember.set(true);
    this.memberError.set('');
    try {
      await this.league.addMember({
        name: name.trim(),
        fullName: fullName.trim(),
        email: email.trim() || null,
      });
      this.newMember.reset();
      this.toast.show(`${name.trim()} added to the league.`);
    } catch (error) {
      this.memberError.set(
        error instanceof Error ? error.message : 'The member could not be added.',
      );
    } finally {
      this.addingMember.set(false);
    }
  }

  private completionInstant(review: ReviewView): string {
    const { evidence, duty } = review;
    return this.time.format(
      evidence.submitterId === duty.memberId ? evidence.submittedAt : evidence.claimedCompletedAt,
    );
  }
}
