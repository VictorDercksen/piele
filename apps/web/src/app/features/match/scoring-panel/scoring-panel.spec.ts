import { TestBed } from '@angular/core/testing';
import { Fixture } from '../../../core/competition/competition.models';
import { scoringView } from '../scoring';
import { ScoringPanel } from './scoring-panel';

const FIXTURE: Fixture = {
  id: '292584',
  kickoffUtc: '2026-09-25T18:45:00Z',
  home: 'Benetton',
  away: 'Dragons',
  homeAsset: 'benetton-rugby',
  awayAsset: 'dragons-rfc',
  day: 'FRI 25 SEP',
  time: '20:45',
  venue: 'Stadio Monigo',
};

const VIEW = scoringView(
  FIXTURE,
  {
    status: 'ok',
    source: 'URC match centre',
    fetchedAt: '2026-09-25T19:40:00Z',
    state: 'full_time',
    minute: null,
    home: { score: 3, halfTime: 3 },
    away: { score: 7, halfTime: 7 },
    events: [
      {
        id: 1,
        minute: 6,
        time: '6',
        period: 'first half',
        side: 'home',
        kind: 'penalty_goal',
        points: 3,
        player: 'T. Albornoz',
        score: [3, 0],
      },
      {
        id: 2,
        minute: 18,
        time: '18',
        period: 'first half',
        side: 'away',
        kind: 'try',
        points: 5,
        player: 'R. Williams',
        score: [3, 5],
      },
    ],
  },
  Date.parse('2026-09-25T19:40:00Z'),
)!;

describe('ScoringPanel', () => {
  function render() {
    const fixture = TestBed.createComponent(ScoringPanel);
    fixture.componentRef.setInput('view', VIEW);
    fixture.detectChanges();
    return { fixture, host: fixture.nativeElement as HTMLElement };
  }

  it('starts closed and opens from anywhere on the panel', async () => {
    const { fixture, host } = render();
    const summary = host.querySelector<HTMLElement>('.summary')!;
    expect(summary.getAttribute('aria-expanded')).toBe('false');
    expect(host.querySelector('.drawer')?.hasAttribute('inert')).toBe(true);
    expect(host.querySelector('.hint')?.textContent?.trim()).toBe('Tap to open the pitch');

    host.querySelector<HTMLElement>('.drawer')!.click();
    await fixture.whenStable();
    expect(summary.getAttribute('aria-expanded')).toBe('true');
    expect(host.classList).toContain('open');
    expect(host.querySelector('.drawer')?.hasAttribute('inert')).toBe(false);
    expect(host.querySelectorAll('.row')).toHaveLength(2);
    expect(host.querySelector('.row.big .pts')?.textContent).toContain('+5');
    expect(host.querySelector('.row.slim .who')?.textContent?.trim()).toBe('Albornoz');
  });

  it('stays open for taps on the pitch and closes from the heading or keyboard', async () => {
    const { fixture, host } = render();
    const summary = host.querySelector<HTMLElement>('.summary')!;
    summary.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    await fixture.whenStable();
    expect(host.classList).toContain('open');

    host.querySelector<HTMLElement>('.field')!.click();
    await fixture.whenStable();
    expect(host.classList).toContain('open');

    host.querySelector<HTMLElement>('h2')!.click();
    await fixture.whenStable();
    expect(host.classList).not.toContain('open');
    expect(summary.getAttribute('aria-label')).toMatch(/^Show the scoring pitch\. Benetton 3/);
  });
});
