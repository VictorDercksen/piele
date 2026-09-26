import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { HttpLeagueData } from './http-league-data';

const API = `${environment.apiUrl}/v1/leagues/l-1`;
const OTHER = `${environment.apiUrl}/v1/leagues/l-2`;
const PHOTO_URL = 'https://storage.test/avatars/u-1/old.jpg?token=t';
// The smallest byte run the photo check accepts as a JPEG.
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
const NEW_PHOTO = 'data:image/jpeg;base64,/9j/4AAQ';

const me = (profile: { favouriteTeamId: string | null; photoUrl: string | null }) => ({
  leagueId: 'l-1',
  slug: 'piele',
  leagueName: 'Piele',
  timezone: 'Africa/Johannesburg',
  emblemPreset: null,
  emblemUrl: null,
  accentColour: null,
  competition: { id: 'urc-2026-27', name: 'United Rugby Championship 2026/27', shortName: 'URC' },
  seasonName: 'URC 2026/27',
  inSeason: true,
  memberId: 'm-1',
  displayName: 'Trokkie',
  isCaptain: false,
  isAdmin: false,
  administers: false,
  ...profile,
});

describe('HttpLeagueData', () => {
  const uploads: string[] = [];

  function setup() {
    uploads.length = 0;
    const auth = {
      storage: () => ({
        from: () => ({
          uploadToSignedUrl: (path: string) => {
            uploads.push(path);
            return Promise.resolve({ error: null });
          },
        }),
      }),
    };
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: auth },
      ],
    });
    return { league: TestBed.inject(HttpLeagueData), http: TestBed.inject(HttpTestingController) };
  }

  /** Answers the league record requests that follow /me. */
  function flushRecords(
    http: HttpTestingController,
    standings: unknown[] = [],
    base = API,
    members = '/members',
  ) {
    http.expectOne(`${base}/standings`).flush(standings);
    for (const path of [members, '/duties', '/marks', '/feed?limit=200'])
      http.expectOne(`${base}${path}`).flush([]);
  }

  async function settle() {
    for (let i = 0; i < 5; i++) await new Promise((resolve) => setTimeout(resolve));
  }

  it('loads the saved team and downloads the photo on sign-in', async () => {
    const { league, http } = setup();
    const loaded = league.load('l-1');
    http.expectOne(`${API}/me`).flush(me({ favouriteTeamId: 'dhl-stormers', photoUrl: PHOTO_URL }));
    await settle();
    flushRecords(http);
    http.expectOne(PHOTO_URL).flush(new Blob([JPEG]));
    expect(await loaded).toBe('member');
    await settle();
    expect(league.profile()?.teamId).toBe('dhl-stormers');
    expect(league.profile()?.displayName).toBe('Trokkie');
    expect(league.profile()?.photo).toMatch(/^data:image\/jpeg;base64,/);
    http.verify();
  });

  it('loads the Superbru round standings', async () => {
    const { league, http } = setup();
    const loaded = league.load('l-1');
    http.expectOne(`${API}/me`).flush(me({ favouriteTeamId: null, photoUrl: null }));
    await settle();
    flushRecords(http, [
      { roundNumber: 1, memberId: 'm-2', memberName: 'Wolf', rank: 1, points: 5 },
      { roundNumber: 1, memberId: 'm-1', memberName: 'Trokkie', rank: 2, points: 0.5 },
    ]);
    await loaded;
    expect(league.standings()).toEqual([
      { roundId: 1, memberId: 'm-2', rank: 1, points: 5 },
      { roundId: 1, memberId: 'm-1', rank: 2, points: 0.5 },
    ]);
    league.clear();
    expect(league.standings()).toEqual([]);
  });

  it('has no profile until a team is chosen, and shows initials when the photo is not a JPEG', async () => {
    const { league, http } = setup();
    const loaded = league.load('l-1');
    http.expectOne(`${API}/me`).flush(me({ favouriteTeamId: null, photoUrl: PHOTO_URL }));
    await settle();
    flushRecords(http);
    http.expectOne(PHOTO_URL).flush(new Blob(['<svg/>']));
    await loaded;
    expect(league.profile()).toBeNull();

    const saving = league.saveProfile('ospreys', null);
    await settle();
    const put = http.expectOne(`${API}/me/profile`);
    expect(put.request.method).toBe('PUT');
    // No photo was shown, so nothing is removed.
    expect(put.request.body).toEqual({ favouriteTeamId: 'ospreys' });
    put.flush(me({ favouriteTeamId: 'ospreys', photoUrl: PHOTO_URL }));
    await saving;
    expect(league.profile()).toEqual({ displayName: 'Trokkie', teamId: 'ospreys', photo: null });
  });

  it('uploads a new photo to Storage before saving and removes it on request', async () => {
    const { league, http } = setup();
    const loaded = league.load('l-1');
    http.expectOne(`${API}/me`).flush(me({ favouriteTeamId: 'ospreys', photoUrl: null }));
    await settle();
    flushRecords(http);
    await loaded;

    const saving = league.saveProfile('ospreys', NEW_PHOTO);
    await settle();
    const grant = http.expectOne(`${API}/me/photo/uploads`);
    expect(grant.request.body).toEqual({ contentType: 'image/jpeg', sizeBytes: 6 });
    grant.flush({ bucket: 'evidence', path: 'avatars/u-1/new.jpg', token: 'tok' });
    await settle();
    expect(uploads).toEqual(['avatars/u-1/new.jpg']);
    const put = http.expectOne(`${API}/me/profile`);
    expect(put.request.body).toEqual({
      favouriteTeamId: 'ospreys',
      photoPath: 'avatars/u-1/new.jpg',
    });
    put.flush(me({ favouriteTeamId: 'ospreys', photoUrl: PHOTO_URL }));
    await saving;
    expect(league.profile()?.photo).toBe(NEW_PHOTO);

    // Saving again with the same photo keeps it without another upload.
    const again = league.saveProfile('munster-rugby', NEW_PHOTO);
    await settle();
    const keep = http.expectOne(`${API}/me/profile`);
    expect(keep.request.body).toEqual({ favouriteTeamId: 'munster-rugby' });
    keep.flush(me({ favouriteTeamId: 'munster-rugby', photoUrl: PHOTO_URL }));
    await again;

    const removing = league.saveProfile('munster-rugby', null);
    await settle();
    const remove = http.expectOne(`${API}/me/profile`);
    expect(remove.request.body).toEqual({ favouriteTeamId: 'munster-rugby', removePhoto: true });
    remove.flush(me({ favouriteTeamId: 'munster-rugby', photoUrl: null }));
    await removing;
    expect(league.profile()?.photo).toBeNull();
    expect(uploads.length).toBe(1);
    http.verify();
  });

  it('clears one league’s records when another is chosen and loads that one', async () => {
    const { league, http } = setup();
    const first = league.load('l-1');
    http.expectOne(`${API}/me`).flush(me({ favouriteTeamId: 'dhl-stormers', photoUrl: null }));
    await settle();
    flushRecords(http, [{ roundNumber: 1, memberId: 'm-1', memberName: 'Trokkie', rank: 1, points: 5 }]);
    expect(await first).toBe('member');
    expect(league.standings().length).toBe(1);
    // The same league again shares what is loaded.
    expect(await league.load('l-1')).toBe('member');
    http.expectNone(`${API}/me`);

    const second = league.load('l-2');
    expect(league.leagueId()).toBe('l-2');
    expect(league.standings()).toEqual([]);
    expect(league.profile()).toBeNull();
    http
      .expectOne(`${OTHER}/me`)
      .flush({ ...me({ favouriteTeamId: 'ospreys', photoUrl: null }), leagueId: 'l-2', memberId: 'm-9' });
    await settle();
    flushRecords(http, [], OTHER);
    expect(await second).toBe('member');
    expect(league.currentMemberId()).toBe('m-9');
    expect(league.profile()?.teamId).toBe('ospreys');

    const saving = league.markLastUsed();
    const last = http.expectOne(`${OTHER}/me/last`);
    expect(last.request.method).toBe('PUT');
    last.flush(null, { status: 204, statusText: 'No Content' });
    await saving;
    http.verify();
  });

  it('reports a league the API refuses and emits it', async () => {
    const { league, http } = setup();
    const refused: string[] = [];
    league.refused.subscribe({ next: (id) => refused.push(id) });
    const loaded = league.load('l-1');
    http
      .expectOne(`${API}/me`)
      .flush(
        { detail: { code: 'not_a_member', message: 'You are not a member of this league.' } },
        { status: 403, statusText: 'Forbidden' },
      );
    expect(await loaded).toBe('not_member');
    expect(league.error()).toBeNull();
    expect(refused).toEqual(['l-1']);
  });

  it('shows the admin a league without a membership and no profile', async () => {
    const { league, http } = setup();
    const loaded = league.load('l-1');
    http.expectOne(`${API}/me`).flush({
      ...me({ favouriteTeamId: null, photoUrl: null }),
      memberId: null,
      displayName: 'Admin',
      isAdmin: true,
      administers: true,
    });
    await settle();
    flushRecords(http, [], API, '/members?include=withdrawn');
    expect(await loaded).toBe('member');
    expect(league.isMember()).toBe(false);
    expect(league.profile()).toBeNull();
    expect(league.currentMemberName()).toBe('Admin');
  });

  /** A steward's league: the captain's `me` with the join code, and its records. */
  async function loadSteward(
    http: HttpTestingController,
    league: HttpLeagueData,
    members: unknown[] = [],
    extra: Record<string, unknown> = {},
  ) {
    const loaded = league.load('l-1');
    http.expectOne(`${API}/me`).flush({
      ...me({ favouriteTeamId: 'ospreys', photoUrl: null }),
      isCaptain: true,
      administers: true,
      joinCode: '5a3b1e0f9c2d',
      ...extra,
    });
    await settle();
    http.expectOne(`${API}/members?include=withdrawn`).flush(members);
    for (const path of ['/standings', '/duties', '/marks', '/feed?limit=200'])
      http.expectOne(`${API}${path}`).flush([]);
    expect(await loaded).toBe('member');
  }

  /** The records a write reloads, with the steward's team sheet. */
  function flushRefresh(http: HttpTestingController, members: unknown[] = []) {
    http.expectOne(`${API}/members?include=withdrawn`).flush(members);
    for (const path of ['/standings', '/duties', '/marks', '/feed?limit=200'])
      http.expectOne(`${API}${path}`).flush([]);
  }

  const member = (id: string, extra: Record<string, unknown> = {}) => ({
    id,
    displayName: id.toUpperCase(),
    fullName: `Member ${id}`,
    status: 'active',
    claimed: true,
    inSeason: true,
    email: null,
    leftAt: null,
    withdrawalReason: null,
    ...extra,
  });

  it('loads the steward’s team sheet with the withdrawn members and the join code', async () => {
    const { league, http } = setup();
    await loadSteward(http, league, [
      member('m-1'),
      member('m-2'),
      member('m-3', {
        status: 'withdrawn',
        inSeason: false,
        leftAt: '2026-09-20T08:00:00Z',
        withdrawalReason: 'Moved away',
      }),
    ]);
    expect(league.administers()).toBe(true);
    expect(league.joinCode()).toBe('5a3b1e0f9c2d');
    expect(league.members().map((m) => m.id)).toEqual(['m-1', 'm-2']);
    expect(league.withdrawnMembers()).toEqual([
      expect.objectContaining({
        id: 'm-3',
        leftAt: '2026-09-20T08:00:00Z',
        withdrawalReason: 'Moved away',
      }),
    ]);

    // A plain member's team sheet leaves the flag off and has no join code.
    league.clear();
    const plain = league.load('l-1');
    http.expectOne(`${API}/me`).flush({
      ...me({ favouriteTeamId: 'ospreys', photoUrl: null }),
      joinCode: null,
    });
    await settle();
    flushRecords(http);
    await plain;
    expect(league.joinCode()).toBeNull();
    expect(league.withdrawnMembers()).toEqual([]);
    http.verify();
  });

  it('withdraws a member with a reason and reinstates them', async () => {
    const { league, http } = setup();
    await loadSteward(http, league, [member('m-1'), member('m-2')]);

    const withdrawing = league.withdrawMember('m-2', 'Moved to Perth');
    const withdraw = http.expectOne(`${API}/members/m-2/withdraw`);
    expect(withdraw.request.method).toBe('POST');
    expect(withdraw.request.body).toEqual({ reason: 'Moved to Perth' });
    withdraw.flush(null, { status: 204, statusText: 'No Content' });
    await settle();
    flushRefresh(http, [
      member('m-1'),
      member('m-2', { status: 'withdrawn', leftAt: '2026-09-26T10:00:00Z', withdrawalReason: 'Moved to Perth' }),
    ]);
    await withdrawing;
    expect(league.members().map((m) => m.id)).toEqual(['m-1']);
    expect(league.withdrawnMembers().map((m) => m.id)).toEqual(['m-2']);

    const reinstating = league.reinstateMember('m-2');
    const reinstate = http.expectOne(`${API}/members/m-2/reinstate`);
    expect(reinstate.request.method).toBe('POST');
    expect(reinstate.request.body).toBeNull();
    reinstate.flush(null, { status: 204, statusText: 'No Content' });
    await settle();
    flushRefresh(http, [member('m-1'), member('m-2')]);
    await reinstating;
    expect(league.withdrawnMembers()).toEqual([]);
    http.verify();
  });

  it('surfaces the API’s refusal to remove the captain', async () => {
    const { league, http } = setup();
    await loadSteward(http, league);
    const withdrawing = league.withdrawMember('m-1', 'x');
    http
      .expectOne(`${API}/members/m-1/withdraw`)
      .flush(
        { detail: { code: 'captain_membership', message: 'The captain cannot be removed.' } },
        { status: 409, statusText: 'Conflict' },
      );
    await expect(withdrawing).rejects.toMatchObject({
      code: 'captain_membership',
      message: 'The captain cannot be removed.',
    });
    http.verify();
  });

  it('rotates and closes the join code', async () => {
    const { league, http } = setup();
    await loadSteward(http, league);

    const rotating = league.rotateJoinCode();
    const rotate = http.expectOne(`${API}/join-code/rotate`);
    expect(rotate.request.method).toBe('POST');
    expect(rotate.request.body).toBeNull();
    rotate.flush({ joinCode: 'b0e1d2c3a4f5' });
    expect(await rotating).toBe('b0e1d2c3a4f5');
    expect(league.joinCode()).toBe('b0e1d2c3a4f5');

    const closing = league.closeJoinCode();
    const close = http.expectOne(`${API}/join-code`);
    expect(close.request.method).toBe('DELETE');
    close.flush(null, { status: 204, statusText: 'No Content' });
    await closing;
    expect(league.joinCode()).toBeNull();
    http.verify();
  });

  it('saves a preset and accent, uploads an image through a grant and removes the emblem', async () => {
    const { league, http } = setup();
    await loadSteward(http, league);
    const steward = (extra: Record<string, unknown>) => ({
      ...me({ favouriteTeamId: 'ospreys', photoUrl: null }),
      isCaptain: true,
      administers: true,
      joinCode: '5a3b1e0f9c2d',
      ...extra,
    });

    const preset = league.saveAppearance({ emblem: { preset: 'anvil' }, accentColour: '#c8742a' });
    const put = http.expectOne(`${API}/appearance`);
    expect(put.request.method).toBe('PUT');
    expect(put.request.body).toEqual({ emblemPreset: 'anvil', accentColour: '#c8742a' });
    put.flush(steward({ emblemPreset: 'anvil', accentColour: '#c8742a' }));
    expect(await preset).toEqual({ emblemPreset: 'anvil', emblemUrl: null, accentColour: '#c8742a' });

    // Removing a preset clears only the preset field.
    const clearing = league.saveAppearance({ emblem: null });
    const clear = http.expectOne(`${API}/appearance`);
    expect(clear.request.body).toEqual({ emblemPreset: null });
    clear.flush(steward({ emblemPreset: null, accentColour: '#c8742a' }));
    await clearing;

    const uploading = league.saveAppearance({ emblem: { image: NEW_PHOTO } });
    await settle();
    const grant = http.expectOne(`${API}/emblem/uploads`);
    expect(grant.request.method).toBe('POST');
    expect(grant.request.body).toEqual({ contentType: 'image/jpeg', sizeBytes: 6 });
    grant.flush({ bucket: 'evidence', path: 'emblems/l-1/0123456789abcdef0123456789abcdef.jpg', token: 'tok' });
    await settle();
    expect(uploads).toEqual(['emblems/l-1/0123456789abcdef0123456789abcdef.jpg']);
    const save = http.expectOne(`${API}/appearance`);
    expect(save.request.body).toEqual({
      emblemPath: 'emblems/l-1/0123456789abcdef0123456789abcdef.jpg',
    });
    save.flush(steward({ emblemUrl: 'https://storage.test/emblems/l-1/x.jpg?token=t' }));
    expect((await uploading).emblemUrl).toBe('https://storage.test/emblems/l-1/x.jpg?token=t');

    // Removing an upload clears only the path; the accent alone sends only the colour.
    const removing = league.saveAppearance({ emblem: null });
    const remove = http.expectOne(`${API}/appearance`);
    expect(remove.request.body).toEqual({ emblemPath: null });
    remove.flush(steward({}));
    await removing;
    const accent = league.saveAppearance({ accentColour: null });
    const colour = http.expectOne(`${API}/appearance`);
    expect(colour.request.body).toEqual({ accentColour: null });
    colour.flush(steward({}));
    await accent;
    http.verify();
  });
});
