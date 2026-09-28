import { HlmButton } from '@spartan-ng/helm/button';
import { lucideRotateCcw } from '@ng-icons/lucide';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { LeagueRules } from '../../../core/league/league.models';
import { CompetitionService } from '../../../core/competition/competition.service';
import { AlertService } from '../../../core/feedback/alert.service';
import { highlightProblem } from '../../../core/feedback/problem-highlight';
import { ApiError } from '../../../core/api/api-error';
import { MemberService } from '../../../core/league/members/member.service';
import { RulesControlService } from '../../../core/league/rules/rules-control.service';
import { RulesService } from '../../../core/league/rules/rules.service';
import { Dropdown } from '../../../shared/dropdown/dropdown';
import { Loader } from '../../../shared/loader/loader';
import { RuleChampion, RulesFields } from '../../../shared/rules-fields/rules-fields';
import {
  resetRules,
  ruleProblems,
  rulesChange,
  rulesFrom,
  rulesGroup,
  setLastRound,
} from '../../../shared/rules-fields/rules-form';
import { alertDetails } from '../alert-details';

/** The key of the rules form's card, so a new attempt replaces the last one's. */
const ALERT_KEY = 'captain-rules';

/** Refusals worth their own words; any other code shows the API's message. */
const REFUSALS: Readonly<Record<string, string>> = {
  unknown_member: "The previous season's champion must be a member of this league.",
  captain_only: 'Only the captain or the admin can change the rules.',
};

/**
 * The season's Superbru rules on the captain's desk: the switches, starting round, points and
 * last season's champion. Saving sends only the rules that changed.
 */
@Component({
  selector: 'app-rules-card',
  templateUrl: './rules-card.html',
  styleUrl: './rules-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  viewProviders: [provideIcons({ lucideRotateCcw })],
  /* prettier-ignore */
  imports: [
    NgIcon,
    Dropdown,
    RulesFields,
    Loader,
    HlmButton,
  ],
})
export class RulesCard {
  private readonly rules = inject(RulesService);
  private readonly rulesControl = inject(RulesControlService);
  private readonly members = inject(MemberService);
  private readonly competition = inject(CompetitionService);
  private readonly alerts = inject(AlertService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  readonly lastRound = computed(() => this.competition.current().regularRounds);
  readonly form = rulesGroup(this.rules.rules(), this.lastRound());
  /** Whether the form differs from the saved rules; also follows `markAsPristine`. */
  readonly dirty = toSignal(this.form.events.pipe(map(() => this.form.dirty)), {
    initialValue: false,
  });
  /**
   * The saved rules and round bound the form starts from, compared by value: the league's
   * `me` is re-adopted after an appearance or profile save with an equal but new rules object,
   * which must not wipe the steward's unsaved edits.
   */
  private readonly baseline = computed<RulesBaseline>(
    () => ({ rules: this.rules.rules(), lastRound: this.lastRound() }),
    {
      equal: (a, b) =>
        a.lastRound === b.lastRound && !Object.keys(rulesChange(a.rules, b.rules)).length,
    },
  );
  /** Active members, and a withdrawn champion by name so the choice still shows. */
  readonly champions = computed<readonly RuleChampion[]>(() => {
    const members = this.members.members().map((m) => ({ id: m.id, name: m.name }));
    const champion = this.rules.rules().previousChampionMemberId;
    if (!champion || members.some((m) => m.id === champion)) return members;
    const former = this.members.withdrawn().find((m) => m.id === champion);
    return [
      ...members,
      { id: champion, name: former ? `${former.name} (withdrawn)` : 'A former member' },
    ];
  });
  readonly submitted = signal(false);
  readonly busy = signal(false);

  constructor() {
    // Saved or reloaded rules (or another league) replace what the form shows.
    effect(() => {
      const { rules, lastRound } = this.baseline();
      untracked(() => {
        setLastRound(this.form, lastRound);
        resetRules(this.form, rules);
        this.submitted.set(false);
      });
    });
  }

  /** The form element carries no form directive: the fields bind the group themselves. */
  submit(event: Event): void {
    event.preventDefault();
    void this.save();
  }

  undo(): void {
    resetRules(this.form, this.rules.rules());
    this.submitted.set(false);
    this.alerts.dismissKey(ALERT_KEY);
  }

  async save(): Promise<void> {
    if (this.busy()) return;
    this.submitted.set(true);
    const problems = ruleProblems(this.form, this.lastRound());
    if (problems.length) {
      const [first] = problems;
      this.alerts.warn(first.message, {
        key: ALERT_KEY,
        details: alertDetails(problems.map((problem) => problem.message)),
      });
      this.highlightField(first.field);
      return;
    }
    this.alerts.dismissKey(ALERT_KEY);
    const change = rulesChange(rulesFrom(this.form), this.rules.rules());
    if (!Object.keys(change).length) {
      this.form.markAsPristine();
      this.alerts.info('The rules are unchanged.', { key: ALERT_KEY });
      return;
    }
    this.busy.set(true);
    this.form.disable({ emitEvent: false });
    try {
      await this.rulesControl.saveRules(change);
      this.form.markAsPristine();
      this.alerts.success('Superbru rules saved.', { key: ALERT_KEY });
    } catch (error) {
      const code = error instanceof ApiError ? error.code : '';
      this.alerts.error(
        REFUSALS[code] ??
          (error instanceof Error ? error.message : 'The rules could not be saved.'),
        { key: ALERT_KEY },
      );
    } finally {
      this.form.enable({ emitEvent: false });
      this.busy.set(false);
    }
  }

  /** Highlights a rule field by its id suffix, once `aria-invalid` has rendered. */
  private highlightField(field: string): void {
    afterNextRender(
      () => highlightProblem(this.host.nativeElement.querySelector<HTMLElement>(`#rules-${field}`)),
      { injector: this.injector },
    );
  }
}

interface RulesBaseline {
  readonly rules: LeagueRules;
  readonly lastRound: number;
}
