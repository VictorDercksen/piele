import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { LeagueContext } from '../../../core/league/league-context';
import { Icon } from '../../../shared/icon/icon';
import { Loader } from '../../../shared/loader/loader';

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
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  readonly leagueName = inject(LeagueContext).name;
  readonly request = signal<ReasonRequest | null>(null);
  readonly error = signal('');
  readonly busy = signal(false);
  readonly reason = new FormControl('', { nonNullable: true, validators: [Validators.maxLength(500)] });

  /** What had focus when the dialog opened; it gets it back on close while still on the page. */
  private opener: HTMLElement | null = null;

  open(request: ReasonRequest): void {
    this.opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.request.set(request);
    this.error.set('');
    this.reason.reset();
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

  restoreFocus(): void {
    const opener = this.opener;
    this.opener = null;
    if (opener?.isConnected && !(opener as HTMLButtonElement).disabled) opener.focus();
  }

  async submit(): Promise<void> {
    const request = this.request();
    if (!request || this.busy()) return;
    if (this.reason.invalid) {
      this.error.set('Give a reason so the register explains itself.');
      return;
    }
    this.busy.set(true);
    this.error.set('');
    try {
      await request.action(this.reason.value.trim());
      this.close();
      request.done?.();
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'That did not work.');
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
