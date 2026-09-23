import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { ToastService } from '../../../core/feedback/toast.service';
import { RoundDutyView, RoundViewService } from '../../../core/league/round-view.service';
import { Icon } from '../../../shared/icon/icon';

/** Proposed initial limit (plan P6), pending a real phone upload test. */
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

/** Evidence video selection and submission for one of the member's own duties. */
@Component({
  selector: 'app-evidence-dialog',
  templateUrl: './evidence-dialog.html',
  styleUrl: './evidence-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, Icon],
})
export class EvidenceDialog {
  private readonly toast = inject(ToastService);
  readonly view = inject(RoundViewService);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  readonly duty = signal<RoundDutyView | null>(null);
  readonly file = signal<File | null>(null);
  readonly error = signal('');
  readonly busy = signal(false);
  readonly note = new FormControl('', {
    nonNullable: true,
    validators: [Validators.maxLength(500)],
  });

  open(duty: RoundDutyView): void {
    if (!duty.mine || duty.status !== 'Open') return;
    this.duty.set(duty);
    this.file.set(null);
    this.error.set('');
    this.note.reset();
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
    this.busy.set(true);
    try {
      await this.view.submitEvidence(duty.id, file, this.note.value.trim());
      this.close();
      this.toast.show(
        this.view.sample
          ? 'Sample evidence submitted for review. No file was uploaded.'
          : 'Evidence submitted for review.',
      );
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Unable to submit evidence.');
    } finally {
      this.busy.set(false);
    }
  }
}
