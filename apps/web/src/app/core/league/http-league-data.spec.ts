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
  function flushRecords(http: HttpTestingController, standings: unknown[] = [], base = API) {
    http.expectOne(`${base}/standings`).flush(standings);
    for (const path of ['/members', '/duties', '/marks', '/feed?limit=200'])
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
    flushRecords(http);
    expect(await loaded).toBe('member');
    expect(league.isMember()).toBe(false);
    expect(league.profile()).toBeNull();
    expect(league.currentMemberName()).toBe('Admin');
  });
});
