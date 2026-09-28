import { HlmRadioGroup } from '@spartan-ng/helm/radio-group';
import { HlmRadio } from '@spartan-ng/helm/radio-group';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmInput } from '@spartan-ng/helm/input';
import { HlmLabel } from '@spartan-ng/helm/label';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  inject,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { AuthService } from '../../core/auth/auth.service';
import { AlertService } from '../../core/feedback/alert.service';
import { highlightProblem } from '../../core/feedback/problem-highlight';
import { LeagueContext } from '../../core/league/league-context';
import { LeagueData } from '../../core/league/league-data';
import { preparePhoto } from '../../core/profile/profile-photo';
import { ProfileStore } from '../../core/profile/profile.store';
import { CompetitionService, shortSeason } from '../../core/competition/competition.service';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideArrowRight, lucideCheck } from '@ng-icons/lucide';
import { Loader } from '../../shared/loader/loader';
import { LeagueCrest } from '../../shared/league-crest/league-crest';
import { StadiumBackdrop } from '../../shared/stadium-backdrop/stadium-backdrop';

/** Onboarding and profile form: display name, favourite team and optional photo. */
@Component({
  selector: 'app-profile-editor',
  templateUrl: './profile-editor.html',
  styleUrl: './profile-editor.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  /* prettier-ignore */
  imports: [
    ReactiveFormsModule,
    RouterLink,
    NgIcon,
    Loader,
    StadiumBackdrop,
    LeagueCrest,
    HlmButton,
    HlmInput,
    HlmLabel,
    HlmRadioGroup,
    HlmRadio,
  ],
  viewProviders: [provideIcons({ lucideArrowRight, lucideCheck })],
})
export class ProfileEditor {
  private readonly store = inject(ProfileStore);
  private readonly auth = inject(AuthService);
  private readonly data = inject(LeagueData);
  private readonly context = inject(LeagueContext);
  private readonly competition = inject(CompetitionService);
  private readonly alerts = inject(AlertService);
  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly nameInput = viewChild.required<ElementRef<HTMLInputElement>>('nameInput');
  private readonly photoInput = viewChild.required<ElementRef<HTMLInputElement>>('photoInput');
  readonly existing = this.store.profile();
  /**
   * Starts from the saved profile, else what the browser keeps (a profile from before they
   * moved to the account, or the name and photo shared by every league).
   */
  private readonly start = this.existing ?? this.store.earlier();
  /** The league this profile belongs to; the favourite team is per league. */
  readonly leagueSummary = this.context.current;
  readonly leagueTitle = this.context.name;
  readonly leagueHome = computed(() => this.context.url());
  readonly persisted = this.store.persisted;
  /** The league's nickname for the member, which the browser profile cannot override. */
  readonly leagueName = this.data.currentMemberName();
  readonly canSignOut = this.auth.configured;
  readonly accountEmail = this.auth.email;
  readonly teams = computed(() => this.competition.current().teams);
  /** `URC 26/27`. */
  readonly competitionLabel = computed(
    () => `${this.competition.shortName} ${shortSeason(this.competition.season)}`,
  );
  readonly saved = output<void>();
  readonly cancel = output<void>();
  readonly form = new FormGroup({
    displayName: new FormControl(this.leagueName ?? this.start?.displayName ?? '', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(50), Validators.pattern(/\S/)],
    }),
    teamId: new FormControl(this.start?.teamId ?? '', {
      nonNullable: true,
      validators: [Validators.required],
    }),
  });
  readonly teamId = toSignal(this.form.controls.teamId.valueChanges, {
    initialValue: this.form.controls.teamId.value,
  });
  readonly name = toSignal(this.form.controls.displayName.valueChanges, {
    initialValue: this.form.controls.displayName.value,
  });
  readonly selectedTeam = computed(() => this.competition.current().team(this.teamId()));
  readonly initials = computed(() =>
    (this.name().trim() || 'You')
      .split(/\s+/)
      .slice(0, 2)
      .map((word) => word[0])
      .join('')
      .toUpperCase(),
  );
  readonly photo = signal(this.start?.photo ?? null);
  readonly busy = signal(false);
  readonly saving = signal(false);
  readonly submitted = signal(false);
  /** The last chosen file could not be used; cleared by the next choice or removal. */
  readonly photoInvalid = signal(false);

  constructor() {
    // A failed save persists until dismissed; it should not outlive the editor.
    inject(DestroyRef).onDestroy(() => {
      this.alerts.dismissKey(ALERT_KEY);
      this.alerts.dismissKey(PHOTO_ALERT_KEY);
    });
  }

  async choosePhoto(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.photoInvalid.set(false);
    this.busy.set(true);
    try {
      this.photo.set(await preparePhoto(file));
      this.alerts.dismissKey(PHOTO_ALERT_KEY);
    } catch (error) {
      // Every refusal from `preparePhoto` is about the file: a wrong type or size, or an
      // image this browser cannot open. The member picks another one.
      this.photoInvalid.set(true);
      this.alerts.warn(error instanceof Error ? error.message : 'Unable to open this photo.', {
        key: PHOTO_ALERT_KEY,
      });
      // The input is disabled while busy; point it out once it is enabled again.
      afterNextRender(() => highlightProblem(this.photoInput().nativeElement), {
        injector: this.injector,
      });
    } finally {
      this.busy.set(false);
    }
  }

  removePhoto(): void {
    this.photo.set(null);
    this.photoInvalid.set(false);
  }
  async signOut(): Promise<void> {
    this.busy.set(true);
    try {
      await this.context.signOut();
    } finally {
      this.busy.set(false);
    }
  }
  async save(): Promise<void> {
    this.submitted.set(true);
    if (this.busy() || this.saving()) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.reportProblems();
      return;
    }
    this.saving.set(true);
    try {
      await this.store.save({
        displayName: this.form.controls.displayName.value.trim(),
        teamId: this.form.controls.teamId.value,
        photo: this.photo(),
      });
      this.alerts.dismissKey(ALERT_KEY);
      this.saved.emit();
    } catch (error) {
      // A failed upload, API refusal or unavailable storage: the profile is not saved.
      this.alerts.error(error instanceof Error ? error.message : 'Unable to save your profile.', {
        key: ALERT_KEY,
      });
    } finally {
      this.saving.set(false);
    }
  }

  /** One warning for the attempt, naming each field to fix, and a highlight on the first. */
  private reportProblems(): void {
    const problems: { message: string; control: () => HTMLElement | null }[] = [];
    if (this.form.controls.displayName.invalid)
      problems.push({
        message: 'Enter your name to continue.',
        control: () => this.nameInput().nativeElement,
      });
    if (this.form.controls.teamId.invalid)
      problems.push({
        message: 'Choose the team you support.',
        control: () =>
          this.host.nativeElement.querySelector<HTMLInputElement>('.team-options input'),
      });
    const [first, ...rest] = problems;
    if (!first) return;
    highlightProblem(first.control());
    this.alerts.warn(first.message, {
      key: ALERT_KEY,
      details: rest.map((problem) => problem.message),
    });
  }
}

/** The profile form's one card: a replacement for each attempt, or the failed save. */
const ALERT_KEY = 'profile';
/** The photo field's card: a file that could not be used. */
const PHOTO_ALERT_KEY = 'profile-photo';
