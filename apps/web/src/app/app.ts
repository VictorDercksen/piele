import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { LeaguePreview } from './league-preview';
import { CONCEPTS } from './concepts';
import { ProfileStore } from './profile/profile-store';
import { ProfileEditor } from './profile/profile-editor';

@Component({
  selector: 'app-root',
  templateUrl: './app.html',
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LeaguePreview, ProfileEditor],
})
export class App {
  private readonly profileStore = inject(ProfileStore);
  readonly concept = CONCEPTS[1];
  readonly editing = signal(false);
  readonly showProfile = computed(() => !this.profileStore.profile() || this.editing());
  readonly captain = signal(false);
  editProfile(editing: boolean): void {
    this.editing.set(editing);
    window.scrollTo(0, 0);
  }
}
