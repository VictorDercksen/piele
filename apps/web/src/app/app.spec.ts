import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from './app.routes';
import { EmptyLeagueData, LeagueData } from './core/league/league-data';
import { ProfileStore } from './core/profile/profile.store';

describe('App routes', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideRouter(routes), { provide: LeagueData, useClass: EmptyLeagueData }],
    });
  });

  it('sends first-time visitors to onboarding', async () => {
    TestBed.inject(ProfileStore).profile.set(null);
    const harness = await RouterTestingHarness.create('/?round=3');
    expect(TestBed.inject(Router).url).toBe('/welcome?returnUrl=%2F%3Fround%3D3');
    expect(harness.routeNativeElement?.querySelector('h1')?.textContent).toContain('allegiance.');
    expect(harness.routeNativeElement?.querySelectorAll('input[type=radio]').length).toBe(16);
  });

  it('shows the clubhouse to returning members without league records', async () => {
    TestBed.inject(ProfileStore).profile.set({
      displayName: 'Test Member',
      teamId: 'dhl-stormers',
      photo: null,
    });
    const harness = await RouterTestingHarness.create('/?round=3');
    const root = harness.routeNativeElement!;
    expect(root.querySelector('.supporter-strip')?.textContent).toContain('Test Member');
    expect(root.querySelector('.round-context')?.textContent).toContain('Round 03');
    expect(root.querySelector('.standings-panel .round-empty')).toBeTruthy();
  });

  it('keeps the captain desk behind the captain check', async () => {
    TestBed.inject(ProfileStore).profile.set({
      displayName: 'Test Member',
      teamId: 'dhl-stormers',
      photo: null,
    });
    await RouterTestingHarness.create('/captain');
    expect(TestBed.inject(Router).url).toBe('/');
  });
});
