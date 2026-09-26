import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from './app.routes';
import { LeagueContext } from './core/league/league-context';
import { EmptyLeagueData, LeagueData } from './core/league/league-data';
import { ProfileStore } from './core/profile/profile.store';

describe('App routes', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideRouter(routes), { provide: LeagueData, useClass: EmptyLeagueData }],
    });
  });

  /** A returning member of the build's one local league. */
  async function returning(): Promise<void> {
    const context = TestBed.inject(LeagueContext);
    await context.ensureAccount();
    await context.select('piele');
    await TestBed.inject(ProfileStore).save({
      displayName: 'Test Member',
      teamId: 'dhl-stormers',
      photo: null,
    });
  }

  it('opens the league and sends first-time visitors to its onboarding', async () => {
    const harness = await RouterTestingHarness.create('/?round=3');
    expect(TestBed.inject(Router).url).toBe('/piele/welcome?returnUrl=%2Fpiele%3Fround%3D3');
    expect(harness.routeNativeElement?.querySelector('h1')?.textContent).toContain('allegiance.');
    expect(harness.routeNativeElement?.querySelectorAll('input[type=radio]').length).toBe(16);
  });

  it('shows the clubhouse to returning members without league records', async () => {
    await returning();
    const harness = await RouterTestingHarness.create('/piele?round=3');
    const root = harness.routeNativeElement!;
    expect(root.querySelector('.header-profile')?.textContent).toContain('Test Member');
    expect(root.querySelector('.round-context')?.textContent).toContain('Round 03');
    expect(root.querySelector('.standings-panel .round-empty')).toBeTruthy();
    expect(root.querySelector('.rail-brand strong')?.textContent).toBe('PIELE');
    expect(root.querySelector('.club-footer')?.textContent).toContain('PIELE / ROUND 03');
  });

  it('sends bookmarks from before league slugs to the same page in the league', async () => {
    await returning();
    await RouterTestingHarness.create('/standings?round=2');
    expect(TestBed.inject(Router).url).toBe('/piele/standings?round=2');
  });

  it('sends an unknown league back to the account’s league', async () => {
    await returning();
    await RouterTestingHarness.create('/somewhere-else');
    expect(TestBed.inject(Router).url).toBe('/piele');
  });

  it('keeps the captain desk behind the captain check', async () => {
    await returning();
    await RouterTestingHarness.create('/captain');
    expect(TestBed.inject(Router).url).toBe('/piele');
  });
});
