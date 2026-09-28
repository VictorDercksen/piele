import { FormControl } from '@angular/forms';
import { reasonValidators } from './reason-dialog.form';

describe('reasonValidators', () => {
  function valid(value: string, required: boolean): boolean {
    return new FormControl(value, { validators: reasonValidators(required) }).valid;
  }

  it('needs more than spaces when required', () => {
    expect(valid('', true)).toBe(false);
    expect(valid('   ', true)).toBe(false);
    expect(valid('Late picks', true)).toBe(true);
  });

  it('allows an empty reason when optional', () => {
    expect(valid('', false)).toBe(true);
  });

  it('caps the reason at 500 characters', () => {
    expect(valid('x'.repeat(500), true)).toBe(true);
    expect(valid('x'.repeat(501), false)).toBe(false);
  });
});
