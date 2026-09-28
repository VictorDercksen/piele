import { FormControl } from '@angular/forms';
import { MemberPick } from '../../../core/league/league.models';
import {
  createPickForm,
  marginValidator,
  parseMargin,
  pickFormValue,
  pickFromForm,
  pickProblems,
  signedMargin,
} from './picks-panel.form';

function pick(side: MemberPick['side'], margin: number | null): MemberPick {
  return { memberId: 'm', memberName: 'M', side, margin, isDefault: false, dutyId: null };
}

describe('picks panel form', () => {
  it('parses margins from 1 to 150 typed as digits', () => {
    expect(parseMargin(' 20 ')).toBe(20);
    expect(parseMargin('150')).toBe(150);
    expect(parseMargin('0')).toBeNull();
    expect(parseMargin('151')).toBeNull();
    expect(parseMargin('2.5')).toBeNull();
    expect(parseMargin('')).toBeNull();
  });

  it('leaves an empty margin to the required rule and refuses one out of range', () => {
    expect(marginValidator(new FormControl('', { nonNullable: true }))).toBeNull();
    expect(marginValidator(new FormControl('12', { nonNullable: true }))).toBeNull();
    expect(marginValidator(new FormControl('200', { nonNullable: true }))).toEqual({
      margin: true,
    });
  });

  it('starts empty and invalid', () => {
    const form = createPickForm();
    expect(form.getRawValue()).toEqual({ side: null, margin: '' });
    expect(form.invalid).toBe(true);
  });

  it('fills the form from a pick that is in, and empties it for none or a missed one', () => {
    expect(pickFormValue(pick('away', 20))).toEqual({ side: 'away', margin: '20' });
    expect(pickFormValue(pick('draw', 0))).toEqual({ side: 'draw', margin: '' });
    expect(pickFormValue(pick('missed', null))).toEqual({ side: null, margin: '' });
    expect(pickFormValue(null)).toEqual({ side: null, margin: '' });
  });

  it('turns the form into the pick to save', () => {
    expect(pickFromForm('home', ' 7 ')).toEqual({ side: 'home', margin: 7 });
    expect(pickFromForm('draw', '')).toEqual({ side: 'draw', margin: 0 });
  });

  it('names the side before the margin', () => {
    expect(pickProblems(true, true)).toEqual([
      'Choose a side or a draw.',
      'Enter a margin from 1 to 150.',
    ]);
    expect(pickProblems(false, false)).toEqual([]);
  });

  it('signs the margin toward away', () => {
    expect(signedMargin('home', '5')).toBe(-5);
    expect(signedMargin('away', '5')).toBe(5);
    expect(signedMargin('draw', '')).toBe(0);
    expect(signedMargin('away', 'x')).toBe(0);
  });
});
