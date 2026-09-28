import { FormArray, FormControl, FormGroup, ValidatorFn, Validators } from '@angular/forms';
import { COMPETITIONS } from '../../../core/competition/registry';
import { CompetitionOption, NewLeague } from '../../../core/league/admin/admin.models';
import { DEFAULT_RULES } from '../../../core/league/superbru';
import {
  ruleProblems,
  rulesChange,
  rulesFrom,
  rulesGroup,
} from '../../../shared/rules-fields/rules-form';
import { FormProblem } from '../form-problems';
import { membersValidator, notBlank, slugValidator, zoneValidator } from '../manage-validators';
import { CheckedMember, MemberRowError, checkMembers } from '../member-rows';

/** Blank rows the team sheet starts with. */
const STARTING_ROWS = 3;

/** One blank row of the team sheet: name, surname and Superbru name. */
export function memberRow() {
  return new FormGroup({
    name: new FormControl('', { nonNullable: true }),
    surname: new FormControl('', { nonNullable: true }),
    superbru: new FormControl('', { nonNullable: true }),
  });
}

/** The new-league form, with three blank team-sheet rows and Piele's rules to start with. */
export function createLeagueGroup() {
  return new FormGroup({
    name: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, notBlank, Validators.maxLength(120)],
    }),
    slug: new FormControl('', { nonNullable: true, validators: [slugValidator] }),
    competitionId: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    timezone: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, zoneValidator, Validators.maxLength(64)],
    }),
    seasonName: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, notBlank, Validators.maxLength(80)],
    }),
    members: new FormArray(
      Array.from({ length: STARTING_ROWS }, () => memberRow()),
      { validators: [membersValidator] },
    ),
    captain: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    captainIsMe: new FormControl(true, { nonNullable: true }),
    captainEmail: new FormControl('', {
      nonNullable: true,
      validators: captainEmailValidators(true),
    }),
    addMe: new FormControl(false, { nonNullable: true }),
    emblemPreset: new FormControl<string | null>(null),
    accentColour: new FormControl<string | null>(null),
    // Bounded by the default starting round until the competition list arrives.
    rules: rulesGroup(DEFAULT_RULES, DEFAULT_RULES.startingRound),
  });
}

export type CreateLeagueGroup = ReturnType<typeof createLeagueGroup>;

/** The captain's email is required only when the captain is someone other than the admin. */
export function captainEmailValidators(isMe: boolean): ValidatorFn[] {
  return isMe
    ? [Validators.email, Validators.maxLength(254)]
    : [Validators.required, Validators.email, Validators.maxLength(254)];
}

/**
 * `URC 2026/27`: the competition's short name and season. The web registry knows the season
 * of the competitions it ships; otherwise the season at the end of the name is used.
 */
export function defaultSeasonName(
  option: Pick<CompetitionOption, 'id' | 'name' | 'shortName'>,
): string {
  const season =
    COMPETITIONS.get(option.id)?.season ?? option.name.match(/\d{4}(?:\/\d{2,4})?$/)?.[0] ?? '';
  return season ? `${option.shortName} ${season}` : option.shortName;
}

/** The slug validator's message, or a general one. */
function slugMessage(group: CreateLeagueGroup): string {
  const errors = group.controls.slug.errors;
  return typeof errors?.['slug'] === 'string' ? errors['slug'] : 'Check the slug.';
}

/** Everything the form cannot be sent with, in the order the form shows it. */
export function createLeagueProblems(
  group: CreateLeagueGroup,
  lastRound: number,
): readonly FormProblem[] {
  const c = group.controls;
  const problems: FormProblem[] = [];
  const add = (id: string, message: string) => problems.push({ id: `new-league-${id}`, message });
  if (c.name.invalid) add('name', 'Give the league a name.');
  if (c.slug.invalid) add('slug', slugMessage(group));
  if (c.competitionId.invalid) add('competitionId', 'Choose a competition.');
  if (c.timezone.invalid) add('timezone', "Choose the league's time zone.");
  if (c.seasonName.invalid) add('seasonName', 'Name the season.');
  const checked = checkMembers(c.members.getRawValue());
  for (const error of checked.errors)
    add(`member-${error.row}-${error.field}`, `Member ${error.row + 1}: ${error.message}`);
  if (!checked.errors.length && !checked.members.length)
    add('member-0-name', 'Add at least one member.');
  if (c.captain.invalid) add('captain', 'Choose the captain from the members.');
  if (c.captainEmail.invalid) add('captainEmail', "Give the captain's email address.");
  for (const rule of ruleProblems(c.rules, lastRound)) add(`rules-${rule.field}`, rule.message);
  return problems;
}

/** The create request the form describes; only the rules that differ from Piele's are sent. */
export function newLeagueBody(
  group: CreateLeagueGroup,
  members: readonly CheckedMember[],
): NewLeague {
  const v = group.getRawValue();
  const rules = rulesChange(rulesFrom(group.controls.rules), DEFAULT_RULES, { champion: false });
  return {
    name: v.name.trim(),
    slug: v.slug,
    timezone: v.timezone.trim(),
    competitionId: v.competitionId,
    seasonName: v.seasonName.trim(),
    members: members.map(({ fullName, displayName }) => ({ fullName, displayName })),
    captainDisplayName: v.captain,
    captainEmail: v.captainIsMe ? null : v.captainEmail.trim(),
    emblemPreset: v.emblemPreset,
    accentColour: v.accentColour,
    addMe: !v.captainIsMe && v.addMe,
    ...(Object.keys(rules).length ? { rules } : {}),
  };
}

/**
 * The first repeated Superbru name not already warned about, and the repeats to remember as
 * warned (`row:name`): a repeat is worth saying once, when it first appears.
 */
export function freshRepeat(
  errors: readonly MemberRowError[],
  warned: ReadonlySet<string>,
): { readonly fresh: MemberRowError | undefined; readonly seen: Set<string> } {
  const repeats = errors.filter((error) => error.duplicate);
  const seen = new Set(repeats.map((error) => `${error.row}:${error.message}`));
  const fresh = repeats.find((error) => !warned.has(`${error.row}:${error.message}`));
  return { fresh, seen };
}
