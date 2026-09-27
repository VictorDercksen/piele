import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { AlertService } from '../../../core/feedback/alert.service';
import { highlightProblem } from '../../../core/feedback/problem-highlight';
import { LeagueContext } from '../../../core/league/league-context';
import { Icon } from '../../../shared/icon/icon';
import { Loader } from '../../../shared/loader/loader';

/** The key of the dialog's warning card; a new attempt replaces it, closing clears it. */
export const REASON_WARNING = 'reason';
/** The key of the dialog's failure card; a retry replaces it and a success clears it. */
export const REASON_FAILURE = 'reason-failed';

/**
 * A confirmation with a reason, used to void duties, decide evidence and remove members, and
 * without one (`noReason`) for plain confirmations such as rotating the join link or, in the
 * management centre, archiving a league.
 */
@Component({
  selector: 'app-reason-dialog',
  templateUrl: './reason-dialog.html',
  styleUrl: './reason-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, Icon, Loader],
})
export class ReasonDialog {
  private readonly alerts = inject(AlertService);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private readonly reasonInput = viewChild<ElementRef<HTMLTextAreaElement>>('reasonInput');
  readonly leagueName = inject(LeagueContext).name;
  readonly request = signal<ReasonRequest | null>(null);
  readonly busy = signal(false);
  /** The reason was wanting on the last attempt: `aria-invalid` until it changes. */
  readonly invalid = signal(false);
  readonly reason = new FormControl('', {
    nonNullable: true,
    validators: [Validators.maxLength(500)],
  });

  constructor() {
    this.reason.valueChanges.pipe(takeUntilDestroyed()).subscribe({
      next: () => this.invalid.set(false),
    });
  }

  /** What had focus when the dialog opened; it gets it back on close while still on the page. */
  private opener: HTMLElement | null = null;

  open(request: ReasonRequest): void {
    this.opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.request.set(request);
    this.reason.reset();
    this.invalid.set(false);
    this.reason.setValidators(
      request.required
        ? [Validators.required, Validators.pattern(/\S/), Validators.maxLength(500)]
        : [Validators.maxLength(500)],
    );
    this.reason.updateValueAndValidity();
    this.dialog().nativeElement.showModal();
  }

  close(): void {
    this.dialog().nativeElement.close();
  }

  /** The dialog closed, however: the warning goes with it (a failure card stays to be read). */
  closed(): void {
    this.alerts.dismissKey(REASON_WARNING);
    this.restoreFocus();
  }

  private restoreFocus(): void {
    const opener = this.opener;
    this.opener = null;
    if (opener?.isConnected && !(opener as HTMLButtonElement).disabled) opener.focus();
  }

  async submit(): Promise<void> {
    const request = this.request();
    if (!request || this.busy()) return;
    if (this.reason.invalid) {
      this.invalid.set(true);
      highlightProblem(this.reasonInput()?.nativeElement);
      this.alerts.warn('Give a reason so the register explains itself.', { key: REASON_WARNING });
      return;
    }
    this.alerts.dismissKey(REASON_WARNING);
    this.busy.set(true);
    try {
      await request.action(this.reason.value.trim());
      this.alerts.dismissKey(REASON_FAILURE);
      this.close();
      request.done?.();
    } catch (error) {
      this.alerts.error(error instanceof Error ? error.message : 'That did not work.', {
        key: REASON_FAILURE,
      });
    } finally {
      this.busy.set(false);
    }
  }
}

export interface ReasonRequest {
  /** The line above the title; the league's captain's desk by default. */
  readonly eyebrow?: string;
  readonly title: string;
  readonly description: string;
  readonly submitLabel: string;
  readonly required: boolean;
  /** A plain confirmation: no reason field. */
  readonly noReason?: boolean;
  readonly spoon?: boolean;
  readonly action: (reason: string) => Promise<void>;
  readonly done?: () => void;
}
