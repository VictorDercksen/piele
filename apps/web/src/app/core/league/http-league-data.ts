import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { jpegBlob, jpegDataUrl } from '../profile/profile-photo';
import type { Profile } from '../profile/profile.store';
import { LeagueData } from './league-data';
import {
  Duty,
  EvidenceSubmission,
  FeedItem,
  LeagueMember,
  MemberMarks,
  NewDuty,
  NewMember,
  Poll,
  UnclaimedName,
  RoundNote,
  RoundStanding,
} from './league.models';

interface Me {
  readonly memberId: string;
  readonly displayName: string;
  readonly isCaptain: boolean;
  readonly leagueName: string;
  readonly seasonName: string;
  readonly inSeason: boolean;
  readonly favouriteTeamId: string | null;
  /** Short-lived signed Storage URL, downloaded straight away. */
  readonly photoUrl: string | null;
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
}

interface ApiDuty extends Omit<Duty, 'roundId'> {
  readonly roundNumber: number | null;
}

interface ApiFeedItem extends Omit<FeedItem, 'roundId'> {
  readonly roundNumber: number | null;
}

interface UploadGrant {
  readonly assetId: string;
  readonly bucket: string;
  readonly path: string;
  readonly token: string;
}

export type MembershipState = 'unknown' | 'loading' | 'member' | 'not_member' | 'error';

/** League records from the Python API. Every call carries the member's access token. */
@Injectable({ providedIn: 'root' })
export class HttpLeagueData extends LeagueData {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly base = `${environment.apiUrl}/v1`;
  readonly source = 'api';
  readonly membership = signal<MembershipState>('unknown');
  private readonly me = signal<Me | null>(null);
  readonly currentMemberId = computed(() => this.me()?.memberId ?? null);
  readonly currentMemberName = computed(() => this.me()?.displayName ?? null);
  readonly captainMemberId = computed(() => {
    const me = this.me();
    return me?.isCaptain ? me.memberId : null;
  });
  readonly leagueName = computed(() => this.me()?.leagueName ?? null);
  private readonly photo = signal<string | null>(null);
  /** The member's saved profile; null until they have chosen a favourite team. */
  readonly profile = computed<Profile | null>(() => {
    const me = this.me();
    return me?.favouriteTeamId
      ? { displayName: me.displayName, teamId: me.favouriteTeamId, photo: this.photo() }
      : null;
  });
  private readonly memberRecords = signal<readonly LeagueMember[]>([]);
  readonly members = this.memberRecords.asReadonly();
  /** Superbru standings arrive with the sync; nothing is published before then. */
  readonly standings = signal<readonly RoundStanding[]>([]).asReadonly();
  private readonly markRecords = signal<readonly MemberMarks[]>([]);
  readonly marks = this.markRecords.asReadonly();
  private readonly dutyRecords = signal<readonly Duty[]>([]);
  readonly duties = this.dutyRecords.asReadonly();
  readonly polls = signal<readonly Poll[]>([]).asReadonly();
  readonly notes = signal<readonly RoundNote[]>([]).asReadonly();
  private readonly feedRecords = signal<readonly FeedItem[]>([]);
  readonly feed = this.feedRecords.asReadonly();
  private readonly loadingState = signal(false);
  readonly loading = this.loadingState.asReadonly();
  private readonly errorState = signal<string | null>(null);
  readonly error = this.errorState.asReadonly();
  private pending: Promise<MembershipState> | null = null;

  /** Resolves the membership state, loading league records on first success. */
  ensureLoaded(): Promise<MembershipState> {
    const state = this.membership();
    if (state === 'member') return Promise.resolve(state);
    if (this.pending) return this.pending;
    this.pending = this.load().finally(() => (this.pending = null));
    return this.pending;
  }

  reload(): void {
    if (this.membership() === 'member') void this.refresh();
    else void this.ensureLoaded();
  }

  /** Forgets everything member-specific, e.g. on sign-out. */
  clear(): void {
    this.membership.set('unknown');
    this.me.set(null);
    this.photo.set(null);
    this.memberRecords.set([]);
    this.markRecords.set([]);
    this.dutyRecords.set([]);
    this.feedRecords.set([]);
    this.errorState.set(null);
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

  /** Superbru names nobody has claimed yet, for a signed-in account without one. */
  unclaimedNames(): Promise<UnclaimedName[]> {
    return this.request<UnclaimedName[]>('GET', '/memberships/unclaimed');
  }

  /** Claims a name for this account, then loads the league as that member. */
  async claim(memberId: string): Promise<void> {
    const me = await this.request<Me>('POST', '/memberships/claim', { memberId });
    this.me.set(me);
    await Promise.all([this.refresh(), this.loadPhoto(me.photoUrl)]);
    this.membership.set('member');
  }

  castVote(): Promise<void> {
    return Promise.reject(new Error('Voting is not available yet.'));
  }

  /**
   * Saves the favourite team and photo to the member's account. A new photo goes straight to
   * private Storage with an API-issued grant; null removes the photo.
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
    this.me.set(me);
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

  private async load(): Promise<MembershipState> {
    this.membership.set('loading');
    this.loadingState.set(true);
    try {
      const me = await this.request<Me>('GET', '/me');
      this.me.set(me);
      await Promise.all([this.refresh(), this.loadPhoto(me.photoUrl)]);
      this.membership.set('member');
    } catch (error) {
      const status = error instanceof ApiError ? error.status : 0;
      this.membership.set(status === 403 ? 'not_member' : 'error');
      this.errorState.set(status === 403 ? null : describe(error));
    } finally {
      this.loadingState.set(false);
    }
    return this.membership();
  }

  private async refresh(): Promise<void> {
    const [members, duties, marks, feed] = await Promise.all([
      this.request<ApiMember[]>('GET', '/members'),
      this.request<ApiDuty[]>('GET', '/duties'),
      this.request<MemberMarks[]>('GET', '/marks'),
      this.request<ApiFeedItem[]>('GET', '/feed?limit=200'),
    ]);
    this.memberRecords.set(
      members.map((m) => ({
        id: m.id,
        name: m.displayName,
        fullName: m.fullName,
        initials: m.displayName.slice(0, 2).toUpperCase(),
        teamId: '',
        claimed: m.claimed,
        inSeason: m.inSeason,
        email: m.email,
      })),
    );
    this.dutyRecords.set(duties.map(({ roundNumber, ...duty }) => ({ ...duty, roundId: roundNumber })));
    this.markRecords.set(marks);
    this.feedRecords.set(feed.map(({ roundNumber, ...item }) => ({ ...item, roundId: roundNumber })));
    this.errorState.set(null);
  }

  private async request<T>(method: 'GET' | 'POST' | 'PUT' | 'PATCH', path: string, body?: unknown): Promise<T> {
    try {
      return await firstValueFrom(
        this.http.request<T>(method, `${this.base}${path}`, { body }),
      );
    } catch (error) {
      throw toApiError(error);
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

function toApiError(error: unknown): ApiError {
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
