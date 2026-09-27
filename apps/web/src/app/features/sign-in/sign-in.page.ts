import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { map } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { CompetitionService, shortSeason } from '../../core/competition/competition.service';
import { AlertService } from '../../core/feedback/alert.service';
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
  private readonly competition = inject(CompetitionService);
  private readonly alerts = inject(AlertService);
  private readonly emailInput = viewChild.required<ElementRef<HTMLInputElement>>('emailInput');
  private readonly passwordInput =
    viewChild.required<ElementRef<HTMLInputElement>>('passwordInput');
  private readonly returnUrl = toSignal(
    inject(ActivatedRoute).queryParamMap.pipe(map((params) => params.get('returnUrl'))),
  );
  /** `URC 26/27`. */
  readonly competitionLabel = computed(
    () => `${this.competition.shortName} ${shortSeason(this.competition.season)}`,
  );
  readonly mode = signal<'sign-in' | 'sign-up'>('sign-in');
  readonly busy = signal<'google' | 'password' | null>(null);
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

  constructor() {
    // A refusal persists until dismissed; it should not outlive the page.
    inject(DestroyRef).onDestroy(() => this.alerts.dismissKey(ALERT_KEY));
  }

  toggleMode(): void {
    this.mode.set(this.mode() === 'sign-in' ? 'sign-up' : 'sign-in');
    this.alerts.dismissKey(ALERT_KEY);
    this.notice.set('');
    this.submitted.set(false);
  }

  async withGoogle(): Promise<void> {
    if (this.busy()) return;
    this.alerts.dismissKey(ALERT_KEY);
    this.busy.set('google');
    try {
      await this.auth.signInWithGoogle(safeReturnUrl(this.returnUrl()));
      // The browser leaves for Google here; busy stays set until it returns.
    } catch (error) {
      this.alerts.error(error instanceof Error ? error.message : 'Sign-in failed.', {
        key: ALERT_KEY,
      });
      this.busy.set(null);
    }
  }

  async withPassword(): Promise<void> {
    this.submitted.set(true);
    if (this.busy()) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.reportProblems();
      return;
    }
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
      this.alerts.dismissKey(ALERT_KEY);
      await this.router.navigateByUrl(safeReturnUrl(this.returnUrl()));
    } catch (error) {
      this.alerts.error(error instanceof Error ? error.message : 'Sign-in failed.', {
        key: ALERT_KEY,
      });
    } finally {
      this.busy.set(null);
    }
  }

  /** One warning for the attempt, naming each field to fix, and focus on the first. */
  private reportProblems(): void {
    const { email, password } = this.form.controls;
    const problems: { message: string; input: HTMLInputElement }[] = [];
    if (email.invalid)
      problems.push({
        message: 'Enter a valid email address.',
        input: this.emailInput().nativeElement,
      });
    if (password.invalid)
      problems.push({
        message: 'Use at least 8 characters.',
        input: this.passwordInput().nativeElement,
      });
    const [first, ...rest] = problems;
    if (!first) return;
    first.input.focus();
    this.alerts.warn(first.message, {
      key: ALERT_KEY,
      details: rest.map((problem) => problem.message),
    });
  }
}

/** The sign-in form's one card: a replacement for each attempt. */
const ALERT_KEY = 'sign-in';
