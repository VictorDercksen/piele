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
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideArrowRight } from '@ng-icons/lucide';
import { map } from 'rxjs';
import { COMPETITIONS } from '../../../core/competition/registry';
import { CompetitionOption, NewLeague } from '../../../core/league/admin.models';
import { AdminService } from '../../../core/league/admin.service';
import { DEFAULT_ACCENT, EMBLEM_LABELS, isAccentColour, isEmblemPreset } from '../../../core/league/emblems';
import { ApiError } from '../../../core/league/http-league-data';
import { deriveSlug } from '../../../core/league/league-slugs';
import { EmblemPicker } from '../../../shared/emblem-picker/emblem-picker';
import { LeagueCrest } from '../../../shared/league-crest/league-crest';
import { Loader } from '../../../shared/loader/loader';
import {
  membersValidator,
  notBlank,
  slugValidator,
  zoneValidator,
} from '../manage-validators';
import { parseMembers } from '../members-parser';

/** API refusals shown beside the field they concern; every other code shows at the top. */
const FIELD_OF_CODE: Readonly<Partial<Record<string, 'slug' | 'members'>>> = {
  slug_taken: 'slug',
  invalid_slug: 'slug',
  duplicate_member: 'members',
  unknown_captain: 'members',
};

/** The order fields are checked in, for moving focus to the first one to fix. */
const FIELD_ORDER = [
  'name',
  'slug',
  'competitionId',
  'timezone',
  'seasonName',
  'members',
  'captain',
  'captainEmail',
] as const;

/**
 * The management centre's new-league form: name and slug (derived from the name until
 * edited), competition, time zone and season name (defaulted from the competition until
 * edited), the team sheet pasted one member per line, the captain (the admin, or another
 * member with the email their name is reserved for), the admin's own membership, an emblem
 * preset and the accent colour. One request makes the league; success opens it.
 */
@Component({
  selector: 'app-create-league-form',
  templateUrl: './create-league-form.html',
  styleUrls: ['../manage-fields.scss', './create-league-form.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, NgIcon, EmblemPicker, LeagueCrest, Loader],
  viewProviders: [provideIcons({ lucideArrowRight })],
})
export class CreateLeagueForm {
  private readonly admin = inject(AdminService);
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
    members: new FormControl('', { nonNullable: true, validators: [membersValidator] }),
    captain: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    captainIsMe: new FormControl(true, { nonNullable: true }),
    captainEmail: new FormControl('', {
      nonNullable: true,
      validators: [Validators.email, Validators.maxLength(254)],
    }),
    addMe: new FormControl(false, { nonNullable: true }),
    emblemPreset: new FormControl<string | null>(null),
    accentColour: new FormControl<string | null>(null),
  });
  readonly controls = this.form.controls;
  /** The form's whole value, as a signal for the template's conditions and previews. */
  readonly value = toSignal(this.form.valueChanges.pipe(map(() => this.form.getRawValue())), {
    initialValue: this.form.getRawValue(),
  });
  /** Re-reads validity after each change (`statusChanges` covers validator swaps too). */
  private readonly status = toSignal(this.form.statusChanges, { initialValue: this.form.status });

  readonly parsed = computed(() => parseMembers(this.value().members));
  readonly captainOptions = computed(() => this.parsed().members.map((m) => m.displayName));
  /** `6 members ready, 1 line to fix.` */
  readonly summaryLine = computed(() => {
    const { members, errors } = this.parsed();
    const ready = `${members.length} ${members.length === 1 ? 'member' : 'members'} ready`;
    if (!errors.length) return `${ready}.`;
    return `${ready}, ${errors.length} ${errors.length === 1 ? 'line' : 'lines'} to fix.`;
  });
  readonly accentValue = computed(() => this.value().accentColour ?? DEFAULT_ACCENT);
  readonly presetLabel = computed(() => {
    const preset = this.value().emblemPreset;
    return isEmblemPreset(preset) ? EMBLEM_LABELS[preset] : null;
  });

  readonly competitions = signal<readonly CompetitionOption[] | null>(null);
  readonly competitionsError = signal('');
  readonly submitted = signal(false);
  readonly busy = signal(false);
  /** API refusals: beside the slug, beside the members, or at the top. */
  readonly apiError = signal<{ readonly field: 'slug' | 'members' | 'top'; readonly message: string } | null>(
    null,
  );

  /** The user typed a slug, a time zone or a season name: stop filling it in. */
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
        // A captain whose line was removed or renamed is no longer a choice.
        if (c.captain.value && !this.captainOptions().includes(c.captain.value)) c.captain.setValue('');
      },
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

  zoneTyped(): void {
    this.zoneEdited = true;
  }

  seasonTyped(): void {
    this.seasonEdited = true;
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

  /** Shows a field's problem once the admin has tried to submit, or an API refusal for it. */
  invalid(field: (typeof FIELD_ORDER)[number]): boolean {
    this.status();
    const api = this.apiError();
    if (api && api.field === field) return true;
    return this.submitted() && this.controls[field].invalid;
  }

  fieldApiError(field: 'slug' | 'members'): string | null {
    const api = this.apiError();
    return api?.field === field ? api.message : null;
  }

  slugMessage(): string {
    const errors = this.controls.slug.errors;
    return typeof errors?.['slug'] === 'string' ? errors['slug'] : 'Check the slug.';
  }

  async submit(): Promise<void> {
    if (this.busy()) return;
    this.submitted.set(true);
    this.apiError.set(null);
    this.form.markAllAsTouched();
    if (this.form.invalid) {
      this.focusFirstInvalid();
      return;
    }
    const v = this.form.getRawValue();
    const body: NewLeague = {
      name: v.name.trim(),
      slug: v.slug,
      timezone: v.timezone.trim(),
      competitionId: v.competitionId,
      seasonName: v.seasonName.trim(),
      members: this.parsed().members.map(({ fullName, displayName }) => ({ fullName, displayName })),
      captainDisplayName: v.captain,
      captainEmail: v.captainIsMe ? null : v.captainEmail.trim(),
      emblemPreset: v.emblemPreset,
      accentColour: v.accentColour,
      addMe: !v.captainIsMe && v.addMe,
    };
    this.busy.set(true);
    try {
      const league = await this.admin.create(body);
      await this.router.navigateByUrl(`/${league.slug}`);
    } catch (error) {
      const code = error instanceof ApiError ? error.code : 'error';
      const message = error instanceof Error ? error.message : 'The league could not be created.';
      const field = FIELD_OF_CODE[code] ?? 'top';
      this.apiError.set({ field, message });
      this.focus(field === 'top' ? 'new-league-error' : `new-league-${field}`);
    } finally {
      this.busy.set(false);
    }
  }

  /** Fills in the time zone and season name from the competition until the admin edits them. */
  private applyCompetition(id: string): void {
    const option = this.competitions()?.find((c) => c.id === id);
    if (!option) return;
    if (!this.zoneEdited) this.controls.timezone.setValue(option.timezone);
    if (!this.seasonEdited) this.controls.seasonName.setValue(defaultSeasonName(option));
  }

  private clearApiError(field: 'slug' | 'members'): void {
    if (this.apiError()?.field === field) this.apiError.set(null);
  }

  private focusFirstInvalid(): void {
    const field = FIELD_ORDER.find((name) => this.controls[name].invalid);
    if (field) this.focus(`new-league-${field}`);
  }

  private focus(id: string): void {
    afterNextRender(
      () => this.host.nativeElement.querySelector<HTMLElement>(`#${id}`)?.focus(),
      { injector: this.injector },
    );
  }
}

/**
 * `URC 2026/27`: the competition's short name and season. The web registry knows the season
 * of the competitions it ships; otherwise the season at the end of the name is used.
 */
export function defaultSeasonName(option: Pick<CompetitionOption, 'id' | 'name' | 'shortName'>): string {
  const season =
    COMPETITIONS.get(option.id)?.season ?? option.name.match(/\d{4}(?:\/\d{2,4})?$/)?.[0] ?? '';
  return season ? `${option.shortName} ${season}` : option.shortName;
}
