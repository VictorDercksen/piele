import { emailControl, newMemberForm, newMemberFrom, newMemberProblems } from './members-card.form';

describe('members card form', () => {
  it('emailControl accepts an empty or valid email only', () => {
    const control = emailControl();
    expect(control.valid).toBe(true);
    control.setValue('not an email');
    expect(control.invalid).toBe(true);
    control.setValue('deon@example.com');
    expect(control.valid).toBe(true);
  });

  it('newMemberProblems names the missing names first, then a bad email', () => {
    const form = newMemberForm();
    form.controls.email.setValue('nope');
    expect(newMemberProblems(form)).toEqual([
      { field: 'name', message: 'Give the member a nickname and full name.' },
      { field: 'email', message: 'Enter a valid email address.' },
    ]);
    form.controls.name.setValue('Deon');
    expect(newMemberProblems(form)[0].field).toBe('fullName');
    form.controls.fullName.setValue('   ');
    expect(newMemberProblems(form)[0].field).toBe('fullName');
  });

  it('newMemberProblems is empty for a valid form', () => {
    const form = newMemberForm();
    form.setValue({ name: 'Deon', fullName: 'Deon Smit', email: '' });
    expect(newMemberProblems(form)).toEqual([]);
  });

  it('newMemberFrom trims the names and treats a blank email as none', () => {
    const form = newMemberForm();
    form.setValue({ name: ' Deon ', fullName: ' Deon Smit ', email: '  ' });
    expect(newMemberFrom(form)).toEqual({ name: 'Deon', fullName: 'Deon Smit', email: null });
    form.controls.email.setValue(' deon@example.com ');
    expect(newMemberFrom(form).email).toBe('deon@example.com');
  });
});
