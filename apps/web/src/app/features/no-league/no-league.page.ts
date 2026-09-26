import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideArrowRight } from '@ng-icons/lucide';
import { AuthService } from '../../core/auth/auth.service';
import { joinCodeFrom } from '../../core/league/join.service';
import { LeagueContext } from '../../core/league/league-context';
import { Loader } from '../../shared/loader/loader';

/**
 * `/no-league`: a signed-in account with no league yet. Explains how to get in, takes a
 * join link or code, and offers sign-out for the wrong account.
 */
@Component({
  selector: 'app-no-league-page',
  templateUrl: './no-league.page.html',
  styleUrls: ['../join/join.page.scss', './no-league.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, NgIcon, Loader],
  viewProviders: [provideIcons({ lucideArrowRight })],
})
export class NoLeaguePage {
  private readonly router = inject(Router);
  private readonly context = inject(LeagueContext);
  private readonly auth = inject(AuthService);
  readonly email = this.auth.email;
  readonly canSignOut = this.auth.configured;
  /** Why the account could not be loaded, when that is what brought the member here. */
  readonly accountError = this.context.accountError;
  /** A league the account can already open, when it came here by address. */
  readonly home = computed(() => (this.context.account() ? this.context.home() : null));
  readonly form = new FormGroup({
    code: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(300)],
    }),
  });
  readonly submitted = signal(false);
  readonly invalid = signal(false);
  readonly busy = signal(false);

  constructor() {
    // Loads the account for the "open your league" link when it came here by address.
    void this.context.ensureAccount();
  }

  join(): void {
    this.submitted.set(true);
    const code = joinCodeFrom(this.form.controls.code.value);
    this.invalid.set(!code);
    if (code) void this.router.navigate(['/join', code]);
  }

  async retry(): Promise<void> {
    this.busy.set(true);
    try {
      const account = await this.context.reloadAccount();
      const home = account ? this.context.home() : null;
      if (home) await this.router.navigate(['/', home.slug]);
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
}
