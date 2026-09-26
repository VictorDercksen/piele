import { AbstractControl, ValidationErrors } from '@angular/forms';
import { slugProblem } from '../../core/league/league-slugs';
import { MemberRow, checkMembers } from './member-rows';

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

/** At least one member and no row to fix. */
export function membersValidator(control: AbstractControl<MemberRow[]>): ValidationErrors | null {
  const checked = checkMembers(control.value);
  if (checked.errors.length) return { rows: checked.errors.length };
  return checked.members.length ? null : { required: true };
}
