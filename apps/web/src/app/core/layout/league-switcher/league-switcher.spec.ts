import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from '../../../app.routes';
import { LeagueContext } from '../../league/league-context';
import { LeagueData } from '../../league/league-data';
import { SampleLeagueData } from '../../league/sample-league-data';
import { ProfileStore } from '../../profile/profile.store';

describe('LeagueSwitcher', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideRouter(routes), { provide: LeagueData, useClass: SampleLeagueData }],
    });
  });
  afterEach(() => localStorage.clear());

  async function open(url: string, slug: string) {
    const context = TestBed.inject(LeagueContext);
    await context.ensureAccount();
    await context.select(slug);
    await TestBed.inject(ProfileStore).save({
      displayName: 'Test Member',
      teamId: 'dhl-stormers',
      photo: null,
    });
    const harness = await RouterTestingHarness.create(url);
    const root = harness.routeNativeElement!;
    const switcher = root.querySelector<HTMLElement>('app-league-switcher.rail-brand')!;
    const trigger = switcher.querySelector<HTMLButtonElement>('.switcher-trigger')!;
    return { harness, root, switcher, trigger };
  }

  /** Waits for a navigation, which may lazy-load a page. */
  async function until(check: () => boolean) {
    for (let i = 0; i < 100 && !check(); i++) await new Promise((resolve) => setTimeout(resolve, 10));
  }

  const rows = (switcher: HTMLElement) =>
    Array.from(switcher.querySelectorAll<HTMLAnchorElement>('.league-row'));

  it('opens a dialog grouping the admin’s leagues, with the current one marked', async () => {
    const { switcher, trigger } = await open('/piele/standings?round=2', 'piele');
    const panel = switcher.querySelector<HTMLElement>('[role="dialog"]')!;
    expect(panel.getAttribute('aria-hidden')).toBe('true');
    expect(panel.hasAttribute('inert')).toBe(true);

    trigger.click();
    TestBed.tick();
    await new Promise((resolve) => setTimeout(resolve));
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(switcher.classList.contains('open')).toBe(true);
    expect(panel.hasAttribute('inert')).toBe(false);
    expect(trigger.getAttribute('aria-controls')).toBe(panel.id);
    expect(Array.from(panel.querySelectorAll('.group-title')).map((h) => h.textContent)).toEqual([
      'Your leagues',
      'All leagues',
      'Join a league',
    ]);
    const [piele, pofadder, third] = rows(switcher);
    expect(piele.querySelector('strong')?.textContent).toBe('Piele');
    expect(piele.querySelector('small')?.textContent).toBe('URC 2026/27');
    expect(piele.getAttribute('aria-current')).toBe('true');
    expect(piele.textContent).toContain('Captain');
    expect(document.activeElement).toBe(piele);
    expect(pofadder.getAttribute('aria-current')).toBeNull();
    expect(pofadder.textContent).not.toContain('Captain');
    expect(third.textContent).toContain('Admin view');
    // The same page in the other league, keeping the round on the same competition.
    expect(pofadder.getAttribute('href')).toBe('/pofadder-bowl/standings?round=2');
    expect(third.getAttribute('href')).toBe('/sample-third/standings?round=2');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    TestBed.tick();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(trigger);
  });

  it('moves to the same page in the chosen league and closes', async () => {
    const { switcher, trigger } = await open('/piele/duties?round=3', 'piele');
    // The member has a favourite team in the Pofadder Bowl too, so no onboarding.
    localStorage.setItem('pavilion-team-v1:pofadder-bowl', 'dhl-stormers');
    const router = TestBed.inject(Router);
    trigger.click();
    TestBed.tick();
    rows(switcher)[1].click();
    await until(() => router.url.startsWith('/pofadder-bowl'));
    expect(router.url).toBe('/pofadder-bowl/duties?round=3');
    expect(switcher.classList.contains('open')).toBe(false);
  });

  it('closes on a pointer outside it', async () => {
    const { switcher, trigger } = await open('/piele', 'piele');
    trigger.click();
    TestBed.tick();
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    TestBed.tick();
    expect(switcher.classList.contains('open')).toBe(false);
  });

  it('takes a pasted join link to the join page and explains a bad one', async () => {
    const { switcher, trigger } = await open('/piele', 'piele');
    const router = TestBed.inject(Router);
    trigger.click();
    TestBed.tick();
    const input = switcher.querySelector<HTMLInputElement>('.join input')!;
    const label = switcher.querySelector<HTMLLabelElement>('.join label')!;
    expect(label.textContent).toBe('Join link or code');
    expect(label.htmlFor).toBe(input.id);
    const form = switcher.querySelector<HTMLFormElement>('form.join')!;

    input.value = 'not a code';
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    TestBed.tick();
    expect(switcher.querySelector('[role="alert"]')?.textContent).toContain(
      'not a join link or code',
    );
    expect(input.getAttribute('aria-invalid')).toBe('true');

    input.value = 'https://pavilion.example/join/b0e1d2c3a4f5';
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await until(() => router.url.startsWith('/join'));
    expect(router.url).toBe('/join/b0e1d2c3a4f5');
  });
});
