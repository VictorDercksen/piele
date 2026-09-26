import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { CompetitionService } from '../../../core/competition/competition.service';
import { LeagueTime } from '../../../core/competition/league-time';
import { LeagueData } from '../../../core/league/league-data';
import { DutyType } from '../../../core/league/league.models';
import { RoundViewService } from '../../../core/league/round-view.service';
import { Icon } from '../../../shared/icon/icon';
import { Loader } from '../../../shared/loader/loader';

/**
 * Captain's duty form. Spoon duties default to the next round's first kickoff; a pick
 * confirmation needs an explicit deadline. The API enforces captain authority.
 */
@Component({
  selector: 'app-create-duty-dialog',
  templateUrl: './create-duty-dialog.html',
  styleUrl: './create-duty-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, Icon, Loader],
})
export class CreateDutyDialog {
  private readonly league = inject(LeagueData);
  private readonly competition = inject(CompetitionService);
  private readonly time = inject(LeagueTime);
  /** The display zone's abbreviation, for the deadline label. */
  readonly zoneName = this.time.abbreviation;
  readonly view = inject(RoundViewService);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  readonly created = output<{ title: string; memberName: string; deadlineAt: string | null }>();
  readonly error = signal('');
  readonly busy = signal(false);
  readonly submitted = signal(false);
  readonly rounds = computed(() => this.competition.rounds);
  readonly form = new FormGroup({
    memberId: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    type: new FormControl<DutyType>('spoon', { nonNullable: true }),
    roundId: new FormControl(1, { nonNullable: true }),
    deadline: new FormControl('', { nonNullable: true }),
    reason: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(500)] }),
  });
  private readonly values = toSignal(this.form.valueChanges, { initialValue: this.form.value });
  readonly type = computed(() => this.values().type ?? 'spoon');
  readonly roundId = computed(() => Number(this.values().roundId ?? 1));
  readonly members = computed(() => this.view.members().filter((m) => m.inSeason));
  /** The plan's default: due when the following round kicks off. */
  readonly defaultDeadline = computed(() =>
    this.type() === 'spoon' && this.roundId() < this.rounds().length
      ? this.competition.current().firstKickoff(this.roundId() + 1)
      : null,
  );
  readonly defaultDeadlineLabel = computed(() => this.time.format(this.defaultDeadline(), 'unknown'));
  readonly needsDeadline = computed(() => this.type() !== 'spoon' || !this.defaultDeadline());
  readonly deadlineOverridden = computed(() => !!this.values().deadline);

  open(): void {
    this.form.reset({
      memberId: '',
      type: 'spoon',
      roundId: this.view.round().id,
      deadline: '',
      reason: '',
    });
    this.error.set('');
    this.submitted.set(false);
    this.dialog().nativeElement.showModal();
  }

  close(): void {
    this.dialog().nativeElement.close();
  }

  useDefault(): void {
    this.form.controls.deadline.setValue('');
  }

  suggestDefault(): void {
    this.form.controls.deadline.setValue(this.time.toLocalInput(this.defaultDeadline()));
  }

  async submit(): Promise<void> {
    this.submitted.set(true);
    if (this.form.invalid || this.busy()) return;
    const { memberId, type, roundId, deadline, reason } = this.form.getRawValue();
    const deadlineAt = deadline ? this.time.fromLocalInput(deadline) : null;
    if (deadline && !deadlineAt) {
      this.error.set('Enter a valid deadline.');
      return;
    }
    if (this.needsDeadline() && !deadlineAt && type !== 'spoon') {
      this.error.set('A pick confirmation needs a deadline.');
      return;
    }
    this.busy.set(true);
    this.error.set('');
    try {
      await this.league.createDuty({
        memberId,
        type,
        roundId: Number(roundId),
        deadlineAt,
        reason: reason.trim(),
      });
      const member = this.members().find((m) => m.id === memberId);
      const round = this.competition.round(Number(roundId));
      this.close();
      this.created.emit({
        title: `${round?.title ?? 'Round'} ${type === 'spoon' ? 'Spoon duty' : 'Pick confirmation'}`,
        memberName: member?.name ?? 'the member',
        deadlineAt: deadlineAt ?? this.defaultDeadline(),
      });
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'The duty could not be created.');
    } finally {
      this.busy.set(false);
    }
  }
}
