import { FormControl, FormGroup, Validators } from '@angular/forms';
import { DutyType, NewDuty } from '../../../core/league/league.models';
import { PickRowView } from '../../../core/league/picks/pick.models';
import { DutyPrefill, DutyProblem, PickFixtureOption } from './create-duty-dialog.models';

/** The duty types the captain can assign. */
export const DUTY_OPTIONS = [
  { value: 'spoon', label: 'Spoon duty' },
  { value: 'pick_confirmation', label: 'Pick confirmation' },
] as const;

/** The captain's duty form: member, type, round, an optional deadline and a reason. */
export function createDutyForm() {
  return new FormGroup({
    memberId: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    type: new FormControl<DutyType>('spoon', { nonNullable: true }),
    roundId: new FormControl(1, { nonNullable: true }),
    deadline: new FormControl('', { nonNullable: true }),
    reason: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(500)] }),
  });
}

/** The form's value on opening: the prefill, else a spoon duty for the given round. */
export function dutyFormValue(
  prefill: DutyPrefill,
  roundId: number,
): { memberId: string; type: DutyType; roundId: number; deadline: string; reason: string } {
  return {
    memberId: prefill.memberId ?? '',
    type: prefill.type ?? 'spoon',
    roundId: prefill.roundId ?? roundId,
    deadline: '',
    reason: prefill.reason ?? '',
  };
}

/**
 * What the captain must fix, in the form's order: the member, then a deadline that did not
 * parse, or a missing one where the type has no default.
 */
export function dutyProblems(check: {
  readonly memberInvalid: boolean;
  readonly type: DutyType;
  readonly deadline: string;
  readonly deadlineAt: string | null;
  readonly needsDeadline: boolean;
}): DutyProblem[] {
  const problems: DutyProblem[] = [];
  if (check.memberInvalid) {
    problems.push({ control: 'memberId', message: 'Choose the member who owes the duty.' });
  }
  if (check.deadline && !check.deadlineAt) {
    problems.push({ control: 'deadline', message: 'Enter a valid deadline.' });
  } else if (check.needsDeadline && !check.deadlineAt && check.type !== 'spoon') {
    problems.push({ control: 'deadline', message: 'A pick confirmation needs a deadline.' });
  }
  return problems;
}

/** The duty to create from the form, linking the ticked fixtures of a pick confirmation. */
export function newDutyFrom(
  values: { memberId: string; type: DutyType; roundId: number; reason: string },
  deadlineAt: string | null,
  pickFixtures: readonly PickFixtureOption[],
): NewDuty {
  const pickFixtureIds =
    values.type === 'pick_confirmation'
      ? pickFixtures.filter((f) => f.checked).map((f) => f.id)
      : [];
  return {
    memberId: values.memberId,
    type: values.type,
    roundId: Number(values.roundId),
    deadlineAt,
    reason: values.reason.trim(),
    ...(pickFixtureIds.length ? { pickFixtureIds } : {}),
  };
}

/** The created duty's title, e.g. "Round 3 Spoon duty". */
export function dutyTitle(roundTitle: string | undefined, type: DutyType): string {
  return `${roundTitle ?? 'Round'} ${type === 'spoon' ? 'Spoon duty' : 'Pick confirmation'}`;
}

/**
 * The member's pick state at a fixture that has kicked off, or null where they have a pick of
 * their own and the confirmation has nothing to cover.
 */
export function pickFixtureState(pick: PickRowView | undefined): PickFixtureOption['state'] | null {
  if (pick && pick.side !== 'missed' && !pick.isDefault) return null;
  return !pick ? 'No pick' : pick.side === 'missed' ? 'Missed' : 'Default pick';
}
