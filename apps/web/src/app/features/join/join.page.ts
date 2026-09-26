import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideArrowRight } from '@ng-icons/lucide';
import { AuthService } from '../../core/auth/auth.service';
import { ApiError } from '../../core/league/http-league-data';
import { JoinService } from '../../core/league/join.service';
import { LeagueContext } from '../../core/league/league-context';
import { JoinPreview } from '../../core/league/league.models';
import { BallLoader } from '../../shared/ball-loader/ball-loader';
import { LeagueCrest } from '../../shared/league-crest/league-crest';
import { Loader } from '../../shared/loader/loader';

/**
 * A league's join link, `/join/:code`: the league's name and emblem and the Superbru names
 * nobody has claimed there. The member picks their own with two taps; the API binds it to
 * this account once, and the captain can release a wrong claim.
 */
@Component({
  selector: 'app-join-page',
  templateUrl: './join.page.html',
  styleUrl: './join.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, NgIcon, BallLoader, LeagueCrest, Loader],
  viewProviders: [provideIcons({ lucideArrowRight })],
})
export class JoinPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly joins = inject(JoinService);
  private readonly context = inject(LeagueContext);
  private readonly code = inject(ActivatedRoute).snapshot.paramMap.get('code') ?? '';
  readonly email = this.auth.email;
  readonly canSignOut = this.auth.configured;
  readonly preview = signal<JoinPreview | null>(null);
  /** The link itself is unusable: unknown, or joining needs the API. */
  readonly invalid = signal('');
  readonly chosen = signal<string | null>(null);
  readonly confirming = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly league = computed(() => this.preview()?.league ?? null);
  readonly names = computed(() => this.preview()?.unclaimed ?? null);
  readonly chosenName = computed(
    () => this.names()?.find((n) => n.id === this.chosen())?.displayName ?? '',
  );
  readonly leagueLink = computed(() => `/${this.league()?.slug ?? ''}`);

  constructor() {
    void this.load();
  }

  async load(): Promise<void> {
    this.error.set('');
    try {
      this.preview.set(await this.joins.preview(this.code));
    } catch (error) {
      if (error instanceof ApiError && UNUSABLE.includes(error.code))
        this.invalid.set(error.message);
      else
        this.error.set(
          error instanceof Error ? error.message : 'The join link could not be opened.',
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
    const league = this.league();
    if (!id || !league || this.busy()) return;
    if (!this.confirming()) {
      this.confirming.set(true);
      return;
    }
    this.busy.set(true);
    this.error.set('');
    try {
      await this.joins.claim(this.code, id);
      await this.context.reloadAccount();
      await this.router.navigateByUrl(`/${league.slug}`);
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
      await this.context.signOut();
    } finally {
      this.busy.set(false);
    }
  }
}

/** Codes for a link that will not work however often it is retried. */
const UNUSABLE = ['unknown_join_code', 'unavailable'];
