import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormArray, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideArrowRight, lucidePlus, lucideX } from '@ng-icons/lucide';
import { map } from 'rxjs';
import { COMPETITIONS } from '../../../core/competition/registry';
import { AlertService } from '../../../core/feedback/alert.service';
import { highlightProblem } from '../../../core/feedback/problem-highlight';
import { CompetitionOption, NewLeague } from '../../../core/league/admin.models';
import { AdminService } from '../../../core/league/admin.service';
import {
  DEFAULT_ACCENT,
  EMBLEM_LABELS,
  isAccentColour,
  isEmblemPreset,
} from '../../../core/league/emblems';
import { ApiError } from '../../../core/league/http-league-data';
import { deriveSlug } from '../../../core/league/league-slugs';
import { DEFAULT_RULES } from '../../../core/league/superbru';
import { EmblemPicker } from '../../../shared/emblem-picker/emblem-picker';
import { LeagueCrest } from '../../../shared/league-crest/league-crest';
import { Loader } from '../../../shared/loader/loader';
import { RulesFields } from '../../../shared/rules-fields/rules-fields';
import {
  ruleProblems,
  rulesChange,
  rulesFrom,
  rulesGroup,
  setLastRound,
} from '../../../shared/rules-fields/rules-form';
import { FormProblem, problemDetails } from '../form-problems';
import { membersValidator, notBlank, slugValidator, zoneValidator } from '../manage-validators';
import { MAX_MEMBERS, MemberRow, MemberRowError, checkMembers } from '../member-rows';
import { timeZoneGroups } from '../time-zones';

/** API refusals that concern one field (a warning that highlights it); any other code is an error. */
const FIELD_OF_CODE: Readonly<Partial<Record<string, ApiField>>> = {
  slug_taken: 'slug',
  invalid_slug: 'slug',
  duplicate_member: 'members',
  unknown_captain: 'captain',
};

/** The key of the form's alert card: a new attempt replaces the last one's. */
const ALERT_KEY = 'create-league';

/** Blank rows the team sheet starts with. */
const STARTING_ROWS = 3;

/**
 * The management centre's new-league form: name and slug (derived from the name until
 * edited), competition, time zone (chosen from the browser's IANA zones) and season name
 * (defaulted from the competition until edited), the team sheet as rows of name, surname and
 * Superbru name with "Add member" for another row, the captain (the admin, or another
 * member with the email their name is reserved for), the admin's own membership, an emblem
 * preset and the accent colour, and, collapsed, the season's Superbru rules (Piele's to start
 * with; only the rules that differ are sent). One request makes the league; success opens it.
 */
@Component({
  selector: 'app-create-league-form',
  templateUrl: './create-league-form.html',
  styleUrls: ['../manage-fields.scss', './create-league-form.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, NgIcon, EmblemPicker, LeagueCrest, Loader, RulesFields],
  viewProviders: [provideIcons({ lucideArrowRight, lucidePlus, lucideX })],
})
export class CreateLeagueForm {
  private readonly admin = inject(AdminService);
  private readonly alerts = inject(AlertService);
  private readonly router = inject(Router);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  readonly form = new FormGroup({
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
      validators: [Validators.email, Validators.maxLength(254)],
    }),
    addMe: new FormControl(false, { nonNullable: true }),
    emblemPreset: new FormControl<string | null>(null),
    accentColour: new FormControl<string | null>(null),
    // Bounded by the default starting round until the competition list arrives.
    rules: rulesGroup(DEFAULT_RULES, DEFAULT_RULES.startingRound),
  });
  readonly controls = this.form.controls;
  /** The form's whole value, as a signal for the template's conditions and previews. */
  readonly value = toSignal(this.form.valueChanges.pipe(map(() => this.form.getRawValue())), {
    initialValue: this.form.getRawValue(),
  });
  /** Re-reads validity after each change (`statusChanges` covers validator swaps too). */
  private readonly status = toSignal(this.form.statusChanges, { initialValue: this.form.status });

  readonly checked = computed(() => checkMembers(this.value().members));
  readonly captainOptions = computed(() => this.checked().members.map((m) => m.displayName));
  /** Each row's problem, marked once the admin has tried to submit (a repeat at once). */
  readonly rowErrors = computed(() => {
    const shown = new Map<number, MemberRowError>();
    for (const error of this.checked().errors)
      if (this.submitted() || error.duplicate) shown.set(error.row, error);
    return shown;
  });
  /** `6 members ready, 1 row to fix.` */
  readonly summaryLine = computed(() => {
    const { members } = this.checked();
    const ready = `${members.length} ${members.length === 1 ? 'member' : 'members'} ready`;
    const toFix = this.rowErrors().size;
    if (!toFix) return `${ready}.`;
    return `${ready}, ${toFix} ${toFix === 1 ? 'row' : 'rows'} to fix.`;
  });
  readonly canAddRow = computed(() => this.value().members.length < MAX_MEMBERS);
  readonly zoneGroups = computed(() => timeZoneGroups(this.value().timezone));
  readonly accentValue = computed(() => this.value().accentColour ?? DEFAULT_ACCENT);
  readonly presetLabel = computed(() => {
    const preset = this.value().emblemPreset;
    return isEmblemPreset(preset) ? EMBLEM_LABELS[preset] : null;
  });

  /**
   * The latest starting round the chosen competition allows, from `AdminService.competitions()`;
   * the default starting round until the list arrives.
   */
  readonly lastRound = computed(
    () =>
      this.competitions()?.find((c) => c.id === this.value().competitionId)?.regularRounds ??
      DEFAULT_RULES.startingRound,
  );
  /** The collapsed "Superbru rules" group is open. */
  readonly rulesOpen = signal(false);

  readonly competitions = signal<readonly CompetitionOption[] | null>(null);
  readonly competitionsError = signal('');
  readonly submitted = signal(false);
  readonly busy = signal(false);
  /** The field an API refusal concerns, marked invalid until it changes. */
  readonly apiField = signal<ApiField | null>(null);
  /** The repeated Superbru names already warned about while typing, as `row:name`. */
  private warnedRepeats = new Set<string>();

  /** The user typed a slug, chose a time zone or typed a season name: stop filling it in. */
  private slugEdited = false;
  private zoneEdited = false;
  private seasonEdited = false;

  constructor() {
    const c = this.controls;
    c.name.valueChanges.pipe(takeUntilDestroyed()).subscribe({
      next: (name) => {
        if (!this.slugEdited) c.slug.setValue(deriveSlug(name));
      },
    });
    c.slug.valueChanges.pipe(takeUntilDestroyed()).subscribe({
      next: () => this.clearApiError('slug'),
    });
    c.members.valueChanges.pipe(takeUntilDestroyed()).subscribe({
      next: () => {
        this.clearApiError('members');
        // A captain whose row was removed or renamed is no longer a choice. Read the rows
        // directly: the form's value signal updates after this array's event.
        const checked = checkMembers(c.members.getRawValue());
        const names = checked.members.map((m) => m.displayName);
        if (c.captain.value && !names.includes(c.captain.value)) c.captain.setValue('');
        this.warnRepeats(checked.errors);
      },
    });
    c.captain.valueChanges.pipe(takeUntilDestroyed()).subscribe({
      next: () => this.clearApiError('captain'),
    });
    c.competitionId.valueChanges.pipe(takeUntilDestroyed()).subscribe({
      next: (id) => this.applyCompetition(id),
    });
    c.captainIsMe.valueChanges.pipe(takeUntilDestroyed()).subscribe({
      next: (isMe) => {
        c.captainEmail.setValidators(
          isMe
            ? [Validators.email, Validators.maxLength(254)]
            : [Validators.required, Validators.email, Validators.maxLength(254)],
        );
        c.captainEmail.updateValueAndValidity();
        if (isMe) c.addMe.setValue(false);
      },
    });
    void this.loadCompetitions();
  }

  async loadCompetitions(): Promise<void> {
    this.competitionsError.set('');
    try {
      const list = await this.admin.competitions();
      this.competitions.set(list);
      if (!this.controls.competitionId.value && list.length)
        this.controls.competitionId.setValue(list[0].id);
    } catch (error) {
      this.competitionsError.set(
        error instanceof Error ? error.message : 'The competitions could not be loaded.',
      );
    }
  }

  /** The user edited the slug; an emptied slug follows the name again. */
  slugTyped(event: Event): void {
    const value = event.target instanceof HTMLInputElement ? event.target.value : '';
    this.slugEdited = value.trim() !== '';
  }

  zoneChosen(): void {
    this.zoneEdited = true;
  }

  seasonTyped(): void {
    this.seasonEdited = true;
  }

  rulesToggled(event: Event): void {
    if (event.target instanceof HTMLDetailsElement) this.rulesOpen.set(event.target.open);
  }

  /** Adds a blank row at the bottom and puts the cursor in its name. */
  addRow(): void {
    if (!this.canAddRow()) return;
    this.controls.members.push(memberRow());
    this.focus(`new-league-member-${this.controls.members.length - 1}-name`);
  }

  /** Removes a row; the sheet keeps at least one. */
  removeRow(index: number): void {
    const rows = this.controls.members;
    if (rows.length <= 1) return;
    rows.removeAt(index);
    this.focus(`new-league-member-${Math.min(index, rows.length - 1)}-name`);
  }

  /** Whether this input of the row is the one to fix (or holds the API's duplicate). */
  rowInvalid(index: number, field: keyof MemberRow): boolean {
    if (this.rowErrors().get(index)?.field === field) return true;
    return (
      field === 'superbru' &&
      this.apiField() === 'members' &&
      this.checked().members[0]?.row === index
    );
  }

  choosePreset(key: string): void {
    this.controls.emblemPreset.setValue(key);
  }

  clearPreset(): void {
    this.controls.emblemPreset.setValue(null);
  }

  chooseAccent(event: Event): void {
    const value = event.target instanceof HTMLInputElement ? event.target.value.toLowerCase() : '';
    if (isAccentColour(value)) this.controls.accentColour.setValue(value);
  }

  defaultAccent(): void {
    this.controls.accentColour.setValue(null);
  }

  /** Marks a field invalid once the admin has tried to submit, or after an API refusal for it. */
  invalid(field: MarkedField): boolean {
    this.status();
    if (this.apiField() === field) return true;
    return this.submitted() && this.controls[field].invalid;
  }

  private slugMessage(): string {
    const errors = this.controls.slug.errors;
    return typeof errors?.['slug'] === 'string' ? errors['slug'] : 'Check the slug.';
  }

  async submit(): Promise<void> {
    if (this.busy()) return;
    this.submitted.set(true);
    this.apiField.set(null);
    this.form.markAllAsTouched();
    const problems = this.problems();
    if (problems.length || this.form.invalid) {
      this.warn(problems);
      return;
    }
    this.alerts.dismissKey(ALERT_KEY);
    const v = this.form.getRawValue();
    const rules = rulesChange(rulesFrom(this.controls.rules), DEFAULT_RULES, { champion: false });
    const body: NewLeague = {
      name: v.name.trim(),
      slug: v.slug,
      timezone: v.timezone.trim(),
      competitionId: v.competitionId,
      seasonName: v.seasonName.trim(),
      members: this.checked().members.map(({ fullName, displayName }) => ({
        fullName,
        displayName,
      })),
      captainDisplayName: v.captain,
      captainEmail: v.captainIsMe ? null : v.captainEmail.trim(),
      emblemPreset: v.emblemPreset,
      accentColour: v.accentColour,
      addMe: !v.captainIsMe && v.addMe,
      ...(Object.keys(rules).length ? { rules } : {}),
    };
    this.busy.set(true);
    try {
      const league = await this.admin.create(body);
      await this.router.navigateByUrl(`/${league.slug}`);
    } catch (error) {
      const code = error instanceof ApiError ? error.code : 'error';
      const message = error instanceof Error ? error.message : 'The league could not be created.';
      const field = FIELD_OF_CODE[code];
      if (!field) {
        this.alerts.error(message, { key: ALERT_KEY });
        return;
      }
      this.apiField.set(field);
      const row = this.checked().members[0]?.row ?? 0;
      const id = field === 'members' ? `new-league-member-${row}-superbru` : `new-league-${field}`;
      this.warn([{ id, message }]);
    } finally {
      this.busy.set(false);
    }
  }

  /** Fills in the time zone and season name from the competition until the admin edits them. */
  private applyCompetition(id: string): void {
    const option = this.competitions()?.find((c) => c.id === id);
    if (!option) return;
    setLastRound(this.controls.rules, option.regularRounds);
    if (!this.zoneEdited) this.controls.timezone.setValue(option.timezone);
    if (!this.seasonEdited) this.controls.seasonName.setValue(defaultSeasonName(option));
  }

  private clearApiError(field: ApiField): void {
    if (this.apiField() === field) this.apiField.set(null);
  }

  /** Everything the form cannot be sent with, in the order the form shows it. */
  private problems(): readonly FormProblem[] {
    const c = this.controls;
    const problems: FormProblem[] = [];
    const add = (id: string, message: string) => problems.push({ id: `new-league-${id}`, message });
    if (c.name.invalid) add('name', 'Give the league a name.');
    if (c.slug.invalid) add('slug', this.slugMessage());
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
    for (const rule of ruleProblems(c.rules, this.lastRound()))
      add(`rules-${rule.field}`, rule.message);
    return problems;
  }

  /** One warning card for the attempt and a highlight on the first problem; a rule opens the rules. */
  private warn(problems: readonly FormProblem[]): void {
    if (!problems.length) return;
    const [first] = problems;
    if (problems.some((problem) => problem.id.startsWith('new-league-rules-')))
      this.rulesOpen.set(true);
    this.highlight(first.id);
    this.alerts.warn(first.message, { key: ALERT_KEY, details: problemDetails(problems) });
  }

  /**
   * A repeated Superbru name is worth saying while typing, once: a warning when the repeat
   * first appears, none for the keystrokes after it.
   */
  private warnRepeats(errors: readonly MemberRowError[]): void {
    const repeats = errors.filter((error) => error.duplicate);
    const seen = new Set(repeats.map((error) => `${error.row}:${error.message}`));
    const fresh = repeats.find((error) => !this.warnedRepeats.has(`${error.row}:${error.message}`));
    this.warnedRepeats = seen;
    if (fresh) this.alerts.warn(`Member ${fresh.row + 1}: ${fresh.message}`, { key: ALERT_KEY });
  }

  private focus(id: string): void {
    afterNextRender(() => this.host.nativeElement.querySelector<HTMLElement>(`#${id}`)?.focus(), {
      injector: this.injector,
    });
  }

  /** Points the problem out without moving focus (focusing a text box zooms a phone). */
  private highlight(id: string): void {
    afterNextRender(
      () => highlightProblem(this.host.nativeElement.querySelector<HTMLElement>(`#${id}`)),
      { injector: this.injector },
    );
  }
}

/** A field an API refusal concerns. */
type ApiField = 'slug' | 'members' | 'captain';

/** The single controls the template marks invalid. */
type MarkedField =
  'name' | 'slug' | 'competitionId' | 'timezone' | 'seasonName' | 'captain' | 'captainEmail';

function memberRow() {
  return new FormGroup({
    name: new FormControl('', { nonNullable: true }),
    surname: new FormControl('', { nonNullable: true }),
    superbru: new FormControl('', { nonNullable: true }),
  });
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
