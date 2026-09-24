import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { fromLocalInput } from '../../../core/competition/league-time';
import { ToastService } from '../../../core/feedback/toast.service';
import { LeagueData } from '../../../core/league/league-data';
import { RoundDutyView, RoundViewService } from '../../../core/league/round-view.service';
import { Icon } from '../../../shared/icon/icon';
import { Loader } from '../../../shared/loader/loader';

/** Proposed initial limit (plan P6), pending a real phone upload test. */
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

/**
 * Evidence video selection and submission for a duty. Members submit their own; the
 * captain can record evidence for another member with the completion time.
 */
@Component({
  selector: 'app-evidence-dialog',
  templateUrl: './evidence-dialog.html',
  styleUrl: './evidence-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, Icon, Loader],
})
export class EvidenceDialog {
  private readonly toast = inject(ToastService);
  private readonly league = inject(LeagueData);
  readonly view = inject(RoundViewService);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  readonly duty = signal<RoundDutyView | null>(null);
  readonly file = signal<File | null>(null);
  readonly error = signal('');
  readonly busy = signal(false);
  /** True when the captain records evidence on the member's behalf. */
  readonly onBehalf = computed(() => !!this.duty() && !this.duty()!.mine);
  readonly note = new FormControl('', {
    nonNullable: true,
    validators: [Validators.maxLength(500)],
  });
  readonly completedAt = new FormControl('', { nonNullable: true });

  open(duty: RoundDutyView): void {
    const live = duty.status === 'open' || duty.status === 'pending_deadline';
    if (!live || (!duty.mine && !this.view.isCaptain())) return;
    this.duty.set(duty);
    this.file.set(null);
    this.error.set('');
    this.note.reset();
    this.completedAt.reset();
    this.dialog().nativeElement.showModal();
  }

  close(): void {
    this.dialog().nativeElement.close();
  }

  pickFile(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0] ?? null;
    this.file.set(null);
    this.error.set('');
    if (!file) return;
    if (!file.type.startsWith('video/')) {
      this.error.set('Choose a video file to continue.');
      return;
    }
    if (file.size > MAX_VIDEO_BYTES) {
      this.error.set('Choose a video smaller than 50 MB.');
      return;
    }
    this.file.set(file);
  }

  async submit(): Promise<void> {
    const duty = this.duty();
    const file = this.file();
    if (!duty || !file || this.note.invalid || this.busy()) return;
    let claimedCompletedAt: string | undefined;
    if (this.onBehalf()) {
      const instant = fromLocalInput(this.completedAt.value);
      if (!instant) {
        this.error.set('Record when the duty was completed.');
        return;
      }
      if (new Date(instant).getTime() > Date.now()) {
        this.error.set('The completion time cannot be in the future.');
        return;
      }
      claimedCompletedAt = instant;
    }
    this.busy.set(true);
    this.error.set('');
    try {
      await this.league.submitEvidence({
        dutyIds: [duty.id],
        file,
        note: this.note.value.trim(),
        subjectMemberId: this.onBehalf() ? duty.memberId : undefined,
        claimedCompletedAt,
      });
      this.close();
      const outcome = this.onBehalf()
        ? `Evidence recorded for ${duty.memberName}. Accept it from the captain's desk.`
        : 'Evidence submitted for review.';
      this.toast.show(this.view.sample ? `Sample only: ${outcome} No file was uploaded.` : outcome);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Unable to submit evidence.');
    } finally {
      this.busy.set(false);
    }
  }
}
