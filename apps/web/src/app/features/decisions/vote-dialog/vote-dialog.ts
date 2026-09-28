import { HlmRadioGroup } from '@spartan-ng/helm/radio-group';
import { HlmRadio } from '@spartan-ng/helm/radio-group';
import { HlmDialogImports } from '@spartan-ng/helm/dialog';
import { HlmDialog } from '@spartan-ng/helm/dialog';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmLabel } from '@spartan-ng/helm/label';
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
import { FixtureService } from '../../../core/competition/fixture.service';
import { AlertService } from '../../../core/feedback/alert.service';
import { LeagueContext } from '../../../core/league/league-context';
import { LeagueRecordsService } from '../../../core/league/league-records.service';
import { Poll } from '../../../core/league/league.models';
import { PollControlService } from '../../../core/league/polls/poll-control.service';
import { Icon } from '../../../shared/icon/icon';
import { Loader } from '../../../shared/loader/loader';

/** The key of the vote's failure card; a retry replaces it and a success clears it. */
export const VOTE_FAILURE = 'vote-failed';

/** Casts or revises the member's single-choice ballot while the poll is open. */
@Component({
  selector: 'app-vote-dialog',
  templateUrl: './vote-dialog.html',
  styleUrl: './vote-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  /* prettier-ignore */
  imports: [
    ReactiveFormsModule,
    Icon,
    Loader,
    HlmButton,
    HlmLabel,
    HlmRadioGroup,
    HlmRadio,
    HlmDialogImports,
  ],
})
export class VoteDialog {
  private readonly alerts = inject(AlertService);
  private readonly pollControl = inject(PollControlService);
  private readonly records = inject(LeagueRecordsService);
  readonly context = inject(LeagueContext);
  readonly fixtures = inject(FixtureService);
  private readonly dialog = viewChild.required(HlmDialog);
  readonly poll = signal<Poll | null>(null);
  readonly busy = signal(false);
  readonly choice = new FormControl('', { nonNullable: true, validators: [Validators.required] });
  readonly chosen = toSignal(this.choice.valueChanges, { initialValue: this.choice.value });

  open(poll: Poll): void {
    if (poll.status !== 'Open') return;
    this.poll.set(poll);
    this.choice.setValue(poll.myChoice ?? '');
    this.dialog().open();
  }

  close(): void {
    this.dialog().close();
  }

  async submit(): Promise<void> {
    const poll = this.poll();
    if (!poll || this.choice.invalid || this.busy()) return;
    this.busy.set(true);
    try {
      await this.pollControl.castVote(poll.id, this.choice.value);
      this.alerts.dismissKey(VOTE_FAILURE);
      this.close();
      this.alerts.success(
        this.records.sample
          ? 'Your sample vote is recorded. It resets when you reload.'
          : 'Your vote is recorded. You can change it until the poll closes.',
      );
    } catch (error) {
      this.alerts.error(error instanceof Error ? error.message : 'Unable to record your vote.', {
        key: VOTE_FAILURE,
      });
    } finally {
      this.busy.set(false);
    }
  }
}
