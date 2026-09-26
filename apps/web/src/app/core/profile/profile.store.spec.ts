import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { competition } from '../competition/registry';
import { LeagueContext } from '../league/league-context';
import { LeagueData } from '../league/league-data';
import { SampleLeagueData } from '../league/sample-league-data';
import { ProfileStore, isProfile } from './profile.store';

const URC = competition('urc-2026-27');
const PHOTO = 'data:image/jpeg;base64,/9j/4AAQ';

describe('stored profile validation', () => {
  it('accepts only known teams, bounded names and local JPEG photos', () => {
    const good = { displayName: 'Test Member', teamId: 'dhl-stormers', photo: null };
    expect(isProfile(good, URC)).toBe(true);
    for (const value of [
      null,
      {},
      { ...good, teamId: 'fake' },
      { ...good, displayName: '  ' },
      { ...good, displayName: 'a'.repeat(51) },
      { ...good, photo: 'https://external.test/photo' },
      { ...good, photo: 'data:image/svg+xml;base64,abcd' },
    ])
      expect(isProfile(value, URC)).toBe(false);
  });
});

describe('browser-kept profile per league', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: LeagueData, useClass: SampleLeagueData }],
    });
  });
  afterEach(() => localStorage.clear());

  async function open(slug: string) {
    const context = TestBed.inject(LeagueContext);
    await context.ensureAccount();
    expect(await context.select(slug)).toBe(true);
  }

  it('keeps a favourite team per league and one name and photo for the account', async () => {
    const store = TestBed.inject(ProfileStore);
    await open('piele');
    expect(store.persisted).toBe(false);
    await store.save({ displayName: 'Vic', teamId: 'dhl-stormers', photo: PHOTO });
    expect(localStorage.getItem('pavilion-team-v1:piele')).toBe('dhl-stormers');

    await open('pofadder-bowl');
    expect(store.profile()).toBeNull();
    // Onboarding in the second league starts from the shared name and photo.
    expect(store.earlier()).toEqual({ displayName: 'Vic', photo: PHOTO });
    await store.save({ displayName: 'Vic', teamId: 'munster-rugby', photo: null });
    expect(store.team()?.id).toBe('munster-rugby');

    await open('piele');
    expect(store.profile()).toEqual({ displayName: 'Vic', teamId: 'dhl-stormers', photo: null });
  });

  it('reads a profile kept before leagues had slugs as the first league’s', async () => {
    localStorage.setItem(
      'pavilion-profile-v1',
      JSON.stringify({ displayName: 'Old', teamId: 'ospreys', photo: null }),
    );
    const store = TestBed.inject(ProfileStore);
    await open('piele');
    expect(store.profile()?.teamId).toBe('ospreys');
    await open('pofadder-bowl');
    expect(store.profile()).toBeNull();
    await store.save({ displayName: 'Old', teamId: 'scarlets', photo: null });
    // Saving moved the old value: Piele keeps its team, the old key is gone.
    expect(localStorage.getItem('pavilion-profile-v1')).toBeNull();
    await open('piele');
    expect(store.profile()?.teamId).toBe('ospreys');
  });
});
