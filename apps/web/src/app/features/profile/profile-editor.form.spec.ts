import { createProfileForm, initialsOf, profileFrom, profileProblems } from './profile-editor.form';

describe('profile editor form', () => {
  it('needs a name of up to 50 characters and a team', () => {
    expect(createProfileForm('Victor', 'vodacom-bulls').valid).toBe(true);
    const form = createProfileForm('   ', '');
    expect(form.controls.displayName.invalid).toBe(true);
    expect(form.controls.teamId.invalid).toBe(true);
    form.controls.displayName.setValue('x'.repeat(51));
    expect(form.controls.displayName.invalid).toBe(true);
  });

  it('takes up to two initials, else those of "You"', () => {
    expect(initialsOf('victor de wet dercksen')).toBe('VD');
    expect(initialsOf(' Johan ')).toBe('J');
    expect(initialsOf('  ')).toBe('Y');
  });

  it('saves a trimmed name with the team and photo', () => {
    expect(profileFrom({ displayName: ' Victor ', teamId: 'vodacom-bulls' }, null)).toEqual({
      displayName: 'Victor',
      teamId: 'vodacom-bulls',
      photo: null,
    });
  });

  it('names the name before the team', () => {
    expect(profileProblems({ displayName: true, teamId: true })).toEqual([
      { field: 'displayName', message: 'Enter your name to continue.' },
      { field: 'teamId', message: 'Choose the team you support.' },
    ]);
    expect(profileProblems({ displayName: false, teamId: false })).toEqual([]);
  });
});
