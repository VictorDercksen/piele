import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { CompetitionService } from '../../competition/competition.service';
import { competition } from '../../competition/registry';
import { LeagueContext } from '../../league/league-context';
import { LeagueData } from '../../league/league-data';
import { SampleLeagueData } from '../../league/sample-league-data';
import { ProfileStore } from '../../profile/profile.store';
import { routes } from '../../../app.routes';

/** The sample league's Round 2 as the current round, seen the Monday after it. */
const ROUNDS = competition('urc-2026-27').buildRounds(2);
class RoundTwo extends CompetitionService {
  override get currentRoundId() {
    return 2;
  }
  override get rounds() {
    return ROUNDS;
  }
}

describe('NotificationsFlag', () => {
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.parse('2026-10-05T10:00:00Z'));
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideRouter(routes),
        { provide: LeagueData, useClass: SampleLeagueData },
        { provide: CompetitionService, useClass: RoundTwo },
      ],
    });
    const context = TestBed.inject(LeagueContext);
    await context.ensureAccount();
    await context.select('piele');
    await TestBed.inject(ProfileStore).save({
      displayName: 'Test Member',
      teamId: 'dhl-stormers',
      photo: null,
    });
  });

  afterEach(() => vi.useRealTimers());

  async function mount(): Promise<HTMLElement> {
    const harness = await RouterTestingHarness.create('/');
    return harness.routeNativeElement!.querySelector('app-notifications-flag') as HTMLElement;
  }

  it('lists the round’s log under the pinned duty and poll and counts the log as unread', async () => {
    const flag = await mount();
    const trigger = flag.querySelector<HTMLButtonElement>('.flag-trigger')!;
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(flag.querySelector('.badge')?.textContent).toBe('7');
    expect(flag.querySelector('.cloth')?.hasAttribute('inert')).toBe(true);

    trigger.click();
    TestBed.tick();
    expect(flag.classList.contains('open')).toBe(true);
    expect(flag.querySelector('h2')?.textContent).toContain('Round 02 updates.');
    const pinned = Array.from(flag.querySelectorAll('.notification-item.pinned'));
    expect(pinned.map((item) => item.querySelector('h3')?.textContent)).toEqual([
      'Round 02 Spoon duty',
      'Accept the Round 2 result correction?',
    ]);
    expect(pinned[0].classList.contains('spoon-duty')).toBe(true);
    const items = Array.from(flag.querySelectorAll('.notification-item:not(.pinned)'));
    expect(items.length).toBe(7);
    expect(items[1].querySelector('h3')?.textContent).toBe('7 more matches kicked off.');
    expect(items.every((item) => item.classList.contains('unread'))).toBe(true);
    expect(items[0].querySelector('.tag')?.textContent).toContain('EVIDENCE');
    expect(items[0].querySelector('h3')?.textContent).toContain('Liam submitted evidence');
    expect(flag.querySelector('.divider')?.textContent).toBe('New');
    // The old round status card is gone; kick-offs link to the match centre instead.
    expect(items.some((item) => item.querySelector('h3')?.textContent === 'Current')).toBe(false);
    expect(items[5].textContent).toContain('Edinburgh v Stormers kicked off.');
    expect(items[5].textContent).toContain('Open the match centre');
  });

  it('follows one item and reads only that one, then marks the rest read at once', async () => {
    const flag = await mount();
    flag.querySelector<HTMLButtonElement>('.flag-trigger')!.click();
    TestBed.tick();
    const links = flag.querySelectorAll<HTMLButtonElement>(
      '.notification-item:not(.pinned) .text-button',
    );
    const last = links[links.length - 1];
    expect(last.textContent).toContain('View decision');
    last.click();
    await Promise.resolve();
    TestBed.tick();
    expect(flag.querySelector('.badge')?.textContent).toBe('6');
    expect(flag.classList.contains('open')).toBe(false);

    flag.querySelector<HTMLButtonElement>('.flag-trigger')!.click();
    TestBed.tick();
    expect(Array.from(flag.querySelectorAll('.divider')).map((d) => d.textContent)).toEqual([
      'New',
      'Earlier',
    ]);
    const read = flag.querySelector<HTMLButtonElement>('.read')!;
    expect(read.disabled).toBe(false);
    read.click();
    TestBed.tick();
    expect(flag.querySelector('.badge')).toBeNull();
    expect(flag.querySelector<HTMLButtonElement>('.read')!.disabled).toBe(true);
    expect(flag.querySelectorAll('.notification-item.unread').length).toBe(0);
    const stored = JSON.parse(localStorage.getItem('pavilion-notifications-read-v2:piele')!);
    expect(stored.readAt).toBe('2026-10-05T10:00:00.000Z');
    expect(stored.readKeys).toEqual([]);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    TestBed.tick();
    expect(flag.classList.contains('open')).toBe(false);
    expect(flag.querySelector('.cloth')?.getAttribute('aria-hidden')).toBe('true');
  });
});
