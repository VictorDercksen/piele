import { FormControl, FormGroup, Validators } from '@angular/forms';
import { AdminLeague, LeagueUpdate } from '../../../core/league/admin/admin.models';
import { withDefaultRules } from '../../../core/league/superbru';
import {
  ruleProblems,
  rulesChange,
  rulesFrom,
  rulesGroup,
} from '../../../shared/rules-fields/rules-form';
import { FormProblem } from '../form-problems';
import { notBlank, zoneValidator } from '../manage-validators';

/** The rename form: the league's name, time zone and Superbru rules. */
export function renameGroup() {
  return new FormGroup({
    name: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, notBlank, Validators.maxLength(120)],
    }),
    timezone: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, zoneValidator, Validators.maxLength(64)],
    }),
    rules: rulesGroup(withDefaultRules(null), withDefaultRules(null).startingRound),
  });
}

export type RenameGroup = ReturnType<typeof renameGroup>;

/**
 * What stops the rename form from saving, in the order the form shows it; ids are under the
 * card's `id`.
 */
export function renameProblems(
  group: RenameGroup,
  id: string,
  lastRound: number,
): readonly FormProblem[] {
  const controls = group.controls;
  const problems: FormProblem[] = [];
  if (controls.name.invalid)
    problems.push({ id: `${id}-rename-name`, message: 'Give the league a name.' });
  if (controls.timezone.invalid)
    problems.push({ id: `${id}-rename-zone`, message: 'Choose a time zone from the list.' });
  for (const rule of ruleProblems(controls.rules, lastRound))
    problems.push({ id: `${id}-rules-${rule.field}`, message: rule.message });
  return problems;
}

/**
 * The fields of the rename form that differ from the league's (trimmed), empty when nothing
 * changed. The champion is kept as it is: the captain's desk sets it among the members.
 */
export function renamePatch(group: RenameGroup, league: AdminLeague): LeagueUpdate {
  const name = group.controls.name.value.trim();
  const timezone = group.controls.timezone.value.trim();
  const rules = rulesChange(rulesFrom(group.controls.rules), withDefaultRules(league.rules), {
    champion: false,
  });
  return {
    ...(name !== league.name ? { name } : {}),
    ...(timezone !== league.timezone ? { timezone } : {}),
    ...(Object.keys(rules).length ? { rules } : {}),
  };
}
