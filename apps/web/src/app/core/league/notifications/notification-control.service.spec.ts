import { AlertService } from '../../feedback/alert.service';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { CompetitionService } from '../../competition/competition.service';
import { competition } from '../../competition/registry';
import { ProfileControlService } from '../../profile/profile-control.service';
import { LeagueContext } from '../league-context';
import { LeagueData } from '../data/league-data';
import { SampleLeagueData } from '../data/sample-league-data';
import {
  IDLE_REFRESH_MS,
  LIVE_REFRESH_MS,
  NotificationControlService,
} from './notification-control.service';
import { NotificationService } from './notification.service';

const URC = competition('urc-2026-27');

describe('NotificationControlService', () => {
  async function setup(now: string, round = URC.currentRoundId(Date.parse(now))) {
    TestBed.resetTestingModule();
    vi.useFakeTimers({
      toFake: ['Date', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'],
    });
    vi.setSystemTime(Date.parse(now));
    localStorage.clear();
    const rounds = URC.buildRounds(round);
    class Frozen extends CompetitionService {
      override get currentRoundId() {
        return round;
      }
      override get rounds() {
        return rounds;
      }
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
    const context = TestBed.inject(LeagueContext);
    await context.ensureAccount();
    await context.select('piele');
    // The member supports the Stormers, so their match is highlighted in every round.
    await TestBed.inject(ProfileControlService).save({
      displayName: 'Test Member',
      teamId: 'dhl-stormers',
      photo: null,
    });
    return {
      notifications: TestBed.inject(NotificationService),
      control: TestBed.inject(NotificationControlService),
    };
  }

  afterEach(() => vi.useRealTimers());

  it('marks one item read without touching the rest, then everything at once', async () => {
    const { notifications: service, control } = await setup('2026-10-05T10:00:00Z', 2);
    await control.markRead('feed:feed-8');
    expect(service.unread()).toBe(7);
    expect(service.read()).toEqual({ readAt: null, readKeys: ['feed:feed-8'] });
    await control.markRead('feed:feed-8');
    expect(service.read().readKeys).toEqual(['feed:feed-8']);

    await control.markAllRead();
    expect(service.unread()).toBe(0);
    expect(service.read()).toEqual({ readAt: '2026-10-05T10:00:00.000Z', readKeys: [] });
    expect(JSON.parse(localStorage.getItem('pavilion-notifications-read-v2:piele')!).readAt).toBe(
      '2026-10-05T10:00:00.000Z',
    );
  });

  it('sends a read state the API refused again with the next refresh', async () => {
    const { control } = await setup('2026-10-05T10:00:00Z', 2);
    const league = TestBed.inject(LeagueData);
    const saves = vi
      .spyOn(league, 'saveNotificationsRead')
      .mockRejectedValueOnce(new Error('The league is unreachable.'));
    await control.markAllRead();
    expect(saves).toHaveBeenCalledTimes(1);
    await control.refresh();
    expect(saves).toHaveBeenCalledTimes(2);
    expect(saves.mock.calls[1][0]).toEqual(saves.mock.calls[0][0]);
    await control.refresh();
    expect(saves).toHaveBeenCalledTimes(2);
  });

  it('reports blocked browser persistence and retries the read state after storage recovers', async () => {
    const { control } = await setup('2026-10-05T10:00:00Z', 2);
    const storage = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    await control.markAllRead();
    expect(
      TestBed.inject(AlertService)
        .alerts()
        .some((a) => a.severity === 'error' && a.message.includes('read notifications')),
    ).toBe(true);
    storage.mockRestore();
    await control.refresh();
    expect(localStorage.getItem('pavilion-notifications-read-v2:piele')).toContain('readAt');
  });

  it('drops a refused read state once another league is shown', async () => {
    const { control } = await setup('2026-10-05T10:00:00Z', 2);
    const league = TestBed.inject(LeagueData);
    const context = TestBed.inject(LeagueContext);
    const saves = vi
      .spyOn(league, 'saveNotificationsRead')
      .mockRejectedValueOnce(new Error('The league is unreachable.'));
    await control.markAllRead();
    vi.spyOn(context, 'slug').mockReturnValue('pofadder-bowl');
    await control.refresh();
    expect(saves).toHaveBeenCalledTimes(1);
  });

  it('refreshes every ten minutes while idle and every two while a match is on', async () => {
    const { control } = await setup('2026-10-05T10:00:00Z', 2);
    const league = TestBed.inject(LeagueData);
    const refreshes = vi.spyOn(league, 'refreshFeed');
    await control.refresh();
    expect(refreshes).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(IDLE_REFRESH_MS - 60_000);
    expect(refreshes).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(60_000);
    expect(refreshes).toHaveBeenCalledTimes(2);

    // Ten minutes before Round 2’s first kick-off the play window opens.
    const { notifications: live, control: liveControl } = await setup('2026-10-02T18:35:00Z', 2);
    const liveLeague = TestBed.inject(LeagueData);
    const liveRefreshes = vi.spyOn(liveLeague, 'refreshFeed');
    await liveControl.refresh();
    expect(live.live()).toBe(true);
    vi.advanceTimersByTime(LIVE_REFRESH_MS);
    expect(liveRefreshes).toHaveBeenCalledTimes(2);
  });
});
