import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { LeagueContext } from '../league/league-context';
import { LeagueData } from '../league/data/league-data';
import { SampleLeagueData } from '../league/data/sample-league-data';
import { ProfileService } from './profile.service';

describe('ProfileService browser-kept profile', () => {
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

  it('reads a profile kept before leagues had slugs as the first league’s', async () => {
    localStorage.setItem(
      'pavilion-profile-v1',
      JSON.stringify({ displayName: 'Old', teamId: 'ospreys', photo: null }),
    );
    const profiles = TestBed.inject(ProfileService);
    expect(profiles.persisted).toBe(false);
    await open('piele');
    expect(profiles.profile()?.teamId).toBe('ospreys');
    expect(profiles.team()?.id).toBe('ospreys');
    expect(profiles.initials()).toBe('O');
    await open('pofadder-bowl');
    expect(profiles.profile()).toBeNull();
    // Onboarding in the second league starts from the old name and photo.
    expect(profiles.earlier()).toEqual({ displayName: 'Old', photo: null });
  });
});
