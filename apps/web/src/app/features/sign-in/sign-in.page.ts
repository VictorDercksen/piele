import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { map } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { safeReturnUrl } from '../../core/profile/profile.guards';
import { Loader } from '../../shared/loader/loader';

/** Sign in with Google or an email and password. Membership is decided by the API afterwards. */
@Component({
  selector: 'app-sign-in-page',
  templateUrl: './sign-in.page.html',
  styleUrl: './sign-in.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, Loader],
})
export class SignInPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly returnUrl = toSignal(
    inject(ActivatedRoute).queryParamMap.pipe(map((params) => params.get('returnUrl'))),
  );
  readonly mode = signal<'sign-in' | 'sign-up'>('sign-in');
  readonly busy = signal<'google' | 'password' | null>(null);
  readonly error = signal('');
  readonly notice = signal('');
  readonly submitted = signal(false);
  readonly form = new FormGroup({
    email: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.email, Validators.maxLength(320)],
    }),
    password: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(8), Validators.maxLength(72)],
    }),
  });

  toggleMode(): void {
    this.mode.set(this.mode() === 'sign-in' ? 'sign-up' : 'sign-in');
    this.error.set('');
    this.notice.set('');
    this.submitted.set(false);
  }

  async withGoogle(): Promise<void> {
    if (this.busy()) return;
    this.error.set('');
    this.busy.set('google');
    try {
      await this.auth.signInWithGoogle(safeReturnUrl(this.returnUrl()));
      // The browser leaves for Google here; busy stays set until it returns.
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Sign-in failed.');
      this.busy.set(null);
    }
  }

  async withPassword(): Promise<void> {
    this.submitted.set(true);
    if (this.form.invalid || this.busy()) {
      this.form.markAllAsTouched();
      return;
    }
    this.error.set('');
    this.notice.set('');
    this.busy.set('password');
    const { email, password } = this.form.getRawValue();
    try {
      if (this.mode() === 'sign-up') {
        const needsConfirmation = await this.auth.signUp(email.trim(), password);
        if (needsConfirmation) {
          this.notice.set('Check your inbox and confirm your email address, then sign in.');
          this.mode.set('sign-in');
          return;
        }
      } else {
        await this.auth.signInWithPassword(email.trim(), password);
      }
      await this.router.navigateByUrl(safeReturnUrl(this.returnUrl()));
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Sign-in failed.');
    } finally {
      this.busy.set(null);
    }
  }
}
