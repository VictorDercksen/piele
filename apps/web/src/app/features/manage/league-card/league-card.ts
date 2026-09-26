import {
  ChangeDetectionStrategy,
  Component,
  DOCUMENT,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideArrowRight, lucideCopy } from '@ng-icons/lucide';
import { AdminLeague, CaptainCandidate } from '../../../core/league/admin.models';
import { AdminService } from '../../../core/league/admin.service';
import { LeagueCrest } from '../../../shared/league-crest/league-crest';
import { Loader } from '../../../shared/loader/loader';
import { ReasonDialog } from '../../duties/reason-dialog/reason-dialog';
import { notBlank, zoneValidator } from '../manage-validators';

/** The eyebrow of the management centre's confirmation dialogs. */
const EYEBROW = 'THE PAVILION / MANAGEMENT CENTRE';

/**
 * One league in the management centre: what it is (crest, slug, competition and season,
 * captain, counts, status, join code) and what the admin can do with it: open it, add
 * themselves, rename it or change its time zone, archive or restore it (confirmed), and
 * appoint a captain from its claimed members (confirmed).
 */
@Component({
  selector: 'app-league-card',
  templateUrl: './league-card.html',
  styleUrls: ['../manage-fields.scss', './league-card.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, NgIcon, LeagueCrest, Loader],
  viewProviders: [provideIcons({ lucideArrowRight, lucideCopy })],
})
export class LeagueCard {
  private readonly admin = inject(AdminService);
  private readonly injector = inject(Injector);
  private readonly origin = inject(DOCUMENT).location.origin;
  readonly league = input.required<AdminLeague>();
  /** The page's confirmation dialog. */
  readonly dialog = input.required<ReasonDialog>();
  /** A change worth announcing on the page, and whether the league moved between groups. */
  readonly changed = output<LeagueChange>();

  private readonly renameButton = viewChild<ElementRef<HTMLButtonElement>>('renameButton');
  private readonly renameInput = viewChild<ElementRef<HTMLInputElement>>('renameInput');

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

  readonly busy = signal(false);
  readonly error = signal('');
  readonly copied = signal(false);
  private copiedTimer: ReturnType<typeof setTimeout> | undefined;

  readonly renaming = signal(false);
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
  }

  async copyLink(): Promise<void> {
    const link = this.joinLink();
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      this.error.set('');
      this.copied.set(true);
      clearTimeout(this.copiedTimer);
      this.copiedTimer = setTimeout(() => this.copied.set(false), 4000);
    } catch {
      this.copied.set(false);
      this.error.set(`This browser did not allow copying. The link is ${link}`);
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

  startRename(): void {
    const league = this.league();
    this.renameForm.reset({ name: league.name, timezone: league.timezone });
    this.renameSubmitted.set(false);
    this.error.set('');
    this.renaming.set(true);
    afterNextRender(() => this.renameInput()?.nativeElement.focus(), { injector: this.injector });
  }

  cancelRename(): void {
    this.renaming.set(false);
    this.error.set('');
    afterNextRender(() => this.renameButton()?.nativeElement.focus(), { injector: this.injector });
  }

  async saveRename(): Promise<void> {
    this.renameSubmitted.set(true);
    if (this.renameForm.invalid || this.busy()) return;
    const league = this.league();
    const name = this.renameForm.controls.name.value.trim();
    const timezone = this.renameForm.controls.timezone.value.trim();
    const patch = {
      ...(name !== league.name ? { name } : {}),
      ...(timezone !== league.timezone ? { timezone } : {}),
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
    if (!choice) return;
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
    this.error.set('');
    try {
      await action();
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'That did not work.');
    } finally {
      this.busy.set(false);
    }
  }
}

export interface LeagueChange {
  readonly id: string;
  readonly message: string;
  /** Set when the league moved to the archived group or back. */
  readonly moved?: 'archived' | 'active';
}
