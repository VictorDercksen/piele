import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { HttpLeagueData } from './http-league-data';

const API = `${environment.apiUrl}/v1`;
const PHOTO_URL = 'https://storage.test/avatars/u-1/old.jpg?token=t';
// The smallest byte run the photo check accepts as a JPEG.
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
const NEW_PHOTO = 'data:image/jpeg;base64,/9j/4AAQ';

const me = (profile: { favouriteTeamId: string | null; photoUrl: string | null }) => ({
  memberId: 'm-1',
  displayName: 'Trokkie',
  isCaptain: false,
  leagueName: 'Piele',
  seasonName: 'URC 2026/27',
  inSeason: true,
  ...profile,
});

describe('HttpLeagueData profile', () => {
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
  function flushRecords(http: HttpTestingController, standings: unknown[] = []) {
    http.expectOne(`${API}/standings`).flush(standings);
    for (const path of ['/members', '/duties', '/marks', '/feed?limit=200'])
      http.expectOne(`${API}${path}`).flush([]);
  }

  async function settle() {
    for (let i = 0; i < 5; i++) await new Promise((resolve) => setTimeout(resolve));
  }

  it('loads the saved team and downloads the photo on sign-in', async () => {
    const { league, http } = setup();
    const loaded = league.ensureLoaded();
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
    const loaded = league.ensureLoaded();
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
    const loaded = league.ensureLoaded();
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
    const loaded = league.ensureLoaded();
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
});
