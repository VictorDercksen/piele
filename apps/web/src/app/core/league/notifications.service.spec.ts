import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RoundEvent } from '../api/match-centre.models';
import {
  CompetitionService,
  buildRounds,
  currentRoundId,
} from '../competition/competition.service';
import { ProfileStore } from '../profile/profile.store';
import { LeagueData } from './league-data';
import {
  IDLE_REFRESH_MS,
  LIVE_REFRESH_MS,
  LocatedFixture,
  NotificationsService,
  competitionNotices,
  isUnread,
} from './notifications.service';
import { SampleLeagueData } from './sample-league-data';

/** The published rounds, seen from a chosen moment. */
function located(...roundIds: number[]): Map<string, LocatedFixture> {
  const map = new Map<string, LocatedFixture>();
  for (const round of buildRounds(1))
    if (roundIds.includes(round.id))
      for (const fixture of round.fixtures) map.set(fixture.id, { fixture, round: round.id });
  return map;
}

const ROUND_ONE = [...located(1).values()].map((l) => l.fixture);
const [BENETTON, SECOND, THIRD] = ROUND_ONE;

function event(
  kind: RoundEvent['kind'],
  fixtureId: string,
  occurredAt: string,
  extra: Partial<RoundEvent> = {},
): RoundEvent {
  return { kind, fixtureId, occurredAt, ...extra };
}

describe('read state', () => {
  it('treats items at or before the mark, or read on their own, as read', () => {
    const read = { readAt: '2026-09-25T12:00:00Z', readKeys: ['feed:x'] };
    expect(isUnread(read, 'feed:a', '2026-09-25T12:00:00Z')).toBe(false);
    expect(isUnread(read, 'feed:a', '2026-09-25T12:00:01Z')).toBe(true);
    expect(isUnread(read, 'feed:x', '2026-09-26T12:00:00Z')).toBe(false);
    expect(isUnread({ readAt: null, readKeys: [] }, 'feed:a', '2020-01-01T00:00:00Z')).toBe(true);
  });
});

describe('competition notices', () => {
  it('gives highlighted fixtures a line each and folds the rest per kind', () => {
    const events = [
      event('teamsheets_published', BENETTON.id, '2026-09-23T10:00:00Z'),
      event('teamsheets_published', SECOND.id, '2026-09-23T11:00:00Z'),
      event('teamsheets_published', THIRD.id, '2026-09-23T12:00:00Z'),
      event('preview_published', SECOND.id, '2026-09-24T09:00:00Z', { revision: 1 }),
    ];
    const notices = competitionNotices(events, located(1), new Set([BENETTON.id]));
    expect(notices.map((n) => n.key)).toEqual([
      `fixture:${BENETTON.id}:teamsheets_published`,
      `round:1:teamsheets_published:${[SECOND.id, THIRD.id].sort().join('.')}`,
      `fixture:${SECOND.id}:preview_published:1`,
    ]);
    expect(notices[0].title).toBe('Benetton v Dragons: teamsheets are in.');
    expect(notices[0].path).toBe(`/match/${BENETTON.id}`);
    const group = notices[1];
    expect(group.title).toBe('Teamsheets are in for 2 more matches.');
    expect(group.detail).toBe(`${SECOND.home} v ${SECOND.away} · ${THIRD.home} v ${THIRD.away}`);
    expect(group.occurredAt).toBe('2026-09-23T12:00:00Z');
    expect(group.path).toBe('/');
    // A single leftover fixture is not a group, and without a highlighted line it is not "more".
    const two = competitionNotices(events.slice(1, 3), located(1), new Set());
    expect(two[0].title).toBe('Teamsheets are in for 2 matches.');
  });

  it('reads the result off full time and infers nothing for unknown fixtures', () => {
    const notices = competitionNotices(
      [
        event('kicked_off', BENETTON.id, BENETTON.kickoffUtc!),
        event('full_time', BENETTON.id, '2026-09-25T20:30:00Z', { homeScore: 24, awayScore: 19 }),
        event('full_time', 'nope', '2026-09-25T20:30:00Z'),
      ],
      located(1),
      new Set([BENETTON.id]),
    );
    expect(notices.map((n) => n.title)).toEqual([
      'Benetton v Dragons is under way.',
      'Benetton 24–19 Dragons.',
    ]);
    expect(notices[1].label).toBe('FULL TIME');
  });
});

describe('NotificationsService', () => {
  function setup(now: string, round = currentRoundId(Date.parse(now))) {
    TestBed.resetTestingModule();
    vi.useFakeTimers({
      toFake: ['Date', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'],
    });
    vi.setSystemTime(Date.parse(now));
    localStorage.clear();
    class Frozen extends CompetitionService {
      override readonly currentRoundId = round;
      override readonly rounds = buildRounds(round);
    }
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: LeagueData, useClass: SampleLeagueData },
        { provide: CompetitionService, useClass: Frozen },
      ],
    });
    return TestBed.inject(NotificationsService);
  }

  afterEach(() => vi.useRealTimers());

  it('shows the current round and the last week, with the member’s duty and poll pinned', () => {
    const service = setup('2026-10-05T10:00:00Z', 2);
    // Round 3 kicks off within the week, so its teamsheets and previews are followed too.
    expect(service.rounds().map((r) => r.id)).toEqual([2, 3]);
    expect(service.pinned().map((p) => p.key)).toEqual(['duty:duty-2', 'poll:poll-2']);
    const keys = service.stream().map((n) => n.key);
    expect(keys).toEqual([
      'feed:feed-9',
      'feed:feed-7',
      'feed:feed-8',
      'feed:feed-6',
      'feed:feed-5',
    ]);
    expect(service.unread()).toBe(5);
    expect(service.stream()[0].label).toBe('EVIDENCE');
    expect(service.stream()[0].action).toBe('View duties');
    expect(service.stream().every((n) => n.roundLabel === null)).toBe(true);
  });

  it('keeps an earlier round’s events for a week and labels them', () => {
    const service = setup('2026-09-28T10:00:00Z', 2);
    const keys = service.stream().map((n) => n.key);
    expect(keys).toContain('feed:feed-4'); // Franco’s Round 01 duty, accepted the day before
    expect(keys).not.toContain('feed:feed-1'); // the season opening, eight days earlier
    expect(service.stream().find((n) => n.key === 'feed:feed-4')?.roundLabel).toBe('R01');
  });

  it('follows another round while one of its matches falls in this week', () => {
    // Round 8 has a match on 21 Feb 2027, after rounds 9 to 11. On that day the calendar
    // makes Round 8 current again while Round 12 kicks off within the week.
    const service = setup('2027-02-21T10:00:00Z');
    expect(service.currentRound().id).toBe(8);
    expect(service.rounds().map((r) => r.id)).toEqual([8, 12]);
    // A week after Round 8's regular weekend, Round 9 is current and Round 8's results stay.
    const january = setup('2027-01-02T10:00:00Z');
    expect(january.rounds().map((r) => r.id)).toEqual([9, 8]);
    expect(
      setup('2027-01-15T10:00:00Z')
        .rounds()
        .map((r) => r.id),
    ).toEqual([10]);
  });

  it('marks one item read without touching the rest, then everything at once', async () => {
    const service = setup('2026-10-05T10:00:00Z', 2);
    await service.markRead('feed:feed-8');
    expect(service.unread()).toBe(4);
    expect(service.read()).toEqual({ readAt: null, readKeys: ['feed:feed-8'] });
    await service.markRead('feed:feed-8');
    expect(service.read().readKeys).toEqual(['feed:feed-8']);

    await service.markAllRead();
    expect(service.unread()).toBe(0);
    expect(service.read()).toEqual({ readAt: '2026-10-05T10:00:00.000Z', readKeys: [] });
    expect(JSON.parse(localStorage.getItem('pavilion-notifications-read-v2')!).readAt).toBe(
      '2026-10-05T10:00:00.000Z',
    );
  });

  it('refreshes every ten minutes while idle and every two while a match is on', async () => {
    const service = setup('2026-10-05T10:00:00Z', 2);
    const league = TestBed.inject(LeagueData);
    const refreshes = vi.spyOn(league, 'refreshFeed');
    await service.refresh();
    expect(refreshes).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(IDLE_REFRESH_MS - 60_000);
    expect(refreshes).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(60_000);
    expect(refreshes).toHaveBeenCalledTimes(2);

    // Ten minutes before Round 2’s first kick-off the play window opens.
    const live = setup('2026-10-02T18:35:00Z', 2);
    const liveLeague = TestBed.inject(LeagueData);
    const liveRefreshes = vi.spyOn(liveLeague, 'refreshFeed');
    await live.refresh();
    expect(live.live()).toBe(true);
    vi.advanceTimersByTime(LIVE_REFRESH_MS);
    expect(liveRefreshes).toHaveBeenCalledTimes(2);
  });
});
