import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { HttpLeagueData } from '../../core/league/http-league-data';
import { LeagueData } from '../../core/league/league-data';

/** Shown to a signed-in account whose email matches no league membership. */
@Component({
  selector: 'app-not-a-member-page',
  template: `
    <section class="notice">
      <span class="eyebrow">PIELE / MEMBERS ONLY</span>
      <h1>Not on the team sheet.</h1>
      @if (error(); as message) {
        <p>{{ message }}</p>
      } @else {
        <p>
          {{ email() || 'This account' }} does not match a league membership. Ask your captain
          to add this address, then sign in again.
        </p>
      }
      <div class="actions">
        <button type="button" class="primary-button" (click)="retry()" [disabled]="busy()">
          Try again
        </button>
        <button type="button" class="text-button" (click)="signOut()" [disabled]="busy()">
          Sign out
        </button>
      </div>
    </section>
  `,
  styles: `
    :host {
      display: grid;
      place-items: center;
      min-height: 100vh;
      padding: 24px;
      box-sizing: border-box;
      color: var(--chalk);
      background: var(--surface-grain), #101d20;
      font-family: 'Titillium Web', sans-serif;
    }
    .notice {
      max-width: 460px;
      padding: 40px;
      background: #102734;
      border: 1px solid #d4d9c447;
      border-top: 4px solid #ff795e;
    }
    .eyebrow {
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 1.5px;
      color: #ff957e;
    }
    h1 {
      font-size: 36px;
      line-height: 1.05;
      margin: 12px 0 14px;
      font-weight: 900;
      font-style: italic;
      text-transform: uppercase;
    }
    p {
      color: #d5d9c6;
      line-height: 1.6;
      overflow-wrap: anywhere;
    }
    .actions {
      display: flex;
      gap: 18px;
      align-items: center;
      margin-top: 24px;
      flex-wrap: wrap;
    }
    .primary-button {
      border-radius: 999px;
      background: var(--rugby-button);
      color: var(--rugby-ink);
      border: 1px solid var(--rugby-teal);
      min-height: 44px;
      padding: 10px 18px;
      font: inherit;
      font-weight: 700;
      cursor: pointer;
    }
    .text-button {
      background: none;
      border: 0;
      color: #ffd18d;
      font: inherit;
      font-weight: 700;
      min-height: 44px;
      cursor: pointer;
    }
    @media (max-width: 400px) {
      .notice {
        padding: 26px 18px;
      }
      h1 {
        font-size: 30px;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotAMemberPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly league = inject(LeagueData);
  readonly email = this.auth.email;
  readonly error = this.league.error;
  readonly busy = signal(false);

  async retry(): Promise<void> {
    this.busy.set(true);
    try {
      if (this.league instanceof HttpLeagueData) {
        this.league.clear();
        if ((await this.league.ensureLoaded()) === 'member') await this.router.navigateByUrl('/');
      }
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
}
