import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { HttpLeagueData } from '../../core/league/http-league-data';
import { LeagueData } from '../../core/league/league-data';
import { UnclaimedName } from '../../core/league/league.models';
import { BallLoader } from '../../shared/ball-loader/ball-loader';
import { Loader } from '../../shared/loader/loader';

/**
 * First sign-in: the member picks their own Superbru name from the names nobody has
 * claimed. The API binds it to this account once; the captain can release a wrong claim.
 */
@Component({
  selector: 'app-claim-page',
  templateUrl: './claim.page.html',
  styleUrl: './claim.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BallLoader, Loader],
})
export class ClaimPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly league = inject(LeagueData);
  readonly email = this.auth.email;
  readonly names = signal<readonly UnclaimedName[] | null>(null);
  readonly chosen = signal<string | null>(null);
  readonly confirming = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly chosenName = computed(
    () => this.names()?.find((n) => n.id === this.chosen())?.displayName ?? '',
  );

  constructor() {
    void this.load();
  }

  async load(): Promise<void> {
    this.error.set('');
    if (!(this.league instanceof HttpLeagueData)) return;
    try {
      this.names.set(await this.league.unclaimedNames());
    } catch (error) {
      this.names.set([]);
      this.error.set(
        error instanceof Error ? error.message : 'The team sheet could not be loaded.',
      );
    }
  }

  choose(id: string): void {
    this.chosen.set(id);
    this.confirming.set(false);
    this.error.set('');
  }

  async claim(): Promise<void> {
    const id = this.chosen();
    if (!id || this.busy() || !(this.league instanceof HttpLeagueData)) return;
    if (!this.confirming()) {
      this.confirming.set(true);
      return;
    }
    this.busy.set(true);
    this.error.set('');
    try {
      await this.league.claim(id);
      await this.router.navigateByUrl('/');
    } catch (error) {
      // Refresh first: the list drops a name someone else took, then the reason is shown.
      this.confirming.set(false);
      this.chosen.set(null);
      await this.load();
      this.error.set(error instanceof Error ? error.message : 'That name could not be claimed.');
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
