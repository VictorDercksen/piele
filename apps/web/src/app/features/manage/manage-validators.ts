import { AbstractControl, ValidationErrors } from '@angular/forms';
import { slugProblem } from '../../core/league/league-slugs';
import { parseMembers } from './members-parser';

/** Whether this browser knows the IANA time zone (the API checks it against Postgres). */
export function knownZone(zone: string): boolean {
  if (!zone.trim()) return false;
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: zone.trim() });
    return true;
  } catch {
    return false;
  }
}

export function notBlank(control: AbstractControl<string>): ValidationErrors | null {
  return control.value && !control.value.trim() ? { blank: true } : null;
}

export function zoneValidator(control: AbstractControl<string>): ValidationErrors | null {
  return control.value && !knownZone(control.value) ? { zone: true } : null;
}

export function slugValidator(control: AbstractControl<string>): ValidationErrors | null {
  const problem = slugProblem(control.value);
  return problem ? { slug: problem } : null;
}

/** At least one member and no line to fix. */
export function membersValidator(control: AbstractControl<string>): ValidationErrors | null {
  const parsed = parseMembers(control.value);
  if (parsed.errors.length) return { lines: parsed.errors.length };
  return parsed.members.length ? null : { required: true };
}
