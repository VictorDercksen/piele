import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { LeagueData } from '../../league/league-data';
import { SampleLeagueData } from '../../league/sample-league-data';
import { ProfileStore } from '../../profile/profile.store';
import { routes } from '../../../app.routes';

describe('NotificationsFlag', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideRouter(routes), { provide: LeagueData, useClass: SampleLeagueData }],
    });
    TestBed.inject(ProfileStore).profile.set({
      displayName: 'Test Member',
      teamId: 'dhl-stormers',
      photo: null,
    });
  });

  async function mount(): Promise<HTMLElement> {
    const harness = await RouterTestingHarness.create('/?round=2');
    return harness.routeNativeElement!.querySelector('app-notifications-flag') as HTMLElement;
  }

  it('lists the round updates on the flag and counts them as unread', async () => {
    const flag = await mount();
    const trigger = flag.querySelector<HTMLButtonElement>('.flag-trigger')!;
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(flag.querySelector('.badge')?.textContent).toBe('3');
    expect(flag.querySelector('.cloth')?.hasAttribute('inert')).toBe(true);

    trigger.click();
    TestBed.tick();
    expect(flag.classList.contains('open')).toBe(true);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(flag.querySelector('.cloth')?.hasAttribute('inert')).toBe(false);
    const items = Array.from(flag.querySelectorAll('.notification-item'));
    expect(items.length).toBe(3);
    expect(items[1].classList.contains('spoon-duty')).toBe(true);
    expect(items.every((item) => item.classList.contains('unread'))).toBe(true);
    expect(flag.querySelector('h2')?.textContent).toContain('Round 02 updates.');
  });

  it('marks everything read, persists it and closes on Escape', async () => {
    const flag = await mount();
    flag.querySelector<HTMLButtonElement>('.flag-trigger')!.click();
    TestBed.tick();
    flag.querySelector<HTMLButtonElement>('.read')!.click();
    TestBed.tick();
    expect(flag.querySelector('.badge')).toBeNull();
    expect(flag.querySelector('.read')).toBeNull();
    expect(flag.querySelectorAll('.notification-item.unread').length).toBe(0);
    expect(JSON.parse(localStorage.getItem('piele-notifications-read-v1')!).length).toBe(3);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    TestBed.tick();
    expect(flag.classList.contains('open')).toBe(false);
    expect(flag.querySelector('.cloth')?.getAttribute('aria-hidden')).toBe('true');
  });
});
