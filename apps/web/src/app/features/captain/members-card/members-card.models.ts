import { FormControl, FormGroup } from '@angular/forms';

/** The add-member form: nickname, full name and an optional reserving email. */
export type NewMemberForm = FormGroup<{
  name: FormControl<string>;
  fullName: FormControl<string>;
  email: FormControl<string>;
}>;

/** A problem with the add-member form, and the field it points at. */
export interface NewMemberProblem {
  readonly field: 'name' | 'fullName' | 'email';
  readonly message: string;
}
