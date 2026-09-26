import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from '../../../app.routes';
import { LeagueContext } from '../../league/league-context';
import { LeagueData } from '../../league/league-data';
import { SampleLeagueData } from '../../league/sample-league-data';
import { ProfileStore } from '../../profile/profile.store';

describe('Shell', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideRouter(routes), { provide: LeagueData, useClass: SampleLeagueData }],
    });
  });
  afterEach(() => localStorage.clear());

  async function open(url: string, slug: string): Promise<HTMLElement> {
    const context = TestBed.inject(LeagueContext);
    await context.ensureAccount();
    await context.select(slug);
    await TestBed.inject(ProfileStore).save({
      displayName: 'Test Member',
      teamId: 'dhl-stormers',
      photo: null,
    });
    const harness = await RouterTestingHarness.create(url);
    return harness.routeNativeElement!;
  }

  it('names the current league top left and in the footer, with its competition', async () => {
    const root = await open('/pofadder-bowl?round=2', 'pofadder-bowl');
    const brand = root.querySelector('.rail-brand')!;
    expect(brand.querySelector('strong')?.textContent).toBe('POFADDER BOWL');
    expect(brand.querySelector('small')?.textContent).toContain('URC');
    expect(brand.getAttribute('aria-label')).toBe('Pofadder Bowl home');
    expect(brand.getAttribute('href')).toBe('/pofadder-bowl?round=2');
    // No emblem yet and not the first league: a monogram of the initials.
    expect(brand.querySelector('app-member-avatar .monogram')?.textContent).toBe('PB');
    expect(root.querySelector('.club-footer')?.textContent).toContain('POFADDER BOWL / ROUND 02');
    const nav = Array.from(root.querySelectorAll<HTMLAnchorElement>('.desktop-nav a'));
    expect(nav.map((a) => a.getAttribute('href')?.split('?')[0])).toEqual([
      '/pofadder-bowl',
      '/pofadder-bowl/standings',
      '/pofadder-bowl/duties',
      '/pofadder-bowl/decisions',
      '/pofadder-bowl/more',
    ]);
  });

  it('shows the Piele crest for the first league', async () => {
    const root = await open('/piele', 'piele');
    const crest = root.querySelector<HTMLImageElement>('.rail-brand app-league-crest img');
    expect(crest?.getAttribute('src')).toBe('assets/images/piele-crest.png');
    expect(root.querySelector('.rail-brand strong')?.textContent).toBe('PIELE');
  });
});
