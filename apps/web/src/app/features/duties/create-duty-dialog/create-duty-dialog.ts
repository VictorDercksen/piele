import { SearchSelect } from '../../../shared/search-select/search-select';
import { HlmDialogImports } from '@spartan-ng/helm/dialog';
import { HlmDialog } from '@spartan-ng/helm/dialog';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmInput } from '@spartan-ng/helm/input';
import { HlmTextarea } from '@spartan-ng/helm/textarea';
import { HlmLabel } from '@spartan-ng/helm/label';
import { HlmCheckbox } from '@spartan-ng/helm/checkbox';
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
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { CompetitionService } from '../../../core/competition/competition.service';
import { FixtureService } from '../../../core/competition/fixture.service';
import { LeagueTime } from '../../../core/competition/league-time';
import { AlertService } from '../../../core/feedback/alert.service';
import { highlightProblem } from '../../../core/feedback/problem-highlight';
import { DutyControlService } from '../../../core/league/duties/duty-control.service';
import { LeagueContext } from '../../../core/league/league-context';
import { DutyType } from '../../../core/league/league.models';
import { MemberService } from '../../../core/league/members/member.service';
import { PickService } from '../../../core/league/picks/pick.service';
import { Icon } from '../../../shared/icon/icon';
import { Loader } from '../../../shared/loader/loader';

/** The key of the form's warning card; a new attempt replaces it. */
export const CREATE_DUTY_WARNING = 'create-duty';
/** The key of the form's failure card; a retry replaces it and a success clears it. */
export const CREATE_DUTY_FAILURE = 'create-duty-failed';

/**
 * Captain's duty form. Spoon duties default to the next round's first kickoff; a pick
 * confirmation needs an explicit deadline. The API enforces captain authority.
 */
@Component({
  selector: 'app-create-duty-dialog',
  templateUrl: './create-duty-dialog.html',
  styleUrl: './create-duty-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  /* prettier-ignore */
  imports: [
    SearchSelect,
    ReactiveFormsModule,
    Icon,
    Loader,
    HlmButton,
    HlmInput,
    HlmTextarea,
    HlmLabel,
    HlmCheckbox,
    HlmDialogImports,
  ],
})
export class CreateDutyDialog {
  private readonly alerts = inject(AlertService);
  private readonly dutyControl = inject(DutyControlService);
  private readonly fixtures = inject(FixtureService);
  private readonly memberService = inject(MemberService);
  private readonly picks = inject(PickService);
  private readonly competition = inject(CompetitionService);
  private readonly time = inject(LeagueTime);
  /** The display zone's abbreviation, for the deadline label. */
  readonly zoneName = this.time.abbreviation;
  readonly context = inject(LeagueContext);
  private readonly dialog = viewChild.required(HlmDialog);
  private readonly memberSelect = viewChild.required<unknown, ElementRef<HTMLElement>>(
    'memberSelect',
    { read: ElementRef },
  );
  private readonly deadlineInput =
    viewChild.required<ElementRef<HTMLInputElement>>('deadlineInput');
  readonly created = output<{ title: string; memberName: string; deadlineAt: string | null }>();
  readonly busy = signal(false);
  /** The controls the last attempt found wanting, marked `aria-invalid` until they change. */
  readonly invalid = signal<ReadonlySet<'memberId' | 'deadline'>>(new Set());
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
  readonly members = computed(() => this.memberService.members().filter((m) => m.inSeason));
  /** The plan's default: due when the following round kicks off. */
  readonly defaultDeadline = computed(() =>
    this.type() === 'spoon' && this.roundId() < this.rounds().length
      ? this.competition.current().firstKickoff(this.roundId() + 1)
      : null,
  );
  readonly defaultDeadlineLabel = computed(() =>
    this.time.format(this.defaultDeadline(), 'unknown'),
  );
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
      const picks = this.picks.picksFor(fixture.id);
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

  readonly dutyOptions = [
    { value: 'spoon', label: 'Spoon duty' },
    { value: 'pick_confirmation', label: 'Pick confirmation' },
  ] as const;
  readonly memberOptions = computed(() =>
    this.members().map((member) => ({ value: member.id, label: member.name })),
  );
  readonly roundOptions = computed(() =>
    this.rounds().map((round) => ({ value: round.id, label: round.title })),
  );

  constructor() {
    for (const name of ['memberId', 'deadline'] as const) {
      this.form.controls[name].valueChanges.pipe(takeUntilDestroyed()).subscribe({
        next: () => {
          if (!this.invalid().has(name)) return;
          const next = new Set(this.invalid());
          next.delete(name);
          this.invalid.set(next);
        },
      });
    }
  }

  /** Opens the form, optionally filled in, e.g. a spoon duty proposed from the round table. */
  open(prefill: DutyPrefill = {}): void {
    this.form.reset({
      memberId: prefill.memberId ?? '',
      type: prefill.type ?? 'spoon',
      roundId: prefill.roundId ?? this.fixtures.round().id,
      deadline: '',
      reason: prefill.reason ?? '',
    });
    this.unticked.set(new Set());
    this.invalid.set(new Set());
    this.dialog().open();
  }

  togglePickFixture(fixtureId: string, checked: boolean): void {
    this.unticked.update((ids) => {
      const next = new Set(ids);
      if (checked) next.delete(fixtureId);
      else next.add(fixtureId);
      return next;
    });
  }

  close(): void {
    this.dialog().close();
  }

  /** The dialog closed, however: its warning goes with it; a failure card stays to be read. */
  dialogChanged(state: 'open' | 'closed'): void {
    if (state === 'closed') this.closed();
  }

  closed(): void {
    this.alerts.dismissKey(CREATE_DUTY_WARNING);
  }

  useDefault(): void {
    this.form.controls.deadline.setValue('');
  }

  suggestDefault(): void {
    this.form.controls.deadline.setValue(this.time.toLocalInput(this.defaultDeadline()));
  }

  async submit(): Promise<void> {
    if (this.busy()) return;
    const { memberId, type, roundId, deadline, reason } = this.form.getRawValue();
    const deadlineAt = deadline ? this.time.fromLocalInput(deadline) : null;
    const problems: { control: 'memberId' | 'deadline'; message: string }[] = [];
    if (this.form.controls.memberId.invalid) {
      problems.push({ control: 'memberId', message: 'Choose the member who owes the duty.' });
    }
    if (deadline && !deadlineAt) {
      problems.push({ control: 'deadline', message: 'Enter a valid deadline.' });
    } else if (this.needsDeadline() && !deadlineAt && type !== 'spoon') {
      problems.push({ control: 'deadline', message: 'A pick confirmation needs a deadline.' });
    }
    if (problems.length || this.form.invalid) {
      this.invalid.set(new Set(problems.map((problem) => problem.control)));
      const [first, ...rest] = problems;
      if (first) {
        highlightProblem(
          first.control === 'memberId'
            ? this.memberSelect().nativeElement.querySelector('[role=combobox]')
            : this.deadlineInput().nativeElement,
        );
        this.alerts.warn(first.message, {
          key: CREATE_DUTY_WARNING,
          details: rest.map((problem) => problem.message),
        });
      }
      return;
    }
    this.invalid.set(new Set());
    this.alerts.dismissKey(CREATE_DUTY_WARNING);
    const pickFixtureIds =
      type === 'pick_confirmation'
        ? this.pickFixtures()
            .filter((f) => f.checked)
            .map((f) => f.id)
        : [];
    this.busy.set(true);
    try {
      await this.dutyControl.createDuty({
        memberId,
        type,
        roundId: Number(roundId),
        deadlineAt,
        reason: reason.trim(),
        ...(pickFixtureIds.length ? { pickFixtureIds } : {}),
      });
      const member = this.members().find((m) => m.id === memberId);
      const round = this.competition.round(Number(roundId));
      this.alerts.dismissKey(CREATE_DUTY_FAILURE);
      this.close();
      this.created.emit({
        title: `${round?.title ?? 'Round'} ${type === 'spoon' ? 'Spoon duty' : 'Pick confirmation'}`,
        memberName: member?.name ?? 'the member',
        deadlineAt: deadlineAt ?? this.defaultDeadline(),
      });
    } catch (error) {
      this.alerts.error(error instanceof Error ? error.message : 'The duty could not be created.', {
        key: CREATE_DUTY_FAILURE,
      });
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
