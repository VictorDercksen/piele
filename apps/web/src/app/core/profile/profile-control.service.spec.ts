import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { LeagueContext } from '../league/league-context';
import { LeagueData } from '../league/data/league-data';
import { SampleLeagueData } from '../league/data/sample-league-data';
import { ProfileControlService } from './profile-control.service';
import { ProfileService } from './profile.service';

const PHOTO = 'data:image/jpeg;base64,/9j/4AAQ';

describe('ProfileControlService browser-kept profile per league', () => {
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
    const profiles = TestBed.inject(ProfileService);
    const control = TestBed.inject(ProfileControlService);
    await open('piele');
    expect(profiles.persisted).toBe(false);
    await control.save({ displayName: 'Vic', teamId: 'dhl-stormers', photo: PHOTO });
    expect(localStorage.getItem('pavilion-team-v1:piele')).toBe('dhl-stormers');

    await open('pofadder-bowl');
    expect(profiles.profile()).toBeNull();
    // Onboarding in the second league starts from the shared name and photo.
    expect(profiles.earlier()).toEqual({ displayName: 'Vic', photo: PHOTO });
    await control.save({ displayName: 'Vic', teamId: 'munster-rugby', photo: null });
    expect(profiles.team()?.id).toBe('munster-rugby');

    await open('piele');
    expect(profiles.profile()).toEqual({ displayName: 'Vic', teamId: 'dhl-stormers', photo: null });
  });

  it('moves a profile kept before leagues had slugs when saving in another league', async () => {
    localStorage.setItem(
      'pavilion-profile-v1',
      JSON.stringify({ displayName: 'Old', teamId: 'ospreys', photo: null }),
    );
    const profiles = TestBed.inject(ProfileService);
    const control = TestBed.inject(ProfileControlService);
    await open('piele');
    expect(profiles.profile()?.teamId).toBe('ospreys');
    await open('pofadder-bowl');
    expect(profiles.profile()).toBeNull();
    await control.save({ displayName: 'Old', teamId: 'scarlets', photo: null });
    // Saving moved the old value: Piele keeps its team, the old key is gone.
    expect(localStorage.getItem('pavilion-profile-v1')).toBeNull();
    await open('piele');
    expect(profiles.profile()?.teamId).toBe('ospreys');
  });

  it('refuses an incomplete profile', async () => {
    const control = TestBed.inject(ProfileControlService);
    await open('piele');
    await expect(
      control.save({ displayName: ' ', teamId: 'dhl-stormers', photo: null }),
    ).rejects.toThrow('Enter a name and choose a favourite team.');
  });
});
