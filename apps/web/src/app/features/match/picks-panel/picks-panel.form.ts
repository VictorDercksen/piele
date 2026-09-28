import {
  AbstractControl,
  FormControl,
  FormGroup,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { MemberPick, NewPick } from '../../../core/league/league.models';
import { PickChoice } from './picks-panel.models';

/** A typed margin as a number, or null unless it is digits from 1 to 150. */
export function parseMargin(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const margin = Number(trimmed);
  return margin >= 1 && margin <= 150 ? margin : null;
}

/** A margin from 1 to 150, typed as digits. */
export function marginValidator(control: AbstractControl<string>): ValidationErrors | null {
  const value = control.value.trim();
  if (!value) return null;
  return parseMargin(value) === null ? { margin: true } : null;
}

/** The member's pick form: a side or a draw, and the margin toward that side. */
export function createPickForm() {
  return new FormGroup({
    side: new FormControl<PickChoice | null>(null, { validators: Validators.required }),
    margin: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, marginValidator],
    }),
  });
}

/** The form's value for a pick that is in, or an empty form for none (or a missed one). */
export function pickFormValue(pick: MemberPick | null): {
  side: PickChoice | null;
  margin: string;
} {
  const side = pick && pick.side !== 'missed' ? pick.side : null;
  return {
    side,
    margin: side && side !== 'draw' && pick?.margin ? String(pick.margin) : '',
  };
}

/** A valid form's side and margin as the pick to save; a draw has no margin. */
export function pickFromForm(side: PickChoice, margin: string): NewPick {
  return side === 'draw' ? { side: 'draw', margin: 0 } : { side, margin: Number(margin.trim()) };
}

/** What the member must fix before the pick can be saved, the side first. */
export function pickProblems(sideInvalid: boolean, marginInvalid: boolean): string[] {
  const problems: string[] = [];
  if (sideInvalid) problems.push('Choose a side or a draw.');
  if (marginInvalid) problems.push('Enter a margin from 1 to 150.');
  return problems;
}

/** The form's side and margin as one signed margin: negative toward home, zero a draw or none. */
export function signedMargin(side: PickChoice | null, margin: string): number {
  const parsed = parseMargin(margin) ?? 0;
  return side === 'home' ? -parsed : side === 'away' ? parsed : 0;
}
