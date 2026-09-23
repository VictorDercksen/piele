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
import { preparePhoto } from '../../core/profile/profile-photo';
import { ProfileStore } from '../../core/profile/profile.store';
import { TEAMS, club } from '../../core/competition/teams';

/** Onboarding and profile form: display name, favourite team and optional photo. */
@Component({
  selector: 'app-profile-editor',
  templateUrl: './profile-editor.html',
  styleUrl: './profile-editor.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink],
})
export class ProfileEditor {
  private readonly store = inject(ProfileStore);
  readonly existing = this.store.profile();
  readonly teams = TEAMS;
  readonly saved = output<void>();
  readonly cancel = output<void>();
  readonly form = new FormGroup({
    displayName: new FormControl(this.existing?.displayName ?? '', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(50), Validators.pattern(/\S/)],
    }),
    teamId: new FormControl(this.existing?.teamId ?? '', {
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
  readonly photo = signal(this.existing?.photo ?? null);
  readonly busy = signal(false);
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
  save(): void {
    this.submitted.set(true);
    if (this.form.invalid || this.busy()) {
      this.form.markAllAsTouched();
      return;
    }
    this.error.set('');
    try {
      this.store.save({
        displayName: this.form.controls.displayName.value.trim(),
        teamId: this.form.controls.teamId.value,
        photo: this.photo(),
      });
      this.saved.emit();
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Unable to save your profile.');
    }
  }
}
