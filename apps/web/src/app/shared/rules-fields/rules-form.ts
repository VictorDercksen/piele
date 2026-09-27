import {
  AbstractControl,
  FormControl,
  FormGroup,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { LeagueRules, WinPoints } from '../../core/league/league.models';

/** The API's ceiling for a rule's number. */
export const MAX_RULE_NUMBER = 1000;

/** The five switches, in the order the form shows them. */
export const RULE_FLAGS = [
  'defaultPicks',
  'picksHiddenBeforeKickoff',
  'bonusPoint',
  'bonusPointSplit',
  'bonusPointRangeCapped',
] as const;

/** The plain numbers, in the order the form shows them after the win points. */
export const RULE_NUMBERS = [
  'marginPoint',
  'marginWindow',
  'bonusPointValue',
  'bonusPointMinimumShare',
  'bonusRange',
  'grandSlamPoints',
] as const;

export const WIN_POINT_KEYS = ['regular', 'quarterFinal', 'semiFinal', 'final'] as const;

type Flag = (typeof RULE_FLAGS)[number];
type RuleNumber = (typeof RULE_NUMBERS)[number];

function flag(value: boolean): FormControl<boolean> {
  return new FormControl(value, { nonNullable: true });
}

function points(value: number): FormControl<number | null> {
  return new FormControl<number | null>(value, {
    validators: [Validators.required, Validators.min(0), Validators.max(MAX_RULE_NUMBER)],
  });
}

function wholeNumber(control: AbstractControl<number | null>): ValidationErrors | null {
  const value = control.value;
  return value !== null && !Number.isInteger(value) ? { integer: true } : null;
}

/** The typed form of a season's Superbru rules; the champion is `''` for none. */
export function rulesGroup(rules: LeagueRules, lastRound: number) {
  return new FormGroup({
    defaultPicks: flag(rules.defaultPicks),
    picksHiddenBeforeKickoff: flag(rules.picksHiddenBeforeKickoff),
    bonusPoint: flag(rules.bonusPoint),
    bonusPointSplit: flag(rules.bonusPointSplit),
    bonusPointRangeCapped: flag(rules.bonusPointRangeCapped),
    startingRound: new FormControl<number | null>(rules.startingRound, {
      validators: startingRoundValidators(lastRound),
    }),
    winPoints: new FormGroup({
      regular: points(rules.winPoints.regular),
      quarterFinal: points(rules.winPoints.quarterFinal),
      semiFinal: points(rules.winPoints.semiFinal),
      final: points(rules.winPoints.final),
    }),
    marginPoint: points(rules.marginPoint),
    marginWindow: points(rules.marginWindow),
    bonusPointValue: points(rules.bonusPointValue),
    bonusPointMinimumShare: points(rules.bonusPointMinimumShare),
    bonusRange: points(rules.bonusRange),
    grandSlamPoints: points(rules.grandSlamPoints),
    previousChampionMemberId: new FormControl(rules.previousChampionMemberId ?? '', {
      nonNullable: true,
    }),
  });
}

export type RulesGroup = ReturnType<typeof rulesGroup>;

function startingRoundValidators(lastRound: number) {
  return [
    Validators.required,
    wholeNumber,
    Validators.min(1),
    Validators.max(Math.max(1, lastRound)),
  ];
}

/** Moves the starting round's upper bound, e.g. when the new league's competition changes. */
export function setLastRound(group: RulesGroup, lastRound: number): void {
  const control = group.controls.startingRound;
  control.setValidators(startingRoundValidators(lastRound));
  control.updateValueAndValidity();
}

/** Puts rules back into the form, e.g. after they were saved or reloaded. */
export function resetRules(group: RulesGroup, rules: LeagueRules): void {
  group.reset({ ...rules, previousChampionMemberId: rules.previousChampionMemberId ?? '' });
}

/** The full rules the form describes. Call only when the form is valid. */
export function rulesFrom(group: RulesGroup): LeagueRules {
  const v = group.getRawValue();
  const num = (value: number | null) => Number(value ?? 0);
  const winPoints = Object.fromEntries(
    WIN_POINT_KEYS.map((key) => [key, num(v.winPoints[key])]),
  ) as unknown as WinPoints;
  return {
    defaultPicks: v.defaultPicks,
    picksHiddenBeforeKickoff: v.picksHiddenBeforeKickoff,
    bonusPoint: v.bonusPoint,
    bonusPointSplit: v.bonusPointSplit,
    bonusPointRangeCapped: v.bonusPointRangeCapped,
    startingRound: num(v.startingRound),
    winPoints,
    marginPoint: num(v.marginPoint),
    marginWindow: num(v.marginWindow),
    bonusPointValue: num(v.bonusPointValue),
    bonusPointMinimumShare: num(v.bonusPointMinimumShare),
    bonusRange: num(v.bonusRange),
    grandSlamPoints: num(v.grandSlamPoints),
    previousChampionMemberId: v.previousChampionMemberId || null,
  };
}

/**
 * The keys of `next` that differ from `base`. `winPoints` goes whole when any round type
 * changed. The champion is compared only with `champion` (the new-league form has none).
 */
export function rulesChange(
  next: LeagueRules,
  base: LeagueRules,
  { champion = true }: { readonly champion?: boolean } = {},
): Partial<LeagueRules> {
  const change: { -readonly [K in keyof LeagueRules]?: LeagueRules[K] } = {};
  for (const key of RULE_FLAGS as readonly Flag[])
    if (next[key] !== base[key]) change[key] = next[key];
  if (next.startingRound !== base.startingRound) change.startingRound = next.startingRound;
  if (WIN_POINT_KEYS.some((key) => next.winPoints[key] !== base.winPoints[key]))
    change.winPoints = { ...next.winPoints };
  for (const key of RULE_NUMBERS as readonly RuleNumber[])
    if (next[key] !== base[key]) change[key] = next[key];
  if (champion && next.previousChampionMemberId !== base.previousChampionMemberId)
    change.previousChampionMemberId = next.previousChampionMemberId;
  return change;
}
