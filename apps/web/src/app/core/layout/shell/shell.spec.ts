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
    const trigger = brand.querySelector('button.switcher-trigger')!;
    expect(trigger.getAttribute('aria-label')).toBe('Pofadder Bowl. Switch league');
    expect(trigger.getAttribute('aria-haspopup')).toBe('dialog');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    // The Pofadder Bowl's preset crest, tinted with its accent colour.
    const crest = brand.querySelector<HTMLElement>('.switcher-trigger app-league-crest')!;
    expect(crest.querySelector('use')?.getAttribute('href')).toBe(
      'assets/images/emblems/anvil.svg#emblem',
    );
    expect(crest.style.getPropertyValue('--crest-accent')).toBe('#c8742a');
    expect(root.querySelector('.club-footer')?.textContent).toContain(
      'THE PAVILION / POFADDER BOWL / ROUND 02',
    );
    expect(root.querySelector('.admin-ribbon')).toBeNull();
    const nav = Array.from(root.querySelectorAll<HTMLAnchorElement>('.desktop-nav a'));
    expect(nav.map((a) => a.getAttribute('href')?.split('?')[0])).toEqual([
      '/pofadder-bowl',
      '/pofadder-bowl/standings',
      '/pofadder-bowl/duties',
      '/pofadder-bowl/decisions',
      '/pofadder-bowl/more',
    ]);
  });

  it('shows the admin view ribbon and a tinted monogram in a league it is not in', async () => {
    const root = await open('/sample-third', 'sample-third');
    expect(root.querySelector('.admin-ribbon')?.textContent).toContain(
      'Admin view. You are not a member of this league.',
    );
    const crest = root.querySelector<HTMLElement>('.rail-brand app-league-crest')!;
    expect(crest.querySelector('.monogram')?.textContent).toBe('ST');
    expect(crest.classList.contains('accented')).toBe(true);
  });

  it('shows the Piele crest for the first league', async () => {
    const root = await open('/piele', 'piele');
    const crest = root.querySelector<HTMLImageElement>('.rail-brand app-league-crest img');
    expect(crest?.getAttribute('src')).toBe('assets/images/piele-crest.png');
    expect(root.querySelector('.rail-brand strong')?.textContent).toBe('PIELE');
  });
});
