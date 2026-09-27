import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { LeagueTime } from '../../../core/competition/league-time';
import { AlertService } from '../../../core/feedback/alert.service';
import { highlightProblem } from '../../../core/feedback/problem-highlight';
import { LeagueData } from '../../../core/league/league-data';
import { RoundDutyView, RoundViewService } from '../../../core/league/round-view.service';
import { Icon } from '../../../shared/icon/icon';
import { Loader } from '../../../shared/loader/loader';

/** Proposed initial limit (plan P6), pending a real phone upload test. */
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

/** The key of the dialog's warning card; a new attempt replaces it. */
export const EVIDENCE_WARNING = 'evidence';
/** The key of the dialog's failure card; a retry replaces it and a success clears it. */
export const EVIDENCE_FAILURE = 'evidence-failed';

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
  private readonly alerts = inject(AlertService);
  private readonly league = inject(LeagueData);
  private readonly time = inject(LeagueTime);
  /** The display zone's abbreviation, for the completion time label. */
  readonly zoneName = this.time.abbreviation;
  readonly view = inject(RoundViewService);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private readonly fileInput = viewChild.required<ElementRef<HTMLInputElement>>('fileInput');
  private readonly completedInput = viewChild<ElementRef<HTMLInputElement>>('completedInput');
  readonly duty = signal<RoundDutyView | null>(null);
  readonly file = signal<File | null>(null);
  /** The control the last warning was about, marked `aria-invalid` until it changes. */
  readonly invalid = signal<'file' | 'completed' | null>(null);
  readonly busy = signal(false);
  /** True when the captain records evidence on the member's behalf. */
  readonly onBehalf = computed(() => !!this.duty() && !this.duty()!.mine);
  readonly note = new FormControl('', {
    nonNullable: true,
    validators: [Validators.maxLength(500)],
  });
  readonly completedAt = new FormControl('', { nonNullable: true });

  constructor() {
    this.completedAt.valueChanges.pipe(takeUntilDestroyed()).subscribe({
      next: () => {
        if (this.invalid() === 'completed') this.invalid.set(null);
      },
    });
  }

  open(duty: RoundDutyView): void {
    const live = duty.status === 'open' || duty.status === 'pending_deadline';
    if (!live || (!duty.mine && !this.view.administers())) return;
    this.duty.set(duty);
    this.file.set(null);
    this.invalid.set(null);
    this.note.reset();
    this.completedAt.reset();
    this.dialog().nativeElement.showModal();
  }

  close(): void {
    this.dialog().nativeElement.close();
  }

  /** The dialog closed, however: its warning goes with it; a failure card stays to be read. */
  closed(): void {
    this.alerts.dismissKey(EVIDENCE_WARNING);
  }

  pickFile(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0] ?? null;
    this.file.set(null);
    if (this.invalid() === 'file') {
      // A new choice answers the warning about the last one.
      this.invalid.set(null);
      this.alerts.dismissKey(EVIDENCE_WARNING);
    }
    if (!file) return;
    if (!file.type.startsWith('video/')) {
      this.warn('file', 'Choose a video file to continue.');
      return;
    }
    if (file.size > MAX_VIDEO_BYTES) {
      this.warn('file', 'Choose a video smaller than 50 MB.');
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
      const instant = this.time.fromLocalInput(this.completedAt.value);
      if (!instant) {
        this.warn('completed', 'Record when the duty was completed.');
        return;
      }
      if (new Date(instant).getTime() > Date.now()) {
        this.warn('completed', 'The completion time cannot be in the future.');
        return;
      }
      claimedCompletedAt = instant;
    }
    this.invalid.set(null);
    this.alerts.dismissKey(EVIDENCE_WARNING);
    this.busy.set(true);
    try {
      await this.league.submitEvidence({
        dutyIds: [duty.id],
        file,
        note: this.note.value.trim(),
        subjectMemberId: this.onBehalf() ? duty.memberId : undefined,
        claimedCompletedAt,
      });
      this.alerts.dismissKey(EVIDENCE_FAILURE);
      this.close();
      const outcome = this.onBehalf()
        ? `Evidence recorded for ${duty.memberName}. Accept it from the captain's desk.`
        : 'Evidence submitted for review.';
      this.alerts.success(
        this.view.sample ? `Sample only: ${outcome} No file was uploaded.` : outcome,
      );
    } catch (error) {
      this.alerts.error(error instanceof Error ? error.message : 'Unable to submit evidence.', {
        key: EVIDENCE_FAILURE,
      });
    } finally {
      this.busy.set(false);
    }
  }

  /** One warning card per attempt, with the control concerned marked and highlighted. */
  private warn(control: 'file' | 'completed', message: string): void {
    this.invalid.set(control);
    const input = control === 'file' ? this.fileInput() : this.completedInput();
    highlightProblem(input?.nativeElement);
    this.alerts.warn(message, { key: EVIDENCE_WARNING });
  }
}
