import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { ToastService } from '../../../core/feedback/toast.service';
import { Poll } from '../../../core/league/league.models';
import { RoundViewService } from '../../../core/league/round-view.service';
import { Icon } from '../../../shared/icon/icon';

/** Casts or revises the member's single-choice ballot while the poll is open. */
@Component({
  selector: 'app-vote-dialog',
  templateUrl: './vote-dialog.html',
  styleUrl: './vote-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, Icon],
})
export class VoteDialog {
  private readonly toast = inject(ToastService);
  readonly view = inject(RoundViewService);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  readonly poll = signal<Poll | null>(null);
  readonly error = signal('');
  readonly busy = signal(false);
  readonly choice = new FormControl('', { nonNullable: true, validators: [Validators.required] });
  readonly chosen = toSignal(this.choice.valueChanges, { initialValue: this.choice.value });

  open(poll: Poll): void {
    if (poll.status !== 'Open') return;
    this.poll.set(poll);
    this.error.set('');
    this.choice.setValue(poll.myChoice ?? '');
    this.dialog().nativeElement.showModal();
  }

  close(): void {
    this.dialog().nativeElement.close();
  }

  async submit(): Promise<void> {
    const poll = this.poll();
    if (!poll || this.choice.invalid || this.busy()) return;
    this.busy.set(true);
    try {
      await this.view.castVote(poll.id, this.choice.value);
      this.close();
      this.toast.show(
        this.view.sample
          ? 'Your sample vote is recorded. It resets when you reload.'
          : 'Your vote is recorded. You can change it until the poll closes.',
      );
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Unable to record your vote.');
    } finally {
      this.busy.set(false);
    }
  }
}
