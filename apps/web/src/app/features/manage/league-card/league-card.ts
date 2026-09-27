import {
  ChangeDetectionStrategy,
  Component,
  DOCUMENT,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideArrowRight,
  lucideCheck,
  lucideChevronDown,
  lucideCopy,
  lucideCrown,
} from '@ng-icons/lucide';
import { AlertService } from '../../../core/feedback/alert.service';
import { AdminLeague, CaptainCandidate, LeagueUpdate } from '../../../core/league/admin.models';
import { AdminService } from '../../../core/league/admin.service';
import { LeagueCrest } from '../../../shared/league-crest/league-crest';
import { withDefaultRules } from '../../../core/league/superbru';
import { Loader } from '../../../shared/loader/loader';
import { RulesFields } from '../../../shared/rules-fields/rules-fields';
import {
  resetRules,
  ruleProblems,
  rulesChange,
  rulesFrom,
  rulesGroup,
  setLastRound,
} from '../../../shared/rules-fields/rules-form';
import { ReasonDialog } from '../../duties/reason-dialog/reason-dialog';
import { FormProblem, problemDetails } from '../form-problems';
import { notBlank, zoneValidator } from '../manage-validators';
import { timeZoneGroups } from '../time-zones';

/** The eyebrow of the management centre's confirmation dialogs. */
const EYEBROW = 'THE PAVILION / MANAGEMENT CENTRE';

/**
 * One league in the management centre, collapsed to its crest, name and status until opened:
 * what it is (slug, competition and season, captain, counts, time zone, join code) and what
 * the admin can do with it: open it, add
 * themselves, rename it or change its time zone and Superbru rules, archive or restore it
 * (confirmed), and
 * appoint a captain from its claimed members (confirmed).
 */
@Component({
  selector: 'app-league-card',
  templateUrl: './league-card.html',
  styleUrls: ['../manage-fields.scss', './league-card.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, NgIcon, LeagueCrest, Loader, RulesFields],
  viewProviders: [
    provideIcons({ lucideArrowRight, lucideCheck, lucideChevronDown, lucideCopy, lucideCrown }),
  ],
})
export class LeagueCard {
  private readonly admin = inject(AdminService);
  private readonly alerts = inject(AlertService);
  private readonly injector = inject(Injector);
  private readonly document = inject(DOCUMENT);
  private readonly origin = this.document.location.origin;
  readonly league = input.required<AdminLeague>();
  /** The page's confirmation dialog. */
  readonly dialog = input.required<ReasonDialog>();
  /** A change worth announcing on the page, and whether the league moved between groups. */
  readonly changed = output<LeagueChange>();

  private readonly renameButton = viewChild<ElementRef<HTMLButtonElement>>('renameButton');

  readonly id = computed(() => `league-${this.league().id}`);
  readonly active = computed(() => this.league().status === 'active');
  readonly seasonLine = computed(() => {
    const league = this.league();
    return league.season ? league.season.name : 'No active season';
  });
  readonly captainLine = computed(() => {
    const captain = this.league().captain;
    if (!captain) return 'No captain claimed yet';
    return captain.claimed
      ? captain.displayName
      : `No captain claimed yet (${captain.displayName} is named)`;
  });
  readonly joinLink = computed(() => {
    const code = this.league().joinCode;
    return code ? `${this.origin}/join/${code}` : null;
  });

  readonly zoneGroups = computed(() => timeZoneGroups(this.league().timezone));
  /** Regular rounds per competition id, from `AdminService.competitions()` once loaded. */
  private readonly regularRounds = signal<ReadonlyMap<string, number> | null>(null);
  /**
   * The latest round the season may start scoring from: the competition's regular rounds, or
   * the league's saved starting round until the competition list arrives (never looser).
   */
  readonly lastRound = computed(() => {
    const league = this.league();
    return this.regularRounds()?.get(league.competition.id) ?? league.rules.startingRound;
  });

  readonly expanded = signal(false);
  readonly busy = signal(false);
  readonly copied = signal(false);
  private copiedTimer: ReturnType<typeof setTimeout> | undefined;

  readonly renaming = signal(false);
  /** The rename form's "Superbru rules" group is open. */
  readonly rulesOpen = signal(false);
  readonly renameSubmitted = signal(false);
  readonly renameForm = new FormGroup({
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

  readonly candidates = signal<readonly CaptainCandidate[] | null>(null);
  readonly candidatesError = signal('');
  readonly captainChoice = new FormControl('', { nonNullable: true });
  readonly captainSubmitted = signal(false);
  /** Everyone who could take over, leaving out the current captain. */
  readonly choices = computed(() =>
    (this.candidates() ?? []).filter((c) => c.id !== this.league().captain?.memberId),
  );

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.copiedTimer));
    // The bound follows the competition list when it arrives after the form opened.
    effect(() => {
      const lastRound = this.lastRound();
      untracked(() => setLastRound(this.renameForm.controls.rules, lastRound));
    });
  }

  toggle(): void {
    this.expanded.update((open) => !open);
  }

  async copyLink(): Promise<void> {
    const link = this.joinLink();
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      this.alerts.dismissKey(`${this.id()}-copy`);
      this.copied.set(true);
      clearTimeout(this.copiedTimer);
      this.copiedTimer = setTimeout(() => this.copied.set(false), 4000);
    } catch {
      this.copied.set(false);
      this.alerts.error(`This browser did not allow copying. The link is ${link}`, {
        key: `${this.id()}-copy`,
      });
    }
  }

  async addMe(): Promise<void> {
    const league = this.league();
    await this.run(async () => {
      await this.admin.addMe(league.id);
      this.changed.emit({
        id: league.id,
        message: `You are a member of ${league.name} now, outside the season.`,
      });
    });
  }

  archive(): void {
    const league = this.league();
    this.dialog().open({
      eyebrow: EYEBROW,
      title: `Archive ${league.name}?`,
      description: `${league.name} leaves every league list and its pages close to its members. Nothing is deleted: the records, standings and duties stay, and you can restore it here.`,
      submitLabel: 'Archive',
      required: false,
      noReason: true,
      action: async () => {
        await this.admin.update(league.id, { status: 'archived' });
      },
      done: () =>
        this.changed.emit({ id: league.id, message: `${league.name} is archived.`, moved: 'archived' }),
    });
  }

  restore(): void {
    const league = this.league();
    this.dialog().open({
      eyebrow: EYEBROW,
      title: `Restore ${league.name}?`,
      description: `${league.name} opens again for its members with everything it had, and its feed says so.`,
      submitLabel: 'Restore',
      required: false,
      noReason: true,
      action: async () => {
        await this.admin.update(league.id, { status: 'active' });
      },
      done: () =>
        this.changed.emit({ id: league.id, message: `${league.name} is open again.`, moved: 'active' }),
    });
  }

  /** The competitions' regular rounds (one request for every card); the fallback stays on failure. */
  private async loadRegularRounds(): Promise<void> {
    if (this.regularRounds()) return;
    try {
      const list = await this.admin.competitions();
      this.regularRounds.set(new Map(list.map((c) => [c.id, c.regularRounds])));
    } catch {
      // Keep the league's own starting round as the bound; the API validates the rest.
    }
  }

  startRename(): void {
    const league = this.league();
    this.renameForm.reset({ name: league.name, timezone: league.timezone });
    void this.loadRegularRounds();
    resetRules(this.renameForm.controls.rules, withDefaultRules(league.rules));
    this.rulesOpen.set(false);
    this.renameSubmitted.set(false);
    this.renaming.set(true);
    this.focus(`${this.id()}-rename-name`);
  }

  cancelRename(): void {
    this.renaming.set(false);
    this.alerts.dismissKey(`${this.id()}-rename`);
    afterNextRender(() => this.renameButton()?.nativeElement.focus(), { injector: this.injector });
  }

  async saveRename(): Promise<void> {
    if (this.busy()) return;
    this.renameSubmitted.set(true);
    const problems = this.renameProblems();
    if (problems.length) {
      // The collapsed rules group opens so its fields can be seen and focused.
      if (this.renameForm.controls.rules.invalid) this.rulesOpen.set(true);
      this.warn('rename', problems);
      return;
    }
    if (this.renameForm.invalid) return;
    this.alerts.dismissKey(`${this.id()}-rename`);
    const league = this.league();
    const name = this.renameForm.controls.name.value.trim();
    const timezone = this.renameForm.controls.timezone.value.trim();
    // The champion is kept as it is: the captain's desk sets it among the members.
    const rules = rulesChange(
      rulesFrom(this.renameForm.controls.rules),
      withDefaultRules(league.rules),
      { champion: false },
    );
    const patch: LeagueUpdate = {
      ...(name !== league.name ? { name } : {}),
      ...(timezone !== league.timezone ? { timezone } : {}),
      ...(Object.keys(rules).length ? { rules } : {}),
    };
    if (!Object.keys(patch).length) {
      this.cancelRename();
      return;
    }
    await this.run(async () => {
      await this.admin.update(league.id, patch);
      this.cancelRename();
      this.changed.emit({ id: league.id, message: `${name} is saved.` });
    });
  }

  /** What stops the rename form from saving, in the order the form shows it. */
  private renameProblems(): readonly FormProblem[] {
    const controls = this.renameForm.controls;
    const id = this.id();
    const problems: FormProblem[] = [];
    if (controls.name.invalid)
      problems.push({ id: `${id}-rename-name`, message: 'Give the league a name.' });
    if (controls.timezone.invalid)
      problems.push({ id: `${id}-rename-zone`, message: 'Choose a time zone from the list.' });
    for (const rule of ruleProblems(controls.rules, this.lastRound()))
      problems.push({ id: `${id}-rules-${rule.field}`, message: rule.message });
    return problems;
  }

  rulesToggled(event: Event): void {
    if (event.target instanceof HTMLDetailsElement) this.rulesOpen.set(event.target.open);
  }

  /** Loads the claimed members the first time the captain panel opens. */
  async loadCandidates(event: Event): Promise<void> {
    const details = event.target instanceof HTMLDetailsElement ? event.target : null;
    if (!details?.open || this.candidates()) return;
    await this.reloadCandidates();
  }

  async reloadCandidates(): Promise<void> {
    this.candidatesError.set('');
    try {
      this.candidates.set(await this.admin.captainCandidates(this.league().id));
    } catch (error) {
      this.candidatesError.set(error instanceof Error ? error.message : 'The team sheet could not be loaded.');
    }
  }

  appoint(): void {
    this.captainSubmitted.set(true);
    const league = this.league();
    const choice = this.choices().find((c) => c.id === this.captainChoice.value);
    if (!choice) {
      this.warn('captain', [{ id: `${this.id()}-captain`, message: 'Choose who takes over.' }]);
      return;
    }
    this.alerts.dismissKey(`${this.id()}-captain`);
    const current = league.captain?.displayName;
    this.dialog().open({
      eyebrow: EYEBROW,
      title: `Make ${choice.displayName} captain?`,
      description: `${choice.displayName} takes over the captain's desk of ${league.name}${
        current ? ` from ${current}, who stays on the team sheet as a member` : ''
      }. The feed says so.`,
      submitLabel: 'Appoint captain',
      required: false,
      noReason: true,
      action: async () => {
        await this.admin.appointCaptain(league.id, choice.id);
      },
      done: () => {
        this.captainChoice.reset();
        this.captainSubmitted.set(false);
        this.changed.emit({
          id: league.id,
          message: `${choice.displayName} is captain of ${league.name}.`,
        });
      },
    });
  }

  private async run(action: () => Promise<void>): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.alerts.dismissKey(`${this.id()}-error`);
    try {
      await action();
    } catch (error) {
      this.alerts.error(error instanceof Error ? error.message : 'That did not work.', {
        key: `${this.id()}-error`,
      });
    } finally {
      this.busy.set(false);
    }
  }

  /** One warning card per attempt, keyed to this card's form, and focus on the first problem. */
  private warn(form: 'rename' | 'captain', problems: readonly FormProblem[]): void {
    this.focus(problems[0].id);
    this.alerts.warn(problems[0].message, {
      key: `${this.id()}-${form}`,
      details: problemDetails(problems),
    });
  }

  private focus(id: string): void {
    afterNextRender(
      () => this.document.getElementById(id)?.focus(),
      { injector: this.injector },
    );
  }
}

export interface LeagueChange {
  readonly id: string;
  readonly message: string;
  /** Set when the league moved to the archived group or back. */
  readonly moved?: 'archived' | 'active';
}
