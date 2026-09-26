import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  output,
  signal,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { AuthService } from '../../core/auth/auth.service';
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
  imports: [ReactiveFormsModule, RouterLink, NgIcon, Loader, StadiumBackdrop, LeagueCrest],
  viewProviders: [provideIcons({ lucideArrowRight, lucideCheck })],
})
export class ProfileEditor {
  private readonly store = inject(ProfileStore);
  private readonly auth = inject(AuthService);
  private readonly data = inject(LeagueData);
  private readonly context = inject(LeagueContext);
  private readonly competition = inject(CompetitionService);
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
  readonly error = signal('');
  readonly submitted = signal(false);
  async choosePhoto(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.error.set('');
    this.busy.set(true);
    try {
      this.photo.set(await preparePhoto(file));
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Unable to open this photo.');
    } finally {
      this.busy.set(false);
    }
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
    if (this.form.invalid || this.busy() || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }
    this.error.set('');
    this.saving.set(true);
    try {
      await this.store.save({
        displayName: this.form.controls.displayName.value.trim(),
        teamId: this.form.controls.teamId.value,
        photo: this.photo(),
      });
      this.saved.emit();
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Unable to save your profile.');
    } finally {
      this.saving.set(false);
    }
  }
}
