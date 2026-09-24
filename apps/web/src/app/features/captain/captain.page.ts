import { ChangeDetectionStrategy, Component, inject, signal, viewChild } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { formatLeagueTime, formatRelative } from '../../core/competition/league-time';
import { ToastService } from '../../core/feedback/toast.service';
import { LeagueData } from '../../core/league/league-data';
import { LeagueMember } from '../../core/league/league.models';
import { ReviewView, RoundViewService } from '../../core/league/round-view.service';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucidePlay } from '@ng-icons/lucide';
import { Icon } from '../../shared/icon/icon';
import { Loader } from '../../shared/loader/loader';
import { ReasonDialog } from '../duties/reason-dialog/reason-dialog';

/** Evidence awaiting the captain in the selected round, and the season's members. */
@Component({
  selector: 'app-captain-page',
  templateUrl: './captain.page.html',
  styleUrl: './captain.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, Icon, NgIcon, Loader, ReasonDialog],
  viewProviders: [provideIcons({ lucidePlay })],
})
export class CaptainPage {
  private readonly league = inject(LeagueData);
  private readonly toast = inject(ToastService);
  readonly view = inject(RoundViewService);
  readonly reasonDialog = viewChild.required(ReasonDialog);
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
    return formatRelative(review.evidence.submittedAt);
  }

  completion(review: ReviewView): string {
    const { evidence, duty } = review;
    const own = evidence.submitterId === duty.memberId;
    return own
      ? `Counts from submission · ${formatLeagueTime(evidence.submittedAt)}`
      : `Recorded by ${evidence.submitterName} · completed ${formatLeagueTime(evidence.claimedCompletedAt)}`;
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
    return formatLeagueTime(
      evidence.submitterId === duty.memberId ? evidence.submittedAt : evidence.claimedCompletedAt,
    );
  }
}
