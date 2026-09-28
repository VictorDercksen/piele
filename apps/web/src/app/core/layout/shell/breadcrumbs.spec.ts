import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from '../../../app.routes';
import { LeagueContext } from '../../league/league-context';
import { LeagueData } from '../../league/data/league-data';
import { SampleLeagueData } from '../../league/data/sample-league-data';
import { ProfileControlService } from '../../profile/profile-control.service';
import { Breadcrumbs, FROM_NAV_BAR } from './breadcrumbs';

// Round 1: Connacht v Stormers and Benetton v Dragons.
const STORMERS = '292585';
const BENETTON = '292584';

describe('Breadcrumbs', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideRouter(routes), { provide: LeagueData, useClass: SampleLeagueData }],
    });
  });
  afterEach(() => localStorage.clear());

  async function open(url: string): Promise<RouterTestingHarness> {
    const context = TestBed.inject(LeagueContext);
    await context.ensureAccount();
    await context.select('piele');
    await TestBed.inject(ProfileControlService).save({
      displayName: 'Test Member',
      teamId: 'dhl-stormers',
      photo: null,
    });
    return RouterTestingHarness.create(url);
  }

  async function go(url: string, state?: Record<string, string>): Promise<void> {
    await TestBed.inject(Router).navigateByUrl(url, { state });
  }

  function trail(): string[] {
    return TestBed.inject(Breadcrumbs)
      .trail()
      .map((crumb) => `${crumb.label} ${crumb.path}`);
  }

  function crumbs(harness: RouterTestingHarness): string[] {
    harness.detectChanges();
    const links = harness.routeNativeElement!.querySelectorAll<HTMLAnchorElement>('.breadcrumbs a');
    return Array.from(links).map((a) => `${a.textContent?.trim()} ${a.getAttribute('href')}`);
  }

  it('gives a page opened directly its parent and main pages none', async () => {
    const harness = await open('/piele/standings?round=1');
    expect(trail()).toEqual(['More /more']);
    expect(crumbs(harness)).toEqual(['MORE /piele/more?round=1']);

    await go(`/piele/match/${STORMERS}?round=1`);
    expect(trail()).toEqual(['More /more', 'Standings /standings']);

    await go('/piele/duties?round=1');
    expect(trail()).toEqual([]);
    expect(crumbs(harness)).toEqual([]);
  });

  it('leads back to the main page a page was opened from', async () => {
    const harness = await open('/piele/more?round=1');
    await go('/piele/constitution?round=1');
    expect(crumbs(harness)).toEqual(['MORE /piele/more?round=1']);

    await go('/piele?round=1');
    await go('/piele/captain?round=1');
    expect(crumbs(harness)).toEqual(['HOME /piele?round=1']);

    await go('/piele/decisions?round=1');
    await go(`/piele/match/${STORMERS}?round=1`);
    expect(trail()).toEqual(['Decisions /decisions']);
  });

  it('extends the trail, keeps it across fixtures and rounds, and cuts it back', async () => {
    await open('/piele?round=1');
    await go('/piele/standings?round=1');
    await go(`/piele/match/${STORMERS}?round=1`);
    expect(trail()).toEqual(['Home /', 'Standings /standings']);

    await go(`/piele/match/${BENETTON}?round=1`);
    await go(`/piele/match/${BENETTON}?round=2`);
    expect(trail()).toEqual(['Home /', 'Standings /standings']);

    await go('/piele/standings?round=2');
    expect(trail()).toEqual(['Home /']);
  });

  it('starts afresh from the navigation bar', async () => {
    await open('/piele?round=1');
    await go('/piele/standings?round=1', FROM_NAV_BAR);
    expect(trail()).toEqual([]);
  });

  it('passes the navigation bar state on from the shell links', async () => {
    const harness = await open('/piele/duties?round=1');
    const standings = harness.routeNativeElement!.querySelector<HTMLAnchorElement>(
      '.desktop-nav a[href^="/piele/standings"]',
    )!;
    standings.click();
    await harness.fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/piele/standings?round=1');
    expect(trail()).toEqual([]);
  });
});
