import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { Competition } from '../competition/competition.models';
import { CompetitionService } from '../competition/competition.service';
import { DEFAULT_ZONE, LeagueTime } from '../competition/league-time';
import { COMPETITIONS, DEFAULT_COMPETITION_ID, competition } from '../competition/registry';
import { HttpLeagueData, toApiError } from './http-league-data';
import { LeagueData } from './league-data';
import { Account, AppearanceChange, LeagueAppearance, LeagueSummary } from './league.models';
import { SampleLeagueData } from './sample-league-data';

/**
 * The signed-in account, the leagues it can open and the league being shown. The router's
 * `leagueRequired` guard calls `select` with the slug in the URL; everything league-specific
 * (records, competition, display zone) follows `current`.
 *
 * Builds with the API read the account from `GET /v1/me`. The sample build uses the local
 * sample account (`SampleLeagueData.account()`, the admin unless the first page carried
 * `?sampleAdmin=0`); builds with neither have one local league.
 */
@Injectable({ providedIn: 'root' })
export class LeagueContext {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly data = inject(LeagueData);
  private readonly competitions = inject(CompetitionService);
  private readonly time = inject(LeagueTime);
  private readonly api = this.data instanceof HttpLeagueData ? this.data : null;

  private readonly accountState = signal<Account | null>(null);
  /** The account document, null until `ensureAccount` has loaded it. */
  readonly account = this.accountState.asReadonly();
  private readonly accountErrorState = signal<string | null>(null);
  /** A safe message when the account could not be loaded. */
  readonly accountError = this.accountErrorState.asReadonly();
  /** Leagues the account may open, by name. The admin's list includes leagues it is not in. */
  readonly leagues = computed(() => this.account()?.leagues ?? []);
  private readonly currentState = signal<LeagueSummary | null>(null);
  /** The league in the URL, once the guard has accepted it. */
  readonly current = this.currentState.asReadonly();
  readonly slug = computed(() => this.current()?.slug ?? null);
  /** The league's name, or the product's before a league is chosen. */
  readonly name = computed(() => this.current()?.name ?? 'The Pavilion');
  readonly isAdmin = computed(() => this.account()?.isAdmin ?? false);
  /** False when the admin views a league it holds no membership in. */
  readonly isMemberOfCurrent = computed(() => !!this.current()?.memberId);
  /** The current league's competition from the registry. */
  readonly competition = computed(() => competitionOf(this.current()));

  /** Leagues the API refused this session (403 `not_a_member`, 404 `unknown_league`). */
  private readonly refused = new Set<string>();
  private pending: Promise<Account | null> | null = null;

  constructor() {
    this.api?.refused.pipe(takeUntilDestroyed()).subscribe({
      next: (leagueId) => this.onRefused(leagueId),
    });
  }

  /** Loads the account once per session. Resolves to null when it could not be loaded. */
  ensureAccount(): Promise<Account | null> {
    const account = this.account();
    if (account) return Promise.resolve(account);
    if (!this.pending) {
      const pending = this.loadAccount().finally(() => {
        if (this.pending === pending) this.pending = null;
      });
      this.pending = pending;
    }
    return this.pending;
  }

  /** Loads the account again, e.g. after joining a league. */
  reloadAccount(): Promise<Account | null> {
    this.accountState.set(null);
    this.refused.clear();
    this.pending = null;
    return this.ensureAccount();
  }

  /** The listed league with this slug. */
  find(slug: string | null | undefined): LeagueSummary | undefined {
    return this.leagues().find((league) => league.slug === slug);
  }

  /**
   * The league `/` opens: the last used one while it is still listed, else the first the
   * account is a member of, else (for the admin without memberships) the first listed.
   * Null sends the account to `/no-league`.
   */
  home(): LeagueSummary | null {
    const leagues = this.leagues().filter((league) => !this.refused.has(league.id));
    const lastId = this.account()?.lastLeagueId;
    return (
      leagues.find((league) => league.id === lastId) ??
      leagues.find((league) => !!league.memberId) ??
      (this.isAdmin() ? (leagues[0] ?? null) : null)
    );
  }

  /**
   * Shows the league with this slug: sets `current`, the competition and the display zone,
   * points the league records at it and records it as the last used league. Resolves false
   * when the slug is not listed or the API refuses the league; the caller redirects to `/`.
   */
  async select(slug: string): Promise<boolean> {
    const league = this.find(slug);
    if (!league || this.refused.has(league.id)) return false;
    this.currentState.set(league);
    this.competitions.current.set(competitionOf(league));
    this.time.zone.set(validZone(league.timezone));
    this.data.selectLeague(league);
    if (this.api) {
      const state = await this.api.ensureLoaded();
      if (state === 'not_member') {
        this.refused.add(league.id);
        return false;
      }
      // An error (offline, 500) still opens the league; the shell shows it with a retry.
      if (state !== 'member') return true;
    }
    this.markLastUsed(league);
    return true;
  }

  /**
   * Saves the current league's emblem and accent colour. The shell's crest follows the
   * answer straight away; API builds then reload the account so every listed league is fresh.
   */
  async saveAppearance(change: AppearanceChange): Promise<LeagueAppearance> {
    const appearance = await this.data.saveAppearance(change);
    const current = this.current();
    if (current) this.patch(current.id, appearance);
    if (this.api) void this.refreshAccount();
    return appearance;
  }

  /**
   * Reads the account again in place (no sign of loading), keeping the current league, e.g.
   * after the management centre made, renamed or archived a league.
   */
  async refreshAccount(): Promise<void> {
    const sample = this.data instanceof SampleLeagueData ? this.data : null;
    if (!this.api && !sample) return;
    try {
      const account = sample
        ? sample.account()
        : await firstValueFrom(this.http.get<Account>(`${environment.apiUrl}/v1/me`));
      this.accountState.set(account);
      const current = this.current();
      const listed = current && account.leagues.find((league) => league.id === current.id);
      if (listed) this.currentState.set(listed);
    } catch {
      // The saved change already shows; the list catches up on the next load.
    }
  }

  /** Forgets the account and league, e.g. on sign-out. */
  clear(): void {
    this.accountState.set(null);
    this.accountErrorState.set(null);
    this.currentState.set(null);
    this.refused.clear();
    this.pending = null;
    this.api?.clear();
  }

  /** Signs out, forgets everything account-specific and returns to the sign-in page. */
  async signOut(): Promise<void> {
    await this.auth.signOut();
    this.clear();
    await this.router.navigateByUrl('/sign-in');
  }

  /**
   * An in-app path in the current league (or the league with `slug`): `/duties` becomes
   * `/piele/duties`, `/` `/piele`.
   */
  url(path = '/', slug = this.slug()): string {
    const rest = path === '/' || path === '' ? '' : path.startsWith('/') ? path : `/${path}`;
    return slug ? `/${slug}${rest}` : rest || '/';
  }

  /** The path after the league slug: `/piele/match/1?round=2` gives `/match/1`. */
  within(url: string): string {
    const path = url.split(/[?#]/)[0];
    const slug = this.slug();
    if (!slug) return path;
    const prefix = `/${slug}`;
    if (path === prefix || path === `${prefix}/`) return '/';
    return path.startsWith(`${prefix}/`) ? path.slice(prefix.length) : path;
  }

  private async loadAccount(): Promise<Account | null> {
    this.accountErrorState.set(null);
    try {
      const account = this.api
        ? await firstValueFrom(this.http.get<Account>(`${environment.apiUrl}/v1/me`))
        : this.data instanceof SampleLeagueData
          ? this.data.account()
          : LOCAL_ACCOUNT;
      this.accountState.set(account);
      return account;
    } catch (error) {
      this.accountErrorState.set(toApiError(error).message);
      return null;
    }
  }

  /** Shows a league's new look in `current` and the account list. */
  private patch(leagueId: string, appearance: LeagueAppearance): void {
    const current = this.current();
    if (current?.id === leagueId) this.currentState.set({ ...current, ...appearance });
    const account = this.account();
    if (account)
      this.accountState.set({
        ...account,
        leagues: account.leagues.map((league) =>
          league.id === leagueId ? { ...league, ...appearance } : league,
        ),
      });
  }

  /** Remembers the league for `/`; the API keeps it on the account. */
  private markLastUsed(league: LeagueSummary): void {
    const account = this.account();
    if (!account || account.lastLeagueId === league.id) return;
    this.accountState.set({ ...account, lastLeagueId: league.id });
    // A failed write only means `/` may open another league next session.
    this.api?.markLastUsed().catch(() => undefined);
  }

  /** The API refused a league mid-session: leave it for `/`, which picks another. */
  private onRefused(leagueId: string): void {
    this.refused.add(leagueId);
    const current = this.current();
    if (current?.id !== leagueId) return;
    // During the guard's own load the URL is still the previous page; the guard redirects.
    const path = this.router.url.split(/[?#]/)[0];
    if (path === `/${current.slug}` || path.startsWith(`/${current.slug}/`))
      void this.router.navigateByUrl('/');
  }
}

/** The registered competition a league plays; an unknown id shows the default competition. */
function competitionOf(league: LeagueSummary | null): Competition {
  return COMPETITIONS.get(league?.competition.id ?? '') ?? competition(DEFAULT_COMPETITION_ID);
}

/** The league's IANA zone when this browser knows it, else the default. */
function validZone(zone: string): string {
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: zone });
    return zone;
  } catch {
    return DEFAULT_ZONE;
  }
}

const DEFAULT_COMPETITION = competition(DEFAULT_COMPETITION_ID);

/** Builds with neither the API nor sample data show the first league with no records. */
const LOCAL_ACCOUNT: Account = {
  userId: 'local',
  photoUrl: null,
  isAdmin: false,
  lastLeagueId: null,
  leagues: [
    {
      id: 'local-piele',
      slug: 'piele',
      name: 'Piele',
      timezone: DEFAULT_ZONE,
      emblemPreset: null,
      emblemUrl: null,
      accentColour: null,
      competition: {
        id: DEFAULT_COMPETITION.id,
        name: DEFAULT_COMPETITION.name,
        shortName: DEFAULT_COMPETITION.shortName,
      },
      seasonName: `${DEFAULT_COMPETITION.shortName} ${DEFAULT_COMPETITION.season}`,
      inSeason: true,
      // The visitor is this league's only (local) member.
      memberId: 'local',
      displayName: null,
      isCaptain: false,
      favouriteTeamId: null,
    },
  ],
};
