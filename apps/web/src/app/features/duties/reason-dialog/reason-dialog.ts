import { HlmDialogImports } from '@spartan-ng/helm/dialog';
import { HlmDialog } from '@spartan-ng/helm/dialog';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmTextarea } from '@spartan-ng/helm/textarea';
import { HlmLabel } from '@spartan-ng/helm/label';
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
import { reasonValidators } from './reason-dialog.form';
import { ReasonRequest } from './reason-dialog.models';

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
  /* prettier-ignore */
  imports: [
    ReactiveFormsModule,
    Icon,
    Loader,
    HlmButton,
    HlmTextarea,
    HlmLabel,
    HlmDialogImports,
  ],
})
export class ReasonDialog {
  private readonly alerts = inject(AlertService);
  private readonly dialog = viewChild.required(HlmDialog);
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
    this.reason.setValidators(reasonValidators(request.required));
    this.reason.updateValueAndValidity();
    this.dialog().open();
  }

  close(): void {
    this.dialog().close();
  }

  /** The dialog closed, however: the warning goes with it (a failure card stays to be read). */
  dialogChanged(state: 'open' | 'closed'): void {
    if (state === 'closed') this.closed();
  }

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
      const warning = request.refused?.(error);
      if (warning) {
        this.alerts.warn(warning, { key: REASON_FAILURE });
        this.close();
        return;
      }
      this.alerts.error(error instanceof Error ? error.message : 'That did not work.', {
        key: REASON_FAILURE,
      });
    } finally {
      this.busy.set(false);
    }
  }
}
