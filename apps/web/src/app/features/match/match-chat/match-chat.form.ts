import { FormControl, Validators } from '@angular/forms';

/** The API's longest question, in characters. */
export const QUESTION_MAX_LENGTH = 500;

export function questionControl(): FormControl<string> {
  return new FormControl('', {
    nonNullable: true,
    validators: [Validators.maxLength(QUESTION_MAX_LENGTH)],
  });
}

/** Enter sends; Shift+Enter is a new line, and Enter while an IME is composing is the IME's. */
export function sendsOnEnter(event: KeyboardEvent): boolean {
  return event.key === 'Enter' && !event.shiftKey && !event.isComposing;
}
