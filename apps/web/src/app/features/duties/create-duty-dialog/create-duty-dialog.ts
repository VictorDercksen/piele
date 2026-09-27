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
  readonly memberId = computed(() => this.values().memberId ?? '');
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
  /** Fixtures left off the pick confirmation; every candidate is ticked to start with. */
  private readonly unticked = signal<ReadonlySet<string>>(new Set());
  /**
   * For a pick confirmation: the round's fixtures that have kicked off where the member has
   * no pick, or a missed or default one. The duty links those picks.
   */
  readonly pickFixtures = computed<readonly PickFixtureOption[]>(() => {
    const memberId = this.memberId();
    if (this.type() !== 'pick_confirmation' || !memberId) return [];
    const round = this.competition.round(this.roundId());
    return (round?.fixtures ?? []).flatMap((fixture) => {
      const picks = this.view.picksFor(fixture.id);
      if (!picks?.locked) return [];
      const pick = picks.rows.find((row) => row.memberId === memberId);
      if (pick && pick.side !== 'missed' && !pick.isDefault) return [];
      return [
        {
          id: fixture.id,
          label: `${fixture.home} v ${fixture.away}`,
          state: !pick ? 'No pick' : pick.side === 'missed' ? 'Missed' : 'Default pick',
          checked: !this.unticked().has(fixture.id),
        },
      ];
    });
  });

  /** Opens the form, optionally filled in, e.g. a spoon duty proposed from the round table. */
  open(prefill: DutyPrefill = {}): void {
    this.form.reset({
      memberId: prefill.memberId ?? '',
      type: prefill.type ?? 'spoon',
      roundId: prefill.roundId ?? this.view.round().id,
      deadline: '',
      reason: prefill.reason ?? '',
    });
    this.unticked.set(new Set());
    this.error.set('');
    this.submitted.set(false);
    this.dialog().nativeElement.showModal();
  }

  togglePickFixture(fixtureId: string, event: Event): void {
    const checked = event.target instanceof HTMLInputElement && event.target.checked;
    this.unticked.update((ids) => {
      const next = new Set(ids);
      if (checked) next.delete(fixtureId);
      else next.add(fixtureId);
      return next;
    });
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
    const pickFixtureIds =
      type === 'pick_confirmation'
        ? this.pickFixtures()
            .filter((f) => f.checked)
            .map((f) => f.id)
        : [];
    this.busy.set(true);
    this.error.set('');
    try {
      await this.league.createDuty({
        memberId,
        type,
        roundId: Number(roundId),
        deadlineAt,
        reason: reason.trim(),
        ...(pickFixtureIds.length ? { pickFixtureIds } : {}),
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

/** What a caller can fill in when it opens the form. */
export interface DutyPrefill {
  readonly memberId?: string;
  readonly type?: DutyType;
  readonly roundId?: number;
  readonly reason?: string;
}

/** A fixture the pick confirmation can cover, with the member's pick state there. */
export interface PickFixtureOption {
  readonly id: string;
  readonly label: string;
  readonly state: 'No pick' | 'Missed' | 'Default pick';
  readonly checked: boolean;
}
