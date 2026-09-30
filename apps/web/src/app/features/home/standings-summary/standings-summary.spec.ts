import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, Injectable, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { LiveScoresService } from '../../../core/api/live-scores.service';
import { Fixture } from '../../../core/competition/competition.models';
import { CompetitionService } from '../../../core/competition/competition.service';
import { competition } from '../../../core/competition/registry';
import { LeagueContext } from '../../../core/league/league-context';
import { LeagueData } from '../../../core/league/data/league-data';
import { SampleLeagueData } from '../../../core/league/data/sample-league-data';
import { ProfileControlService } from '../../../core/profile/profile-control.service';
import { StandingsSummary } from './standings-summary';

const URC = competition('urc-2026-27');
const NOW = '2026-09-27T08:00:00Z';

@Component({
  template: `<aside appStandingsSummary class="honours-board"></aside>`,
  imports: [StandingsSummary],
})
class HomeBoard {}

/** The sample build on a frozen date, with the home board opened at `url`. */
async function open(url: string) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(Date.parse(NOW));
  const rounds = URC.buildRounds(1);
  @Injectable()
  class Frozen extends CompetitionService {
    override get currentRoundId() {
      return 1;
    }
    override get rounds() {
      return rounds;
    }
  }
  TestBed.configureTestingModule({
    providers: [
      provideRouter([{ path: 'home', component: HomeBoard }]),
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: LeagueData, useClass: SampleLeagueData },
      { provide: CompetitionService, useClass: Frozen },
      {
        provide: LiveScoresService,
        useValue: {
          clock: signal(Date.parse(NOW)).asReadonly(),
          merge: (fixture: Fixture) => fixture,
        },
      },
    ],
  });
  const context = TestBed.inject(LeagueContext);
  await context.ensureAccount();
  await context.select('piele');
  await TestBed.inject(ProfileControlService).save({
    displayName: 'Test Member',
    teamId: 'dhl-stormers',
    photo: null,
  });
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl(url, HomeBoard);
  harness.detectChanges();
  const element = harness.routeNativeElement!;
  const text = (selector: string) =>
    [...element.querySelectorAll(selector)].map((node) =>
      node.textContent!.replace(/\s+/g, ' ').trim(),
    );
  return { element, text };
}

describe('StandingsSummary', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.useRealTimers());

  it('shows the round top four, the full round link and the season pill', async () => {
    const { element, text } = await open('/home?round=1');
    expect(text('.total-head')).toEqual(['ROUND PTS']);
    expect(text('.points-row .member-name')).toEqual(['PieterW', 'Liam', 'Test Member', 'Johan']);
    expect(text('.footer-note')).toEqual(['Top 4 of 6']);
    expect(text('.footer-link')).toEqual(['Full round standings']);
    const footer = element.querySelector<HTMLAnchorElement>('.table-footer')!;
    expect(footer.getAttribute('href')).toBe('/piele/standings?round=1&table=round');
    expect(text('.season-pill')[0]).toMatch(/^Season You are \d+(st|nd|rd|th) of 6 · [\d.]+ pts$/);
    expect(element.querySelector('.board-status')).toBeNull();
    expect(element.querySelector('button')!.textContent!.trim()).toBe('Totals');
  });

  it('falls back to the season table with one link while the round has no results', async () => {
    const { element, text } = await open('/home?round=3');
    expect(text('.board-status .tag')).toEqual(['Round 03 · no results yet']);
    expect(text('.total-head')).toEqual(['SEASON PTS']);
    expect(text('.points-row .member-name')[0]).toBe('Johan');
    expect(text('.footer-note')[0]).toMatch(/^You are \d+(st|nd|rd|th) of 6 · [\d.]+ pts$/);
    expect(text('.footer-link')).toEqual(['Full season standings']);
    const footer = element.querySelector<HTMLAnchorElement>('.table-footer')!;
    expect(footer.getAttribute('href')).toBe('/piele/standings?round=3&table=season');
    expect(element.querySelector('.season-pill')).toBeNull();
  });

  it('tallies the house marks apart from the Superbru points', async () => {
    const { element, text } = await open('/home?round=1');
    const marks = Number(text('.tally strong')[0]);
    expect(text('.marks-label')).toEqual(['Your house marks · season']);
    expect(element.querySelectorAll('.sticks i.lit')).toHaveLength(Math.min(marks, 10));
    expect(element.querySelectorAll('.sticks i')).toHaveLength(marks > 5 ? 10 : 5);
  });
});
