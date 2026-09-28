import { ValidatorFn, Validators } from '@angular/forms';

/** The reason's rules: at most 500 characters, and something other than spaces when required. */
export function reasonValidators(required: boolean): ValidatorFn[] {
  return required
    ? [Validators.required, Validators.pattern(/\S/), Validators.maxLength(500)]
    : [Validators.maxLength(500)];
}
