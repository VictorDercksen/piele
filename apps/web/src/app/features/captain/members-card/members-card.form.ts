import { FormControl, FormGroup, Validators } from '@angular/forms';
import { NewMember } from '../../../core/league/league.models';
import { NewMemberForm, NewMemberProblem } from './members-card.models';

/** An email a name is reserved for; empty leaves it open to claim. */
export function emailControl(): FormControl<string> {
  return new FormControl('', {
    nonNullable: true,
    validators: [Validators.email, Validators.maxLength(320)],
  });
}

/** The add-member form, empty. */
export function newMemberForm(): NewMemberForm {
  return new FormGroup({
    name: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(50), Validators.pattern(/\S/)],
    }),
    fullName: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(120), Validators.pattern(/\S/)],
    }),
    email: emailControl(),
  });
}

/** The add-member form's problems in field order: the names first, then the email. */
export function newMemberProblems(form: NewMemberForm): readonly NewMemberProblem[] {
  const { controls } = form;
  return [
    ...(controls.name.invalid || controls.fullName.invalid
      ? [
          {
            field: controls.name.invalid ? ('name' as const) : ('fullName' as const),
            message: 'Give the member a nickname and full name.',
          },
        ]
      : []),
    ...(controls.email.invalid
      ? [{ field: 'email' as const, message: 'Enter a valid email address.' }]
      : []),
  ];
}

/** The member to add, trimmed, with an empty email as none. */
export function newMemberFrom(form: NewMemberForm): NewMember {
  const { name, fullName, email } = form.getRawValue();
  return { name: name.trim(), fullName: fullName.trim(), email: email.trim() || null };
}
