import { Service, computed, inject, signal } from '@angular/core';
import { AuthService } from '../auth/auth.service';
import { CompetitionService } from '../competition/competition.service';
import { HttpLeagueData } from '../league/data/http-league-data';
import { LeagueData } from '../league/data/league-data';
import { LeagueContext } from '../league/league-context';
import { readAccount, readLegacy, readLocal } from './profile-storage';
import { Profile } from './profile.models';

/**
 * The member's display name, favourite team and photo. The favourite team belongs to the
 * membership, so each league has its own; the photo belongs to the account. Builds that talk
 * to the API read it from the league's `me/profile` route, so it follows the member to
 * every device. Sample and offline builds have no account and keep it in this browser, the
 * team under the league's slug.
 */
@Service()
export class ProfileService {
  private readonly auth = inject(AuthService);
  private readonly league = inject(LeagueData);
  private readonly context = inject(LeagueContext);
  private readonly competition = inject(CompetitionService);
  private readonly api = this.league instanceof HttpLeagueData ? this.league : null;
  /** True when changes are saved to the league account rather than this browser. */
  readonly persisted = !!this.api;
  /** Bumped after a browser save so `local` reads storage again. */
  private readonly saves = signal(0);
  private readonly local = computed<Profile | null>(() => {
    this.saves();
    const slug = this.context.slug();
    return this.api || !slug ? null : readLocal(slug, this.competition.current());
  });
  /** The profile in the current league; null until a favourite team is chosen there. */
  readonly profile = computed(() => (this.api ? this.api.profile() : this.local()));
  readonly team = computed(() => this.competition.current().team(this.profile()?.teamId));
  readonly initials = computed(() =>
    (this.profile()?.displayName ?? 'You')
      .split(/\s+/)
      .slice(0, 2)
      .map((word) => word[0])
      .join('')
      .toUpperCase(),
  );

  /**
   * What onboarding starts from when this league has no profile yet: in API builds a
   * profile this browser kept before profiles moved to the account, otherwise the name and
   * photo this browser keeps for every league.
   */
  earlier(): Partial<Profile> | null {
    if (this.api) return readLegacy(this.competition.current());
    return readAccount();
  }

  /**
   * Resolves once the profile is known. False when it cannot be (signed out, not let into
   * the league, or the admin in a league it holds no membership in), which the sign-in and
   * league guards handle.
   */
  async whenKnown(): Promise<boolean> {
    // The sample admin in the league it holds no membership in has no profile to wait for.
    if (!this.api) return !this.context.current() || this.context.isMemberOfCurrent();
    await this.auth.whenReady();
    if (!this.auth.signedIn()) return false;
    return (await this.api.ensureLoaded()) === 'member' && this.api.isMember();
  }

  /** For `ProfileControlService` only: reads the browser-kept profile again after a save. */
  storedChanged(): void {
    this.saves.update((n) => n + 1);
  }
}
