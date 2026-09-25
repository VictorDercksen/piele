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
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { HttpLeagueData } from '../../core/league/http-league-data';
import { LeagueData } from '../../core/league/league-data';
import { preparePhoto } from '../../core/profile/profile-photo';
import { ProfileStore } from '../../core/profile/profile.store';
import { TEAMS, club } from '../../core/competition/teams';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideArrowRight, lucideCheck } from '@ng-icons/lucide';
import { Loader } from '../../shared/loader/loader';
import { StadiumBackdrop } from '../../shared/stadium-backdrop/stadium-backdrop';

/** Onboarding and profile form: display name, favourite team and optional photo. */
@Component({
  selector: 'app-profile-editor',
  templateUrl: './profile-editor.html',
  styleUrl: './profile-editor.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, NgIcon, Loader, StadiumBackdrop],
  viewProviders: [provideIcons({ lucideArrowRight, lucideCheck })],
})
export class ProfileEditor {
  private readonly store = inject(ProfileStore);
  private readonly auth = inject(AuthService);
  private readonly league = inject(LeagueData);
  private readonly router = inject(Router);
  readonly existing = this.store.profile();
  /** Starts from the saved profile, else one this browser kept before profiles moved to the account. */
  private readonly start = this.existing ?? this.store.earlier;
  readonly persisted = this.store.persisted;
  /** The league's nickname for the member, which the browser profile cannot override. */
  readonly leagueName = this.league.currentMemberName();
  readonly canSignOut = this.auth.configured;
  readonly accountEmail = this.auth.email;
  readonly teams = TEAMS;
  readonly saved = output<void>();
  readonly cancel = output<void>();
  readonly form = new FormGroup({
    displayName: new FormControl(this.leagueName ?? this.existing?.displayName ?? '', {
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
  readonly selectedTeam = computed(() => club(this.teamId()));
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
      await this.auth.signOut();
      if (this.league instanceof HttpLeagueData) this.league.clear();
      await this.router.navigateByUrl('/sign-in');
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
