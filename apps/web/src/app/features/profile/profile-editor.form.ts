import { FormControl, FormGroup, Validators } from '@angular/forms';
import { Profile } from '../../core/profile/profile.models';
import { ProfileField, ProfileProblem } from './profile-editor.models';

/** The profile form: a display name of up to 50 characters and the favourite team. */
export function createProfileForm(displayName: string, teamId: string) {
  return new FormGroup({
    displayName: new FormControl(displayName, {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(50), Validators.pattern(/\S/)],
    }),
    teamId: new FormControl(teamId, {
      nonNullable: true,
      validators: [Validators.required],
    }),
  });
}

/** Up to two initials from the name, or from "You" while it is empty. */
export function initialsOf(name: string): string {
  return (name.trim() || 'You')
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase();
}

/** The profile to save from the form's values and the chosen photo. */
export function profileFrom(
  values: { displayName: string; teamId: string },
  photo: string | null,
): Profile {
  return { displayName: values.displayName.trim(), teamId: values.teamId, photo };
}

/** What the member must fix before the profile saves, in the form's order. */
export function profileProblems(
  invalid: Readonly<Record<ProfileField, boolean>>,
): ProfileProblem[] {
  const problems: ProfileProblem[] = [];
  if (invalid.displayName)
    problems.push({ field: 'displayName', message: 'Enter your name to continue.' });
  if (invalid.teamId) problems.push({ field: 'teamId', message: 'Choose the team you support.' });
  return problems;
}
