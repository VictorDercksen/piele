import { PickRowView } from '../../../core/league/picks/pick.models';
import {
  createDutyForm,
  dutyFormValue,
  dutyProblems,
  dutyTitle,
  newDutyFrom,
  pickFixtureState,
} from './create-duty-dialog.form';
import { PickFixtureOption } from './create-duty-dialog.models';

const CHECK = {
  memberInvalid: false,
  type: 'spoon' as const,
  deadline: '',
  deadlineAt: null,
  needsDeadline: false,
};

describe('create duty form', () => {
  it('needs a member and caps the reason', () => {
    const form = createDutyForm();
    expect(form.getRawValue()).toEqual({
      memberId: '',
      type: 'spoon',
      roundId: 1,
      deadline: '',
      reason: '',
    });
    expect(form.controls.memberId.invalid).toBe(true);
    form.controls.reason.setValue('x'.repeat(501));
    expect(form.controls.reason.invalid).toBe(true);
  });

  it('opens with the prefill, else a spoon duty in the given round', () => {
    expect(dutyFormValue({}, 4)).toEqual({
      memberId: '',
      type: 'spoon',
      roundId: 4,
      deadline: '',
      reason: '',
    });
    expect(
      dutyFormValue({ memberId: 'm', type: 'pick_confirmation', roundId: 2, reason: 'Late' }, 4),
    ).toEqual({
      memberId: 'm',
      type: 'pick_confirmation',
      roundId: 2,
      deadline: '',
      reason: 'Late',
    });
  });

  it('names the member first, then the deadline', () => {
    expect(dutyProblems(CHECK)).toEqual([]);
    expect(dutyProblems({ ...CHECK, memberInvalid: true, deadline: 'bad' })).toEqual([
      { control: 'memberId', message: 'Choose the member who owes the duty.' },
      { control: 'deadline', message: 'Enter a valid deadline.' },
    ]);
  });

  it('needs a deadline only for a pick confirmation', () => {
    expect(dutyProblems({ ...CHECK, needsDeadline: true })).toEqual([]);
    expect(dutyProblems({ ...CHECK, type: 'pick_confirmation', needsDeadline: true })).toEqual([
      { control: 'deadline', message: 'A pick confirmation needs a deadline.' },
    ]);
  });

  it('links only the ticked fixtures of a pick confirmation', () => {
    const fixtures: PickFixtureOption[] = [
      { id: 'a', label: 'A v B', state: 'No pick', checked: true },
      { id: 'b', label: 'C v D', state: 'Missed', checked: false },
    ];
    const values = { memberId: 'm', type: 'pick_confirmation' as const, roundId: 3, reason: ' x ' };
    expect(newDutyFrom(values, '2026-10-01T10:00:00Z', fixtures)).toEqual({
      memberId: 'm',
      type: 'pick_confirmation',
      roundId: 3,
      deadlineAt: '2026-10-01T10:00:00Z',
      reason: 'x',
      pickFixtureIds: ['a'],
    });
    expect(newDutyFrom({ ...values, type: 'spoon' }, null, fixtures)).toEqual({
      memberId: 'm',
      type: 'spoon',
      roundId: 3,
      deadlineAt: null,
      reason: 'x',
    });
  });

  it('titles the duty by round and type', () => {
    expect(dutyTitle('Round 3', 'spoon')).toBe('Round 3 Spoon duty');
    expect(dutyTitle(undefined, 'pick_confirmation')).toBe('Round Pick confirmation');
  });

  it('covers no pick, a missed pick and a default pick, but not a pick of their own', () => {
    const pick = (side: PickRowView['side'], isDefault = false) =>
      ({ side, isDefault }) as PickRowView;
    expect(pickFixtureState(undefined)).toBe('No pick');
    expect(pickFixtureState(pick('missed'))).toBe('Missed');
    expect(pickFixtureState(pick('home', true))).toBe('Default pick');
    expect(pickFixtureState(pick('home'))).toBeNull();
  });
});
