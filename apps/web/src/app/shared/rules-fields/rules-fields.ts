import { SearchSelect } from '../../shared/search-select/search-select';
import { HlmSwitch } from '@spartan-ng/helm/switch';
import { HlmInput } from '@spartan-ng/helm/input';
import { HlmLabel } from '@spartan-ng/helm/label';
import { ChangeDetectionStrategy, computed, Component, input } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { MAX_RULE_NUMBER, RulesGroup } from './rules-form';
import { RuleChampion } from './rules-fields.models';

/**
 * The fields of a season's Superbru rules (`rules-form.ts`): five switches, the starting round,
 * the win points by round type, the other numbers and, when `champions` is given, last
 * season's champion. Used by the captain's rules card and the management centre's forms,
 * which own the form group and the saving.
 */
@Component({
  selector: 'app-rules-fields',
  templateUrl: './rules-fields.html',
  styleUrl: './rules-fields.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  /* prettier-ignore */
  imports: [
    SearchSelect,
    ReactiveFormsModule,
    HlmInput,
    HlmLabel,
    HlmSwitch,
  ],
})
export class RulesFields {
  readonly championOptions = computed(() => [
    { value: '', label: 'None' },
    ...(this.champions() ?? []).map((member) => ({ value: member.id, label: member.name })),
  ]);
  readonly group = input.required<RulesGroup>();
  /** Prefix of every field's id, unique on the page. */
  readonly idPrefix = input.required<string>();
  /** The latest round a season may start scoring from. */
  readonly lastRound = input.required<number>();
  /** Members who can be last season's champion; null leaves the field out. */
  readonly champions = input<readonly RuleChampion[] | null>(null);
  /** Mark every invalid field (`aria-invalid`), as after a save attempt. */
  readonly submitted = input(false);
  /** The largest number a rule may hold. */
  readonly max = MAX_RULE_NUMBER;

  readonly switches = [
    {
      key: 'defaultPicks',
      label: 'Default picks',
      hint: 'A missed pick may count as a Superbru default: win points only.',
    },
    {
      key: 'picksHiddenBeforeKickoff',
      label: 'Picks hidden before kick-off',
      hint: 'As Superbru shows the pool. Members here see picks once their own is in.',
    },
    { key: 'bonusPoint', label: 'Bonus point', hint: 'For the closest correct pick.' },
    {
      key: 'bonusPointSplit',
      label: 'Bonus point split',
      hint: 'Tied picks share the bonus point; off gives each the full point.',
    },
    {
      key: 'bonusPointRangeCapped',
      label: 'Bonus point range capped',
      hint: 'Only picks within the bonus range qualify.',
    },
  ] as const;

  readonly winPoints = [
    { key: 'regular', label: 'Win points, regular round' },
    { key: 'quarterFinal', label: 'Win points, quarter-final' },
    { key: 'semiFinal', label: 'Win points, semi-final' },
    { key: 'final', label: 'Win points, final' },
  ] as const;

  readonly numbers = [
    { key: 'marginPoint', label: 'Margin point' },
    { key: 'marginWindow', label: 'Margin window' },
    { key: 'bonusPointValue', label: 'Bonus point value' },
    { key: 'bonusPointMinimumShare', label: 'Bonus point minimum share' },
    { key: 'bonusRange', label: 'Bonus range' },
    { key: 'grandSlamPoints', label: 'Grand slam points' },
  ] as const;

  /** Whether a control is marked invalid: after a save attempt, or once it was edited. */
  shows(control: { invalid: boolean; dirty: boolean }): boolean {
    return control.invalid && (this.submitted() || control.dirty);
  }
}
