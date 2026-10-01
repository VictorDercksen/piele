import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../../environments/environment';
import { AuthService } from '../../auth/auth.service';
import { HttpLeagueData, KICKOFF_DELAY_MS, SETTLE_DELAY_MS } from './http-league-data';
import { NO_STAND_IN } from './league-data';
import { DEFAULT_RULES } from '../superbru';

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
    for (const path of [
      members,
      '/duties',
      '/marks',
      '/evidence/cases',
      '/feed?limit=200',
      '/picks',
    ])
      http.expectOne(`${base}${path}`).flush([]);
    http.expectOne(`${base}/stand-in-reviewer`).flush(NO_STAND_IN);
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
    flushRecords(http, [
      { roundNumber: 1, memberId: 'm-1', memberName: 'Trokkie', rank: 1, points: 5 },
    ]);
    expect(await first).toBe('member');
    expect(league.standings().length).toBe(1);
    // The same league again shares what is loaded.
    expect(await league.load('l-1')).toBe('member');
    http.expectNone(`${API}/me`);

    const second = league.load('l-2');
    expect(league.leagueId()).toBe('l-2');
    expect(league.standings()).toEqual([]);
    expect(league.profile()).toBeNull();
    http.expectOne(`${OTHER}/me`).flush({
      ...me({ favouriteTeamId: 'ospreys', photoUrl: null }),
      leagueId: 'l-2',
      memberId: 'm-9',
    });
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
    for (const path of [
      '/standings',
      '/duties',
      '/marks',
      '/evidence/cases',
      '/feed?limit=200',
      '/picks',
    ])
      http.expectOne(`${API}${path}`).flush([]);
    http.expectOne(`${API}/stand-in-reviewer`).flush(NO_STAND_IN);
    expect(await loaded).toBe('member');
  }

  /** The records a write reloads, with the steward's team sheet. */
  function flushRefresh(http: HttpTestingController, members: unknown[] = []) {
    http.expectOne(`${API}/members?include=withdrawn`).flush(members);
    for (const path of [
      '/standings',
      '/duties',
      '/marks',
      '/evidence/cases',
      '/feed?limit=200',
      '/picks',
    ])
      http.expectOne(`${API}${path}`).flush([]);
    http.expectOne(`${API}/stand-in-reviewer`).flush(NO_STAND_IN);
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
      member('m-2', {
        status: 'withdrawn',
        leftAt: '2026-09-26T10:00:00Z',
        withdrawalReason: 'Moved to Perth',
      }),
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

    const preset = league.saveAppearance({ emblem: { preset: 'posts' }, accentColour: '#c8742a' });
    const put = http.expectOne(`${API}/appearance`);
    expect(put.request.method).toBe('PUT');
    expect(put.request.body).toEqual({ emblemPreset: 'posts', accentColour: '#c8742a' });
    put.flush(steward({ emblemPreset: 'posts', accentColour: '#c8742a' }));
    expect(await preset).toEqual({
      emblemPreset: 'posts',
      emblemUrl: null,
      accentColour: '#c8742a',
    });

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
    grant.flush({
      bucket: 'evidence',
      path: 'emblems/l-1/0123456789abcdef0123456789abcdef.jpg',
      token: 'tok',
    });
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

  const apiPick = (memberId: string, extra: Record<string, unknown> = {}) => ({
    memberId,
    memberName: memberId.toUpperCase(),
    side: 'home',
    margin: 7,
    isDefault: false,
    dutyId: null,
    ...extra,
  });
  const apiFixture = (fixtureId: string, extra: Record<string, unknown> = {}) => ({
    fixtureId,
    roundNumber: 1,
    kickoffUtc: '2026-09-25T18:45:00Z',
    locked: true,
    result: { homeScore: 20, awayScore: 20, state: 'full_time' },
    myPick: apiPick('m-1'),
    picks: [apiPick('m-1'), apiPick('m-2', { side: 'away', margin: 3 })],
    ...extra,
  });

  it('loads the picks and the rules from the league-scoped me, and forgets them on clear', async () => {
    const { league, http } = setup();
    const loaded = league.load('l-1');
    http.expectOne(`${API}/me`).flush({
      ...me({ favouriteTeamId: null, photoUrl: null }),
      rules: { bonusPointSplit: false, winPoints: { final: 4 }, previousChampionMemberId: 'm-2' },
    });
    await settle();
    http.expectOne(`${API}/standings`).flush([]);
    http.expectOne(`${API}/duties`).flush([
      {
        id: 'd-1',
        memberId: 'm-1',
        roundNumber: 1,
        type: 'pick_confirmation',
        pickFixtureIds: ['292584'],
      },
      { id: 'd-2', memberId: 'm-1', roundNumber: 1, type: 'spoon' },
    ]);
    for (const path of ['/members', '/marks', '/evidence/cases', '/feed?limit=200'])
      http.expectOne(`${API}${path}`).flush([]);
    http.expectOne(`${API}/stand-in-reviewer`).flush(NO_STAND_IN);
    http.expectOne(`${API}/picks`).flush([apiFixture('292584')]);
    await loaded;
    expect(league.picks()).toEqual([
      expect.objectContaining({ fixtureId: '292584', roundId: 1, locked: true }),
    ]);
    expect(league.picks()[0]).not.toHaveProperty('roundNumber');
    expect(league.picks()[0].picks.map((p) => p.memberId)).toEqual(['m-1', 'm-2']);
    expect(league.rules()).toEqual({
      ...DEFAULT_RULES,
      bonusPointSplit: false,
      winPoints: { ...DEFAULT_RULES.winPoints, final: 4 },
      previousChampionMemberId: 'm-2',
    });
    expect(league.duties().map((d) => d.pickFixtureIds)).toEqual([['292584'], []]);
    league.clear();
    expect(league.picks()).toEqual([]);
    expect(league.rules()).toEqual(DEFAULT_RULES);
    http.verify();
  });

  it('saves the member’s own pick and adopts the returned fixture', async () => {
    const { league, http } = setup();
    await loadSteward(http, league);
    const saving = league.savePick('292590', { side: 'away', margin: 12 });
    const put = http.expectOne(`${API}/matches/292590/picks/me`);
    expect(put.request.method).toBe('PUT');
    expect(put.request.body).toEqual({ side: 'away', margin: 12 });
    put.flush(apiFixture('292590', { myPick: apiPick('m-1', { side: 'away', margin: 12 }) }));
    await saving;
    expect(league.picks().map((f) => [f.fixtureId, f.roundId, f.myPick?.margin])).toEqual([
      ['292590', 1, 12],
    ]);

    const late = league.savePick('292590', { side: 'home', margin: 1 });
    http
      .expectOne(`${API}/matches/292590/picks/me`)
      .flush(
        { detail: { code: 'picks_locked', message: 'Picks for this match closed at kickoff.' } },
        { status: 422, statusText: 'Unprocessable Entity' },
      );
    await expect(late).rejects.toMatchObject({ code: 'picks_locked' });
    http.verify();
  });

  it('records and removes picks for the steward', async () => {
    const { league, http } = setup();
    await loadSteward(http, league);
    const recording = league.recordPicks('292584', [
      { memberId: 'm-2', side: 'home', margin: 5, isDefault: true, dutyId: 'd-1' },
      { memberId: 'm-3', side: 'missed', margin: null },
      { memberId: 'm-4', side: 'away', margin: 2, dutyId: null },
    ]);
    const put = http.expectOne(`${API}/matches/292584/picks`);
    expect(put.request.method).toBe('PUT');
    // An omitted dutyId keeps the existing link; an explicit null unlinks it.
    expect(put.request.body).toEqual({
      picks: [
        { memberId: 'm-2', side: 'home', margin: 5, isDefault: true, dutyId: 'd-1' },
        { memberId: 'm-3', side: 'missed', margin: null, isDefault: false },
        { memberId: 'm-4', side: 'away', margin: 2, isDefault: false, dutyId: null },
      ],
    });
    expect(put.request.body.picks[1]).not.toHaveProperty('dutyId');
    put.flush(apiFixture('292584'));
    await recording;
    expect(league.picks().length).toBe(1);

    const removing = league.removePick('292584', 'm-2');
    const remove = http.expectOne(`${API}/matches/292584/picks/m-2`);
    expect(remove.request.method).toBe('DELETE');
    remove.flush(null, { status: 204, statusText: 'No Content' });
    await settle();
    http.expectOne(`${API}/picks`).flush([apiFixture('292584', { picks: [apiPick('m-1')] })]);
    await removing;
    expect(league.picks()[0].picks.map((p) => p.memberId)).toEqual(['m-1']);
    http.verify();
  });

  it('saves the rules and refreshes the feed', async () => {
    const { league, http } = setup();
    await loadSteward(http, league);
    const saving = league.saveRules({ bonusPoint: false });
    const put = http.expectOne(`${API}/rules`);
    expect(put.request.method).toBe('PUT');
    expect(put.request.body).toEqual({ bonusPoint: false });
    put.flush({ ...DEFAULT_RULES, bonusPoint: false });
    await settle();
    http
      .expectOne(`${API}/feed?limit=200`)
      .flush([
        { id: 'f-1', kind: 'rules_updated', roundNumber: null, title: 'Superbru rules updated.' },
      ]);
    await saving;
    expect(league.rules().bonusPoint).toBe(false);
    expect(league.feed()[0].kind).toBe('rules_updated');
    http.verify();
  });

  it('reloads the picks when the starting round changes', async () => {
    const { league, http } = setup();
    await loadSteward(http, league);
    const saving = league.saveRules({ startingRound: 1 });
    http.expectOne(`${API}/rules`).flush({ ...DEFAULT_RULES, startingRound: 1 });
    await settle();
    http.expectOne(`${API}/feed?limit=200`).flush([]);
    http.expectOne(`${API}/picks`).flush([apiFixture('292584'), apiFixture('292590')]);
    await saving;
    expect(league.rules().startingRound).toBe(1);
    expect(league.picks().map((f) => f.fixtureId)).toEqual(['292584', '292590']);
    http.verify();
  });

  it('records a round’s totals and clears one', async () => {
    const { league, http } = setup();
    await loadSteward(http, league);
    const recording = league.recordStandings(2, [
      { memberId: 'm-1', points: 7.5 },
      { memberId: 'm-2', points: 9 },
    ]);
    const put = http.expectOne(`${API}/rounds/2/standings`);
    expect(put.request.method).toBe('PUT');
    expect(put.request.body).toEqual({
      standings: [
        { memberId: 'm-1', points: 7.5 },
        { memberId: 'm-2', points: 9 },
      ],
    });
    put.flush([
      { roundNumber: 2, memberId: 'm-2', memberName: 'M-2', rank: 1, points: 9 },
      { roundNumber: 2, memberId: 'm-1', memberName: 'M-1', rank: 2, points: 7.5 },
    ]);
    await recording;
    expect(league.standings()).toEqual([
      { roundId: 2, memberId: 'm-2', rank: 1, points: 9 },
      { roundId: 2, memberId: 'm-1', rank: 2, points: 7.5 },
    ]);

    const clearing = league.clearStanding(2, 'm-2');
    const remove = http.expectOne(`${API}/rounds/2/standings/m-2`);
    expect(remove.request.method).toBe('DELETE');
    remove.flush(null, { status: 204, statusText: 'No Content' });
    await clearing;
    expect(league.standings().map((s) => s.memberId)).toEqual(['m-1']);
    http.verify();
  });

  it('links a pick confirmation duty to the fixtures it covers', async () => {
    const { league, http } = setup();
    await loadSteward(http, league);
    const creating = league.createDuty({
      memberId: 'm-2',
      type: 'pick_confirmation',
      roundId: 1,
      deadlineAt: null,
      reason: 'Two picks missing.',
      pickFixtureIds: ['292584', '292585'],
    });
    const post = http.expectOne(`${API}/duties`);
    expect(post.request.body).toEqual({
      memberId: 'm-2',
      type: 'pick_confirmation',
      roundNumber: 1,
      deadlineAt: null,
      reason: 'Two picks missing.',
      pickFixtureIds: ['292584', '292585'],
    });
    post.flush({});
    await settle();
    flushRefresh(http);
    await creating;
    http.verify();
  });
  /** The records a reload fetches, with the given evidence cases. */
  function flushWithCases(http: HttpTestingController, cases: unknown[]) {
    http.expectOne(`${API}/members?include=withdrawn`).flush([]);
    for (const path of ['/standings', '/duties', '/marks', '/feed?limit=200', '/picks'])
      http.expectOne(`${API}${path}`).flush([]);
    http.expectOne(`${API}/evidence/cases`).flush(cases);
    http.expectOne(`${API}/stand-in-reviewer`).flush({ memberId: 'm-2', memberName: 'M-2' });
  }

  const apiCase = (closesAt: string, status = 'open') => ({
    id: 'c-1',
    dutyId: 'd-1',
    linkId: 'l-1',
    status,
    closesAt,
    canRespond: true,
  });

  it('responds to and rules on evidence cases, then reloads the records', async () => {
    const { league, http } = setup();
    await loadSteward(http, league);

    const vetoing = league.respondToCase('c 1', 'veto', 'Wrong round');
    const veto = http.expectOne(`${API}/evidence/cases/c%201/response`);
    expect(veto.request.method).toBe('POST');
    expect(veto.request.body).toEqual({ choice: 'veto', reason: 'Wrong round' });
    veto.flush(apiCase('2026-10-05T08:00:00Z', 'in_review'));
    await settle();
    flushRefresh(http);
    await vetoing;

    const ruling = league.reviewCase('c-1', 'dismissed', 'Visible at 0:40', 3);
    const review = http.expectOne(`${API}/evidence/cases/c-1/review`);
    expect(review.request.body).toEqual({
      ruling: 'dismissed',
      reason: 'Visible at 0:40',
      version: 3,
    });
    review.flush(apiCase('2026-10-05T08:00:00Z'));
    await settle();
    flushRefresh(http);
    await ruling;

    const refused = league.respondToCase('c-1', 'accept', '');
    http
      .expectOne(`${API}/evidence/cases/c-1/response`)
      .flush(
        { detail: { code: 'voting_closed', message: 'Voting on this evidence has closed.' } },
        { status: 409, statusText: 'Conflict' },
      );
    await expect(refused).rejects.toMatchObject({ status: 409, code: 'voting_closed' });
    http.verify();
  });

  it('names and clears the stand-in reviewer', async () => {
    const { league, http } = setup();
    await loadSteward(http, league);
    const naming = league.setStandInReviewer('m-2');
    const put = http.expectOne(`${API}/stand-in-reviewer`);
    expect(put.request.method).toBe('PUT');
    expect(put.request.body).toEqual({ memberId: 'm-2' });
    put.flush({ memberId: 'm-2', memberName: 'M-2' });
    await settle();
    expect(league.standInReviewer()).toEqual({ memberId: 'm-2', memberName: 'M-2' });
    flushWithCases(http, []);
    await naming;

    const clearing = league.setStandInReviewer(null);
    const clear = http.expectOne(`${API}/stand-in-reviewer`);
    expect(clear.request.body).toEqual({ memberId: null });
    clear.flush(NO_STAND_IN);
    await settle();
    flushRefresh(http);
    await clearing;
    expect(league.standInReviewer()).toEqual(NO_STAND_IN);
    http.verify();
  });

  it('reads the records again once an open case’s voting window closes', async () => {
    const { league, http } = setup();
    await loadSteward(http, league);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      league.reload();
      flushWithCases(http, [apiCase(new Date(Date.now() + 60_000).toISOString())]);
      for (let i = 0; i < 10; i++) await Promise.resolve();
      expect(league.cases().map((c) => c.status)).toEqual(['open']);
      vi.advanceTimersByTime(60_000 + SETTLE_DELAY_MS - 1_000);
      http.expectNone(`${API}/evidence/cases`);
      vi.advanceTimersByTime(1_000);
      // The API settles the case on this read.
      flushWithCases(http, [apiCase(new Date().toISOString(), 'accepted')]);
      for (let i = 0; i < 10; i++) await Promise.resolve();
      expect(league.cases().map((c) => c.status)).toEqual(['accepted']);
      vi.advanceTimersByTime(24 * 60 * 60_000);
      http.expectNone(`${API}/evidence/cases`);
    } finally {
      vi.useRealTimers();
    }
    http.verify();
  });

  it('reads the records again on coming back to the tab after a window closed', async () => {
    const { league, http } = setup();
    await loadSteward(http, league);
    league.reload();
    flushWithCases(http, [apiCase(new Date(Date.now() - 1_000).toISOString())]);
    await settle();
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    try {
      document.dispatchEvent(new Event('visibilitychange'));
      flushRefresh(http);
      await settle();
      expect(league.cases()).toEqual([]);
      document.dispatchEvent(new Event('visibilitychange'));
      http.expectNone(`${API}/evidence/cases`);
    } finally {
      visibility.mockRestore();
    }
    league.clear();
    http.verify();
  });

  it('reads the picks again once per kickoff, and on coming back to the tab after one', async () => {
    const { league, http } = setup();
    await loadSteward(http, league);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    const flush = async () => {
      for (let i = 0; i < 10; i++) await Promise.resolve();
    };
    try {
      const now = Date.now();
      const friday = new Date(now + 60_000).toISOString();
      const saturday = new Date(now + 24 * 60 * 60_000).toISOString();
      const open = (fixtureId: string, kickoffUtc: string) =>
        apiFixture(fixtureId, { kickoffUtc, locked: false, result: null, picks: [] });
      // Two fixtures kick off together on Friday, one on Saturday.
      league.reload();
      http.expectOne(`${API}/members?include=withdrawn`).flush([]);
      for (const path of ['/standings', '/duties', '/marks', '/evidence/cases', '/feed?limit=200'])
        http.expectOne(`${API}${path}`).flush([]);
      http.expectOne(`${API}/stand-in-reviewer`).flush(NO_STAND_IN);
      http
        .expectOne(`${API}/picks`)
        .flush([open('f-1', friday), open('f-2', friday), open('f-3', saturday)]);
      await flush();
      expect(league.picks().map((f) => f.picks.length)).toEqual([0, 0, 0]);

      vi.advanceTimersByTime(60_000 + KICKOFF_DELAY_MS - 1);
      http.expectNone(`${API}/picks`);
      // Kickoff: one read for both fixtures, and the pool shows.
      vi.advanceTimersByTime(1);
      http
        .expectOne(`${API}/picks`)
        .flush([
          apiFixture('f-1', { kickoffUtc: friday, result: null }),
          apiFixture('f-2', { kickoffUtc: friday, result: null }),
          open('f-3', saturday),
        ]);
      await flush();
      expect(league.picks().map((f) => [f.locked, f.picks.length])).toEqual([
        [true, 2],
        [true, 2],
        [false, 0],
      ]);
      vi.advanceTimersByTime(60 * 60_000);
      http.expectNone(`${API}/picks`);

      // Saturday's kickoff passes while the tab is hidden: the read waits for the tab.
      visibility.mockReturnValue('hidden');
      vi.advanceTimersByTime(24 * 60 * 60_000);
      http.expectNone(`${API}/picks`);
      visibility.mockReturnValue('visible');
      document.dispatchEvent(new Event('visibilitychange'));
      document.dispatchEvent(new Event('visibilitychange'));
      // An API whose clock lags still sends Saturday's as open: no second read for it.
      http.expectOne(`${API}/picks`).flush([open('f-3', saturday)]);
      await flush();
      vi.advanceTimersByTime(24 * 60 * 60_000);
      document.dispatchEvent(new Event('visibilitychange'));
      http.expectNone(`${API}/picks`);
    } finally {
      visibility.mockRestore();
      vi.useRealTimers();
    }
    league.clear();
    http.verify();
  });
});
