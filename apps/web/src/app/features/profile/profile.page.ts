import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { map } from 'rxjs';
import { safeReturnUrl } from '../../core/profile/profile.guards';
import { ProfileEditor } from './profile-editor';

/** Hosts the profile editor for onboarding (`/welcome`) and later edits (`/profile`). */
@Component({
  selector: 'app-profile-page',
  template: '<app-profile-editor (saved)="leave()" (cancel)="leave()" />',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ProfileEditor],
})
export class ProfilePage {
  private readonly router = inject(Router);
  private readonly returnUrl = toSignal(
    inject(ActivatedRoute).queryParamMap.pipe(map((params) => params.get('returnUrl'))),
  );
  /** Set by in-app profile links so editing returns to the page the member came from. */
  private readonly stateReturnUrl: unknown =
    this.router.currentNavigation()?.extras.state?.['returnUrl'];

  leave(): void {
    window.scrollTo(0, 0);
    void this.router.navigateByUrl(safeReturnUrl(this.returnUrl() ?? this.stateReturnUrl));
  }
}
