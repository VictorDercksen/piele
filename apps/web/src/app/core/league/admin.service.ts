import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { DEFAULT_ZONE } from '../competition/league-time';
import { COMPETITIONS } from '../competition/registry';
import {
  AdminLeague,
  CaptainCandidate,
  CompetitionOption,
  LeagueUpdate,
  NewLeague,
} from './admin.models';
import { isAccentColour, isEmblemPreset } from './emblems';
import { ApiError, leagueBase, toApiError } from './http-league-data';
import { LeagueContext } from './league-context';
import { LeagueData } from './league-data';
import { LeagueMember } from './league.models';
import { slugProblem } from './league-slugs';
import { SampleLeague, SampleLeagueData } from './sample-league-data';
import { SAMPLE_ME, feedItem, memberRecord } from './sample-leagues';

/**
 * The management centre's data (`/manage`, the admin only): every league, archived included,
 * and the admin's actions on them. `HttpAdminService` calls `/v1/admin/...`, which answers
 * 403 `admin_only` to anyone else; the sample build acts on its in-memory sample leagues.
 * After each change the account is read again, so the league switcher follows at once.
 */
@Injectable({
  providedIn: 'root',
  useFactory: () =>
    inject(LeagueData) instanceof SampleLeagueData ? new SampleAdminService() : new HttpAdminService(),
})
export abstract class AdminService {
  private readonly context = inject(LeagueContext);
  private readonly state = signal<readonly AdminLeague[]>([]);
  /** Every league: active first, then by name. */
  readonly leagues = this.state.asReadonly();
  private readonly loadingState = signal(false);
  readonly loading = this.loadingState.asReadonly();
  private readonly errorState = signal<string | null>(null);
  /** A safe message when the list could not be loaded. */
  readonly error = this.errorState.asReadonly();
  private competitionList: Promise<readonly CompetitionOption[]> | null = null;

  /** Loads the league list. */
  async load(): Promise<void> {
    this.loadingState.set(true);
    this.errorState.set(null);
    try {
      this.state.set(ordered(await this.listLeagues()));
    } catch (error) {
      this.errorState.set(toApiError(error).message);
    } finally {
      this.loadingState.set(false);
    }
  }

  /** Creates a league in one request; resolves once the switcher lists it. */
  async create(body: NewLeague): Promise<AdminLeague> {
    return this.adopt(await this.guard(() => this.createLeague(body)));
  }

  /** Renames the league, changes its time zone, or archives or restores it. */
  async update(id: string, patch: LeagueUpdate): Promise<AdminLeague> {
    return this.adopt(await this.guard(() => this.updateLeague(id, patch)));
  }

  /** Makes an active, claimed member the league's captain. */
  async appointCaptain(id: string, memberId: string): Promise<AdminLeague> {
    return this.adopt(await this.guard(() => this.postCaptain(id, memberId)));
  }

  /**
   * Adds the admin to the league outside the season, under `name` or the API's default (the
   * admin's name in another league, else "Admin"). Resolves to the membership id.
   */
  async addMe(id: string, name?: string): Promise<string> {
    const memberId = await this.guard(() => this.postMe(id, name));
    try {
      this.state.set(ordered(await this.listLeagues()));
    } catch {
      // The membership exists; the list catches up on the next load.
    }
    await this.context.refreshAccount();
    return memberId;
  }

  /** The competitions a new league can play, loaded once. */
  competitions(): Promise<readonly CompetitionOption[]> {
    if (!this.competitionList) {
      const list = this.guard(() => this.listCompetitions());
      list.catch(() => {
        if (this.competitionList === list) this.competitionList = null;
      });
      this.competitionList = list;
    }
    return this.competitionList;
  }

  /** The league's active, claimed members, who can be appointed captain. */
  captainCandidates(id: string): Promise<readonly CaptainCandidate[]> {
    return this.guard(() => this.listCandidates(id));
  }

  protected abstract listLeagues(): Promise<readonly AdminLeague[]>;
  protected abstract createLeague(body: NewLeague): Promise<AdminLeague>;
  protected abstract updateLeague(id: string, patch: LeagueUpdate): Promise<AdminLeague>;
  protected abstract postCaptain(id: string, memberId: string): Promise<AdminLeague>;
  protected abstract postMe(id: string, name?: string): Promise<string>;
  protected abstract listCompetitions(): Promise<readonly CompetitionOption[]>;
  protected abstract listCandidates(id: string): Promise<readonly CaptainCandidate[]>;

  /** Shows a changed or new league in the list and has the account read again. */
  private async adopt(league: AdminLeague): Promise<AdminLeague> {
    this.state.update((leagues) =>
      ordered([...leagues.filter((l) => l.id !== league.id), league]),
    );
    await this.context.refreshAccount();
    return league;
  }

  /** Every failure as an `ApiError` with the API's code and safe message. */
  private async guard<T>(call: () => Promise<T>): Promise<T> {
    try {
      return await call();
    } catch (error) {
      throw error instanceof ApiError ? error : toApiError(error);
    }
  }
}

/** Active leagues first, then by name, as the API orders them. */
function ordered(leagues: readonly AdminLeague[]): readonly AdminLeague[] {
  return [...leagues].sort(
    (a, b) =>
      Number(a.status === 'archived') - Number(b.status === 'archived') ||
      a.name.localeCompare(b.name),
  );
}

interface ApiMember {
  readonly id: string;
  readonly displayName: string;
  readonly status?: string;
  readonly claimed: boolean;
  readonly leftAt?: string | null;
}

/** The management centre against the Python API. */
export class HttpAdminService extends AdminService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/v1/admin/leagues`;

  protected listLeagues(): Promise<readonly AdminLeague[]> {
    return firstValueFrom(this.http.get<AdminLeague[]>(this.base));
  }

  protected createLeague(body: NewLeague): Promise<AdminLeague> {
    return firstValueFrom(this.http.post<AdminLeague>(this.base, body));
  }

  protected updateLeague(id: string, patch: LeagueUpdate): Promise<AdminLeague> {
    return firstValueFrom(this.http.patch<AdminLeague>(this.league(id), patch));
  }

  protected postCaptain(id: string, memberId: string): Promise<AdminLeague> {
    return firstValueFrom(
      this.http.post<AdminLeague>(`${this.league(id)}/captain`, { membershipId: memberId }),
    );
  }

  protected async postMe(id: string, name?: string): Promise<string> {
    const body = name ? { displayName: name } : {};
    const { memberId } = await firstValueFrom(
      this.http.post<{ memberId: string }>(`${this.league(id)}/members/me`, body),
    );
    return memberId;
  }

  protected listCompetitions(): Promise<readonly CompetitionOption[]> {
    return firstValueFrom(
      this.http.get<CompetitionOption[]>(`${environment.apiUrl}/v1/competitions`),
    );
  }

  /** The league's plain team sheet (`GET /v1/leagues/{id}/members`), which the admin may read. */
  protected async listCandidates(id: string): Promise<readonly CaptainCandidate[]> {
    const members = await firstValueFrom(this.http.get<ApiMember[]>(`${leagueBase(id)}/members`));
    return members
      .filter((m) => m.claimed && (m.status ?? 'active') === 'active' && !m.leftAt)
      .map((m) => ({ id: m.id, displayName: m.displayName }));
  }

  private league(id: string): string {
    return `${this.base}/${encodeURIComponent(id)}`;
  }
}

/**
 * The management centre over the sample leagues, applying the API's rules in memory: a new
 * league joins the sample account (and the switcher), archiving hides one, appointing moves
 * the captaincy. Everything lasts until reload.
 */
export class SampleAdminService extends AdminService {
  private readonly data = inject(LeagueData) as SampleLeagueData;

  protected listLeagues(): Promise<readonly AdminLeague[]> {
    return Promise.resolve(this.data.sampleLeagues().map(view));
  }

  protected createLeague(body: NewLeague): Promise<AdminLeague> {
    const slugIssue = slugProblem(body.slug);
    if (slugIssue) return refuse(422, 'invalid_slug', slugIssue);
    if (this.data.sampleLeagues().some((l) => l.seed.summary.slug === body.slug))
      return refuse(409, 'slug_taken', `Another league already uses ${body.slug}.`);
    const competition = COMPETITIONS.get(body.competitionId);
    if (!competition)
      return refuse(422, 'unknown_competition', `Unknown competition ${body.competitionId}.`);
    const timezone = body.timezone ?? DEFAULT_ZONE;
    if (!knownZone(timezone)) return refuse(422, 'invalid_timezone', `Unknown time zone ${timezone}.`);
    const accent = body.accentColour?.toLowerCase() ?? null;
    if (accent !== null && !isAccentColour(accent))
      return refuse(422, 'invalid_accent_colour', 'Use a colour like #1a2b3c.');
    const preset = body.emblemPreset ?? null;
    if (preset !== null && !isEmblemPreset(preset))
      return refuse(422, 'invalid_emblem', 'Choose one of the preset emblems.');
    const names = body.members.map((m) => m.displayName);
    if (!names.length || new Set(names).size !== names.length)
      return refuse(422, 'duplicate_member', 'Each member needs a different display name.');
    if (!names.includes(body.captainDisplayName))
      return refuse(422, 'unknown_captain', 'The captain must be one of the members.');
    const captainIsMe = body.captainEmail === null;
    if (!captainIsMe && body.addMe && names.includes(ADMIN_NAME))
      return refuse(
        409,
        'duplicate_member',
        `Another member of this league is called ${ADMIN_NAME}. Choose another name.`,
      );

    const id = `sample-league-${body.slug}`;
    const now = new Date().toISOString();
    const members: LeagueMember[] = body.members.map((member, index) => {
      const mine = captainIsMe && member.displayName === body.captainDisplayName;
      return {
        ...memberRecord(mine ? SAMPLE_ME : `member-${body.slug}-${index + 1}`, member.displayName, member.fullName, '', mine),
        email: mine ? null : member.displayName === body.captainDisplayName ? body.captainEmail : null,
      };
    });
    const captainId = members.find((m) => m.name === body.captainDisplayName)!.id;
    const league = this.data.addLeague({
      summary: {
        id,
        slug: body.slug,
        name: body.name,
        timezone,
        emblemPreset: preset,
        emblemUrl: null,
        accentColour: accent,
        competition: { id: competition.id, name: competition.name, shortName: competition.shortName },
        seasonName: body.seasonName,
        inSeason: true,
        memberId: captainIsMe ? SAMPLE_ME : null,
        displayName: null,
        isCaptain: captainIsMe,
        favouriteTeamId: null,
      },
      joinCode: randomCode(),
      captainId,
      createdAt: now,
      members,
      standings: [],
      duties: [],
      polls: [],
      notes: [],
      feed: [
        feedItem(
          `feed-${body.slug}-1`,
          'season_opened',
          null,
          `The ${body.name} is open.`,
          `${members.length} members enrolled. ${body.captainDisplayName} is captain.`,
          now,
          null,
        ),
      ],
    });
    if (!captainIsMe && body.addMe) league.addAdmin(ADMIN_NAME);
    return Promise.resolve(view(league));
  }

  protected updateLeague(id: string, patch: LeagueUpdate): Promise<AdminLeague> {
    const league = this.find(id);
    if (!league) return unknownLeague();
    if (patch.timezone !== undefined && !knownZone(patch.timezone))
      return refuse(422, 'invalid_timezone', `Unknown time zone ${patch.timezone}.`);
    league.update(patch);
    return Promise.resolve(view(league));
  }

  protected postCaptain(id: string, memberId: string): Promise<AdminLeague> {
    const league = this.find(id);
    if (!league || league.status() !== 'active') return unknownLeague();
    const member = league.members().find((m) => m.id === memberId);
    if (!member) return refuse(404, 'unknown_member', 'That member is not on the team sheet.');
    if (!member.claimed)
      return refuse(409, 'not_claimed', 'Only a member who has claimed their name can captain.');
    if (league.captain() === memberId)
      return refuse(409, 'already_captain', `${member.name} is already the captain.`);
    league.appoint(memberId);
    return Promise.resolve(view(league));
  }

  protected postMe(id: string, name?: string): Promise<string> {
    const league = this.find(id);
    if (!league || league.status() !== 'active') return unknownLeague();
    const displayName = name ?? ADMIN_NAME;
    const clash = league
      .members()
      .some((m) => m.id !== SAMPLE_ME && m.name.toLowerCase() === displayName.toLowerCase());
    if (clash && !league.memberId)
      return refuse(
        409,
        'duplicate_member',
        `Another member of this league is called ${displayName}. Choose another name.`,
      );
    league.addAdmin(displayName);
    return Promise.resolve(SAMPLE_ME);
  }

  protected listCompetitions(): Promise<readonly CompetitionOption[]> {
    return Promise.resolve(
      [...COMPETITIONS.values()].map((c) => ({
        id: c.id,
        name: c.name,
        shortName: c.shortName,
        timezone: DEFAULT_ZONE,
        regularRounds: c.regularRounds,
        lastRound: c.lastRound,
      })),
    );
  }

  protected listCandidates(id: string): Promise<readonly CaptainCandidate[]> {
    const league = this.find(id);
    if (!league || league.status() !== 'active') return unknownLeague();
    return Promise.resolve(
      league
        .members()
        .filter((m) => m.claimed)
        .map((m) => ({ id: m.id, displayName: m.name })),
    );
  }

  private find(id: string): SampleLeague | undefined {
    return this.data.sampleLeagues().find((league) => league.seed.summary.id === id);
  }
}

/** The sample account's name in every sample league. */
const ADMIN_NAME = 'You';

/** A sample league as `GET /v1/admin/leagues` describes it. */
function view(league: SampleLeague): AdminLeague {
  const summary = league.summary();
  const members = league.members();
  const captain = members.find((m) => m.id === league.captain());
  return {
    id: summary.id,
    slug: summary.slug,
    name: summary.name,
    timezone: summary.timezone,
    status: league.status(),
    emblemPreset: summary.emblemPreset,
    emblemUrl: summary.emblemUrl,
    accentColour: summary.accentColour,
    joinCode: league.joinCode(),
    competition: summary.competition,
    season: { id: `${summary.id}-season`, name: summary.seasonName, status: 'active' },
    captain: captain
      ? { memberId: captain.id, displayName: captain.name, claimed: captain.claimed }
      : null,
    counts: {
      members: members.length,
      claimed: members.filter((m) => m.claimed).length,
      inSeason: members.filter((m) => m.inSeason).length,
      withdrawn: league.withdrawn().length,
    },
    myMemberId: league.memberId,
    createdAt: league.seed.createdAt ?? '2026-09-18T08:00:00Z',
  };
}

function knownZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

function randomCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function refuse<T>(status: number, code: string, message: string): Promise<T> {
  return Promise.reject(new ApiError(status, code, message));
}

function unknownLeague<T>(): Promise<T> {
  return refuse(404, 'unknown_league', 'That league does not exist.');
}
