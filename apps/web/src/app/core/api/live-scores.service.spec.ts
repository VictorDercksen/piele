import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { environment } from '../../../environments/environment';
import { Fixture } from '../competition/competition.models';
import { LiveScoresService, inPlayWindow, withScore } from './live-scores.service';
import { MatchScore, RoundScores } from './match-centre.models';

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

function score(overrides: Partial<MatchScore> = {}): MatchScore {
  return {
    state: 'live',
    period: 'first half',
    minute: 31,
    clockRunning: true,
    home: { score: 10, halfTime: null },
    away: { score: 7, halfTime: null },
    ...overrides,
  };
}

describe('live score helpers', () => {
  it('opens the play window 15 minutes before kickoff and closes it three hours after', () => {
    const kickoff = Date.parse(FIXTURE.kickoffUtc!);
    expect(inPlayWindow(FIXTURE, kickoff - 16 * 60_000)).toBe(false);
    expect(inPlayWindow(FIXTURE, kickoff - 14 * 60_000)).toBe(true);
    expect(inPlayWindow(FIXTURE, kickoff + 179 * 60_000)).toBe(true);
    expect(inPlayWindow(FIXTURE, kickoff + 181 * 60_000)).toBe(false);
    expect(inPlayWindow({ ...FIXTURE, kickoffUtc: null }, kickoff)).toBe(false);
  });

  it('merges the state and a score line only once the match has started', () => {
    expect(withScore(FIXTURE, undefined)).toBe(FIXTURE);
    const live = withScore(FIXTURE, score());
    expect(live.state).toBe('live');
    expect(live.minute).toBe(31);
    expect(live.score).toBe('10–7');
    const waiting = withScore(FIXTURE, score({ state: 'scheduled', minute: null }));
    expect(waiting.score).toBeUndefined();
    const postponed = withScore(FIXTURE, score({ state: 'postponed' }));
    expect(postponed.score).toBeUndefined();
    expect(withScore(FIXTURE, score({ state: 'full_time' })).score).toBe('10–7');
  });

  it('advances the minute while the clock runs, at most five minutes ahead', () => {
    expect(withScore(FIXTURE, score(), 90_000).minute).toBe(32);
    expect(withScore(FIXTURE, score(), 20 * 60_000).minute).toBe(36);
    expect(withScore(FIXTURE, score({ clockRunning: false }), 90_000).minute).toBe(31);
    expect(withScore(FIXTURE, score({ state: 'half_time', minute: 40 }), 90_000).minute).toBe(40);
    expect(withScore(FIXTURE, score({ minute: null }), 90_000).minute).toBeNull();
  });
});

describe('LiveScoresService', () => {
  afterEach(() => vi.useRealTimers());

  function setup(now: string) {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    vi.setSystemTime(Date.parse(now));
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    const service = TestBed.inject(LiveScoresService);
    const http = TestBed.inject(HttpTestingController);
    return { service, http };
  }

  const url = `${environment.apiUrl}/v1/competitions/urc-2026-27/rounds/1/scores`;
  const round = (state: MatchScore['state']): RoundScores => ({
    round: 1,
    generatedAt: '2026-09-25T19:30:00Z',
    status: 'ok',
    source: 'URC match centre',
    fetchedAt: '2026-09-25T19:30:00Z',
    matches: [{ fixtureId: FIXTURE.id, ...score({ state }) }],
  });

  it('makes no request before the round starts', async () => {
    const { service, http } = setup('2026-09-24T12:00:00Z');
    await TestBed.inject(ApplicationRef).whenStable();
    http.expectNone(url);
    expect(service.polling()).toBe(false);
    expect(service.merge(FIXTURE)).toBe(FIXTURE);
  });

  it('polls a live round and keeps the last scores through a failed refresh', async () => {
    const { service, http } = setup('2026-09-25T19:30:00Z');
    TestBed.tick();
    http.expectOne(url).flush(round('live'));
    await TestBed.inject(ApplicationRef).whenStable();
    expect(service.merge(FIXTURE).score).toBe('10–7');
    expect(service.polling()).toBe(true);

    vi.advanceTimersByTime(30_000);
    TestBed.tick();
    http.expectOne(url).flush('down', { status: 503, statusText: 'Unavailable' });
    await TestBed.inject(ApplicationRef).whenStable();
    expect(service.merge(FIXTURE).state).toBe('live');
    expect(service.tick()).toBe(1);

    vi.advanceTimersByTime(30_000);
    TestBed.tick();
    http.expectOne(url).flush(round('full_time'));
    await TestBed.inject(ApplicationRef).whenStable();
    // Other round one fixtures are still to come, so polling continues only in their window.
    expect(service.merge(FIXTURE).state).toBe('full_time');
    http.verify();
  });
});
