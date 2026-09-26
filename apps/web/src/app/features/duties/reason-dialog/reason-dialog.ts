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

/** A confirmation with a reason, used to void duties and to decide evidence. */
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

  open(request: ReasonRequest): void {
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
  readonly title: string;
  readonly description: string;
  readonly submitLabel: string;
  readonly required: boolean;
  readonly spoon?: boolean;
  readonly action: (reason: string) => Promise<void>;
  readonly done?: () => void;
}
