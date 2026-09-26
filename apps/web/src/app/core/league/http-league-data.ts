import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Subject, firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { jpegBlob, jpegDataUrl } from '../profile/profile-photo';
import type { Profile } from '../profile/profile.store';
import { LeagueData } from './league-data';
import {
  AppearanceChange,
  CompetitionRef,
  Duty,
  EvidenceSubmission,
  FeedItem,
  LeagueAppearance,
  LeagueMember,
  LeagueSummary,
  MemberMarks,
  NewDuty,
  NewMember,
  NotificationsRead,
  Poll,
  RoundNote,
  RoundStanding,
} from './league.models';

/** The league-scoped `GET /v1/leagues/{leagueId}/me` document. */
export interface Me {
  readonly leagueId: string;
  readonly slug: string;
  readonly leagueName: string;
  readonly timezone: string;
  readonly emblemPreset?: string | null;
  readonly emblemUrl: string | null;
  readonly accentColour: string | null;
  readonly competition: CompetitionRef;
  readonly seasonName: string;
  readonly inSeason: boolean;
  /** Null when the admin views a league it holds no membership in. */
  readonly memberId: string | null;
  readonly displayName: string;
  readonly isCaptain: boolean;
  readonly isAdmin: boolean;
  /** Captain or admin: may use the captain's desk. */
  readonly administers: boolean;
  readonly favouriteTeamId: string | null;
  /** Short-lived signed Storage URL, downloaded straight away. */
  readonly photoUrl: string | null;
  readonly notificationsReadAt?: string | null;
  readonly notificationsReadKeys?: readonly string[];
  /** Only for the steward; null for members or when joining is closed. */
  readonly joinCode?: string | null;
}

/** Where to put an image in private Storage: the photo and emblem grants. */
export interface ImageUploadGrant {
  readonly bucket: string;
  readonly path: string;
  readonly token: string;
}

interface PhotoUploadGrant {
  readonly bucket: string;
  readonly path: string;
  readonly token: string;
}

interface ApiMember {
  readonly id: string;
  readonly displayName: string;
  readonly fullName: string;
  readonly status: string;
  readonly claimed: boolean;
  readonly inSeason: boolean;
  readonly email: string | null;
  readonly leftAt?: string | null;
  readonly withdrawalReason?: string | null;
}

interface ApiDuty extends Omit<Duty, 'roundId'> {
  readonly roundNumber: number | null;
}

interface ApiFeedItem extends Omit<FeedItem, 'roundId'> {
  readonly roundNumber: number | null;
}

interface ApiStanding extends Omit<RoundStanding, 'roundId'> {
  readonly roundNumber: number;
  readonly memberName: string;
}

interface UploadGrant {
  readonly assetId: string;
  readonly bucket: string;
  readonly path: string;
  readonly token: string;
}

export type MembershipState = 'unknown' | 'loading' | 'member' | 'not_member' | 'error';

/**
 * One league's records from the Python API, under `/v1/leagues/{leagueId}`. `LeagueContext`
 * chooses the league; choosing another clears these records and loads that league's. Every
 * call carries the member's access token.
 */
@Injectable({ providedIn: 'root' })
export class HttpLeagueData extends LeagueData {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  readonly source = 'api';
  /** Whether the chosen league's `me` loaded; `not_member` when the API refused it. */
  readonly membership = signal<MembershipState>('unknown');
  private readonly league = signal<string | null>(null);
  /** The league these records belong to. */
  readonly leagueId = this.league.asReadonly();
  /**
   * Emits the league id when the API answers 403 `not_a_member` or 404 `unknown_league` for
   * it, at load or later (a withdrawn membership, an archived league).
   */
  readonly refused = new Subject<string>();
  private readonly me = signal<Me | null>(null);
  readonly currentMemberId = computed(() => this.me()?.memberId ?? null);
  readonly currentMemberName = computed(() => this.me()?.displayName ?? null);
  readonly captainMemberId = computed(() => {
    const me = this.me();
    return me?.isCaptain ? me.memberId : null;
  });
  readonly leagueName = computed(() => this.me()?.leagueName ?? null);
  readonly administers = computed(() => this.me()?.administers ?? false);
  private readonly joinCodeState = signal<string | null>(null);
  readonly joinCode = this.joinCodeState.asReadonly();
  /** False for the admin in a league it holds no membership in. */
  readonly isMember = computed(() => !!this.me()?.memberId);
  private readonly photo = signal<string | null>(null);
  /** The member's saved profile in this league; null until they have chosen a favourite team. */
  readonly profile = computed<Profile | null>(() => {
    const me = this.me();
    return me?.memberId && me.favouriteTeamId
      ? { displayName: me.displayName, teamId: me.favouriteTeamId, photo: this.photo() }
      : null;
  });
  private readonly memberRecords = signal<readonly LeagueMember[]>([]);
  readonly members = this.memberRecords.asReadonly();
  private readonly withdrawnRecords = signal<readonly LeagueMember[]>([]);
  readonly withdrawnMembers = this.withdrawnRecords.asReadonly();
  /** Superbru round points the captain records from the pool results. */
  private readonly standingRecords = signal<readonly RoundStanding[]>([]);
  readonly standings = this.standingRecords.asReadonly();
  private readonly markRecords = signal<readonly MemberMarks[]>([]);
  readonly marks = this.markRecords.asReadonly();
  private readonly dutyRecords = signal<readonly Duty[]>([]);
  readonly duties = this.dutyRecords.asReadonly();
  readonly polls = signal<readonly Poll[]>([]).asReadonly();
  readonly notes = signal<readonly RoundNote[]>([]).asReadonly();
  private readonly feedRecords = signal<readonly FeedItem[]>([]);
  readonly feed = this.feedRecords.asReadonly();
  private readonly read = signal<NotificationsRead>({ readAt: null, readKeys: [] });
  /** Read state from the member's membership, so it follows them between devices. */
  readonly notificationsRead = this.read.asReadonly();
  private readonly loadingState = signal(false);
  readonly loading = this.loadingState.asReadonly();
  private readonly errorState = signal<string | null>(null);
  readonly error = this.errorState.asReadonly();
  private pending: Promise<MembershipState> | null = null;

  selectLeague(league: LeagueSummary): void {
    void this.load(league.id);
  }

  /**
   * Loads a league's `me` and records, clearing another league's first. Resolves to the
   * membership state; a second call for the same league shares the first one's request.
   */
  load(leagueId: string): Promise<MembershipState> {
    if (this.league() === leagueId) return this.ensureLoaded();
    this.clear();
    this.league.set(leagueId);
    return this.ensureLoaded();
  }

  /** Resolves the chosen league's membership state, loading its records on first success. */
  ensureLoaded(): Promise<MembershipState> {
    const leagueId = this.league();
    const state = this.membership();
    if (!leagueId || state === 'member' || state === 'not_member') return Promise.resolve(state);
    if (this.pending) return this.pending;
    const pending = this.fetch(leagueId).finally(() => {
      if (this.pending === pending) this.pending = null;
    });
    this.pending = pending;
    return pending;
  }

  reload(): void {
    if (this.membership() === 'member') void this.refresh();
    else void this.ensureLoaded();
  }

  /** Forgets the league and everything member-specific, e.g. on sign-out. */
  clear(): void {
    this.league.set(null);
    this.pending = null;
    this.membership.set('unknown');
    this.loadingState.set(false);
    this.me.set(null);
    this.photo.set(null);
    this.memberRecords.set([]);
    this.withdrawnRecords.set([]);
    this.joinCodeState.set(null);
    this.standingRecords.set([]);
    this.markRecords.set([]);
    this.dutyRecords.set([]);
    this.feedRecords.set([]);
    this.read.set({ readAt: null, readKeys: [] });
    this.errorState.set(null);
  }

  /** Records this league as the account's last used one, so `/` opens it next time. */
  async markLastUsed(): Promise<void> {
    await this.request('PUT', '/me/last');
  }

  /** The feed alone, for the notifications panel's periodic refresh. */
  async refreshFeed(): Promise<void> {
    if (this.membership() !== 'member') return;
    const feed = await this.request<ApiFeedItem[]>('GET', '/feed?limit=200');
    this.feedRecords.set(feed.map(({ roundNumber, ...item }) => ({ ...item, roundId: roundNumber })));
  }

  /** Saves the read state and adopts what the API merged with other devices' reads. */
  async saveNotificationsRead(read: NotificationsRead): Promise<void> {
    this.read.set(read);
    const merged = await this.request<NotificationsRead>('PUT', '/me/notifications', {
      readAt: read.readAt,
      readKeys: read.readKeys,
    });
    this.read.set({ readAt: merged.readAt ?? null, readKeys: merged.readKeys ?? [] });
  }

  async submitEvidence(submission: EvidenceSubmission): Promise<void> {
    const grant = await this.request<UploadGrant>('POST', '/evidence/uploads', {
      filename: submission.file.name,
      contentType: submission.file.type,
      sizeBytes: submission.file.size,
    });
    const upload = await this.auth
      .storage()
      .from(grant.bucket)
      .uploadToSignedUrl(grant.path, grant.token, submission.file, {
        contentType: submission.file.type,
      });
    if (upload.error) throw new Error('The video upload failed. Check your connection and try again.');
    await this.request('POST', '/evidence', {
      assetId: grant.assetId,
      dutyIds: submission.dutyIds,
      note: submission.note,
      subjectMemberId: submission.subjectMemberId ?? null,
      claimedCompletedAt: submission.claimedCompletedAt ?? null,
    });
    await this.refresh();
  }

  async createDuty(duty: NewDuty): Promise<void> {
    await this.request('POST', '/duties', {
      memberId: duty.memberId,
      type: duty.type,
      roundNumber: duty.roundId,
      deadlineAt: duty.deadlineAt,
      reason: duty.reason,
    });
    await this.refresh();
  }

  async voidDuty(dutyId: string, reason: string): Promise<void> {
    await this.request('POST', `/duties/${dutyId}/void`, { reason });
    await this.refresh();
  }

  async decideEvidence(linkId: string, decision: 'accepted' | 'rejected', reason: string): Promise<void> {
    await this.request('POST', `/evidence/links/${linkId}/decision`, { decision, reason });
    await this.refresh();
  }

  async playbackUrl(assetId: string): Promise<string> {
    const playback = await this.request<{ url: string }>('GET', `/evidence/assets/${assetId}/playback`);
    return playback.url;
  }

  async addMember(member: NewMember): Promise<void> {
    await this.request('POST', '/members', {
      displayName: member.name,
      fullName: member.fullName,
      email: member.email,
    });
    await this.refresh();
  }

  async updateMember(memberId: string, email: string | null): Promise<void> {
    await this.request('PATCH', `/members/${memberId}`, email ? { email } : { clearEmail: true });
    await this.refresh();
  }

  async resetClock(dutyId: string, reason: string): Promise<void> {
    await this.request('POST', `/duties/${dutyId}/reset-clock`, { reason });
    await this.refresh();
  }

  async releaseMember(memberId: string): Promise<void> {
    await this.request('POST', `/members/${memberId}/release`);
    await this.refresh();
  }

  castVote(): Promise<void> {
    return Promise.reject(new Error('Voting is not available yet.'));
  }

  /**
   * The team sheet: `GET /members`, or with `include=withdrawn` for the steward, split into
   * the active and withdrawn lists.
   */
  async loadMembers(includeWithdrawn = this.administers(), leagueId = this.league()): Promise<void> {
    const members = await this.request<ApiMember[]>(
      'GET',
      includeWithdrawn ? '/members?include=withdrawn' : '/members',
      undefined,
      leagueId,
    );
    if (this.league() !== leagueId) return;
    const withdrawn = (m: ApiMember) => m.status === 'withdrawn' || !!m.leftAt;
    this.memberRecords.set(members.filter((m) => !withdrawn(m)).map(toMember));
    this.withdrawnRecords.set(
      members
        .filter(withdrawn)
        .map(toMember)
        .sort((a, b) => (b.leftAt ?? '').localeCompare(a.leftAt ?? '')),
    );
  }

  async withdrawMember(memberId: string, reason: string): Promise<void> {
    await this.request('POST', `/members/${memberId}/withdraw`, { reason });
    await this.refresh();
  }

  async reinstateMember(memberId: string): Promise<void> {
    await this.request('POST', `/members/${memberId}/reinstate`);
    await this.refresh();
  }

  async rotateJoinCode(): Promise<string> {
    const { joinCode } = await this.request<{ joinCode: string }>('POST', '/join-code/rotate');
    this.joinCodeState.set(joinCode);
    return joinCode;
  }

  async closeJoinCode(): Promise<void> {
    await this.request('DELETE', '/join-code');
    this.joinCodeState.set(null);
  }

  /** Where to upload a new emblem: `emblems/{leagueId}/...` in private Storage. */
  emblemUploadGrant(contentType: string, sizeBytes: number): Promise<ImageUploadGrant> {
    return this.request<ImageUploadGrant>('POST', '/emblem/uploads', { contentType, sizeBytes });
  }

  /**
   * Saves the emblem and accent colour through `PUT /appearance`. A new image goes straight
   * to private Storage with an API-issued grant first. Removing the emblem clears whichever
   * kind the league has, so one call never names both.
   */
  async saveAppearance(change: AppearanceChange): Promise<LeagueAppearance> {
    const body: Record<string, string | null> = {};
    const emblem = change.emblem;
    if (emblem === null) {
      if (this.me()?.emblemUrl && !this.me()?.emblemPreset) body['emblemPath'] = null;
      else body['emblemPreset'] = null;
    } else if (emblem && 'preset' in emblem) {
      body['emblemPreset'] = emblem.preset;
    } else if (emblem && 'image' in emblem) {
      body['emblemPath'] = await this.uploadEmblem(emblem.image);
    }
    if (change.accentColour !== undefined) body['accentColour'] = change.accentColour;
    const me = await this.request<Me>('PUT', '/appearance', body);
    this.adopt(me);
    return appearanceOf(me);
  }

  private async uploadEmblem(dataUrl: string): Promise<string> {
    const image = jpegBlob(dataUrl);
    const grant = await this.emblemUploadGrant(image.type, image.size);
    const upload = await this.auth
      .storage()
      .from(grant.bucket)
      .uploadToSignedUrl(grant.path, grant.token, image, { contentType: image.type });
    if (upload.error) throw new Error('The emblem upload failed. Check your connection and try again.');
    return grant.path;
  }

  /**
   * Saves the favourite team to this league's membership and the photo to the account. A new
   * photo goes straight to private Storage with an API-issued grant; null removes the photo.
   */
  async saveProfile(teamId: string, photo: string | null): Promise<void> {
    const current = this.photo();
    const change =
      photo && photo !== current
        ? { photoPath: await this.uploadPhoto(photo) }
        : !photo && current
          ? { removePhoto: true }
          : {};
    const me = await this.request<Me>('PUT', '/me/profile', { favouriteTeamId: teamId, ...change });
    this.adopt(me);
    this.photo.set(photo ?? null);
  }

  private async uploadPhoto(dataUrl: string): Promise<string> {
    const photo = jpegBlob(dataUrl);
    const grant = await this.request<PhotoUploadGrant>('POST', '/me/photo/uploads', {
      contentType: photo.type,
      sizeBytes: photo.size,
    });
    const upload = await this.auth
      .storage()
      .from(grant.bucket)
      .uploadToSignedUrl(grant.path, grant.token, photo, { contentType: photo.type });
    if (upload.error) throw new Error('The photo upload failed. Check your connection and try again.');
    return grant.path;
  }

  /** Downloads the saved photo. On failure the member sees their initials instead. */
  private async loadPhoto(url: string | null): Promise<void> {
    if (!url) {
      this.photo.set(null);
      return;
    }
    try {
      const blob = await firstValueFrom(this.http.get(url, { responseType: 'blob' }));
      this.photo.set(await jpegDataUrl(blob));
    } catch {
      this.photo.set(null);
    }
  }

  private async fetch(leagueId: string): Promise<MembershipState> {
    this.membership.set('loading');
    this.loadingState.set(true);
    let state: MembershipState;
    try {
      const me = await this.request<Me>('GET', '/me', undefined, leagueId);
      if (this.league() !== leagueId) return this.membership();
      this.adopt(me);
      await Promise.all([this.refresh(leagueId), this.loadPhoto(me.photoUrl)]);
      state = 'member';
    } catch (error) {
      const refused = isRefusal(error);
      state = refused ? 'not_member' : 'error';
      if (this.league() === leagueId) this.errorState.set(refused ? null : describe(error));
    }
    // A newer league was chosen meanwhile; its own load owns the state.
    if (this.league() !== leagueId) return state;
    this.membership.set(state);
    this.loadingState.set(false);
    return state;
  }

  private adopt(me: Me): void {
    this.me.set(me);
    this.joinCodeState.set(me.administers ? (me.joinCode ?? null) : null);
    this.read.set({ readAt: me.notificationsReadAt ?? null, readKeys: me.notificationsReadKeys ?? [] });
  }

  private async refresh(leagueId = this.league()): Promise<void> {
    if (!leagueId) return;
    const [, standings, duties, marks, feed] = await Promise.all([
      this.loadMembers(this.administers(), leagueId),
      this.request<ApiStanding[]>('GET', '/standings', undefined, leagueId),
      this.request<ApiDuty[]>('GET', '/duties', undefined, leagueId),
      this.request<MemberMarks[]>('GET', '/marks', undefined, leagueId),
      this.request<ApiFeedItem[]>('GET', '/feed?limit=200', undefined, leagueId),
    ]);
    if (this.league() !== leagueId) return;
    this.standingRecords.set(
      standings.map(({ roundNumber, memberId, rank, points }) => ({
        roundId: roundNumber,
        memberId,
        rank,
        points,
      })),
    );
    this.dutyRecords.set(duties.map(({ roundNumber, ...duty }) => ({ ...duty, roundId: roundNumber })));
    this.markRecords.set(marks);
    this.feedRecords.set(feed.map(({ roundNumber, ...item }) => ({ ...item, roundId: roundNumber })));
    this.errorState.set(null);
  }

  private async request<T>(
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    path: string,
    body?: unknown,
    leagueId = this.league(),
  ): Promise<T> {
    if (!leagueId) throw new ApiError(0, 'no_league', 'Choose a league first.');
    try {
      return await firstValueFrom(
        this.http.request<T>(method, `${leagueBase(leagueId)}${path}`, { body }),
      );
    } catch (error) {
      const failure = toApiError(error);
      if (isRefusal(failure)) this.refused.next(leagueId);
      throw failure;
    }
  }
}

/** An API failure with the safe message the API sent, or a generic one. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/** The emblem and accent colour from a league-scoped `me`. */
export function appearanceOf(me: Me): LeagueAppearance {
  return {
    emblemPreset: me.emblemPreset ?? null,
    emblemUrl: me.emblemUrl ?? null,
    accentColour: me.accentColour ?? null,
  };
}

function toMember(m: ApiMember): LeagueMember {
  return {
    id: m.id,
    name: m.displayName,
    fullName: m.fullName,
    initials: m.displayName.slice(0, 2).toUpperCase(),
    teamId: '',
    claimed: m.claimed,
    inSeason: m.inSeason,
    email: m.email,
    leftAt: m.leftAt ?? null,
    withdrawalReason: m.withdrawalReason ?? null,
  };
}

/** The base URL of one league's routes. */
export function leagueBase(leagueId: string): string {
  return `${environment.apiUrl}/v1/leagues/${encodeURIComponent(leagueId)}`;
}

/** The API does not let this account into the league, or the league is gone. */
function isRefusal(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    ((error.status === 403 && error.code === 'not_a_member') ||
      (error.status === 404 && error.code === 'unknown_league'))
  );
}

export function toApiError(error: unknown): ApiError {
  if (error instanceof HttpErrorResponse) {
    const detail: unknown = error.error?.detail;
    if (detail && typeof detail === 'object' && 'message' in detail) {
      const { code, message } = detail as { code?: string; message?: string };
      return new ApiError(error.status, code ?? 'error', message ?? 'The league could not do that.');
    }
    if (Array.isArray(detail) && detail[0]?.msg) return new ApiError(error.status, 'validation', String(detail[0].msg));
    if (error.status === 0) return new ApiError(0, 'offline', 'The league is unreachable. Check your connection.');
    if (error.status === 401) return new ApiError(401, 'unauthenticated', 'Your session has expired. Sign in again.');
    return new ApiError(error.status, 'error', 'The league could not do that right now.');
  }
  return new ApiError(0, 'error', error instanceof Error ? error.message : 'Something went wrong.');
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : 'The league could not be loaded.';
}
