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
import { ToastService } from '../../../core/feedback/toast.service';
import { ApiError } from '../../../core/league/http-league-data';
import { RoundViewService } from '../../../core/league/round-view.service';
import { Loader } from '../../../shared/loader/loader';
import { RuleChampion, RulesFields } from '../../../shared/rules-fields/rules-fields';
import {
  resetRules,
  rulesChange,
  rulesFrom,
  rulesGroup,
  setLastRound,
} from '../../../shared/rules-fields/rules-form';

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
  imports: [RulesFields, Loader],
})
export class RulesCard {
  private readonly view = inject(RoundViewService);
  private readonly competition = inject(CompetitionService);
  private readonly toast = inject(ToastService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  readonly lastRound = computed(() => this.competition.current().regularRounds);
  readonly form = rulesGroup(this.view.rules(), this.lastRound());
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
    () => ({ rules: this.view.rules(), lastRound: this.lastRound() }),
    {
      equal: (a, b) =>
        a.lastRound === b.lastRound && !Object.keys(rulesChange(a.rules, b.rules)).length,
    },
  );
  /** Active members, and a withdrawn champion by name so the choice still shows. */
  readonly champions = computed<readonly RuleChampion[]>(() => {
    const members = this.view.members().map((m) => ({ id: m.id, name: m.name }));
    const champion = this.view.rules().previousChampionMemberId;
    if (!champion || members.some((m) => m.id === champion)) return members;
    const former = this.view.withdrawn().find((m) => m.id === champion);
    return [
      ...members,
      { id: champion, name: former ? `${former.name} (withdrawn)` : 'A former member' },
    ];
  });
  readonly submitted = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');

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
    resetRules(this.form, this.view.rules());
    this.submitted.set(false);
    this.error.set('');
  }

  async save(): Promise<void> {
    if (this.busy()) return;
    this.submitted.set(true);
    this.error.set('');
    if (this.form.invalid) {
      this.focusFirstInvalid();
      return;
    }
    const change = rulesChange(rulesFrom(this.form), this.view.rules());
    if (!Object.keys(change).length) {
      this.form.markAsPristine();
      this.toast.show('The rules are unchanged.');
      return;
    }
    this.busy.set(true);
    this.form.disable({ emitEvent: false });
    try {
      await this.view.saveRules(change);
      this.form.markAsPristine();
      this.toast.show('Superbru rules saved.');
    } catch (error) {
      const code = error instanceof ApiError ? error.code : '';
      this.error.set(
        REFUSALS[code] ??
          (error instanceof Error ? error.message : 'The rules could not be saved.'),
      );
    } finally {
      this.form.enable({ emitEvent: false });
      this.busy.set(false);
    }
  }

  private focusFirstInvalid(): void {
    afterNextRender(
      () =>
        this.host.nativeElement
          .querySelector<HTMLElement>('input.ng-invalid, select.ng-invalid')
          ?.focus(),
      { injector: this.injector },
    );
  }
}

interface RulesBaseline {
  readonly rules: LeagueRules;
  readonly lastRound: number;
}
