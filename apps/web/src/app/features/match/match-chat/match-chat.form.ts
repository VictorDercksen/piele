import { FormControl, Validators } from '@angular/forms';

/** The API's longest question, in characters. */
export const QUESTION_MAX_LENGTH = 500;

export function questionControl(): FormControl<string> {
  return new FormControl('', {
    nonNullable: true,
    validators: [Validators.maxLength(QUESTION_MAX_LENGTH)],
  });
}
