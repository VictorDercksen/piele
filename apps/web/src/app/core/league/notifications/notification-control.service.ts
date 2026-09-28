import { DestroyRef, Service, effect, inject, untracked } from '@angular/core';
import { RoundUpdatesService } from '../../api/round-updates.service';
import { AlertService } from '../../feedback/alert.service';
import { LeagueData } from '../data/league-data';
import { LeagueContext } from '../league-context';
import { LeagueRecordsService } from '../league-records.service';
import { NotificationsRead } from '../league.models';
import { MemberService } from '../members/member.service';
import { NotificationService, TICK_MS } from './notification.service';

/** How often the panel refreshes while the tab is visible, and while a match is in play. */
export const IDLE_REFRESH_MS = 10 * 60_000;
export const LIVE_REFRESH_MS = 2 * 60_000;
/** Coming back to the tab refreshes only when the last refresh is older than this. */
export const FOCUS_REFRESH_MS = 2 * 60_000;
const MAX_READ_KEYS = 200;

/**
 * Marks notifications read and keeps the panel fresh: the feed and the followed rounds'
 * events load when the rounds change, every ten minutes while the tab is visible (two while
 * a match is in play), and on coming back to the tab.
 */
@Service()
export class NotificationControlService {
  /** The read state's saving, and the feed's refresh. */
  private readonly league = inject(LeagueData);
  private readonly notifications = inject(NotificationService);
  private readonly records = inject(LeagueRecordsService);
  private readonly members = inject(MemberService);
  private readonly context = inject(LeagueContext);
  private readonly updates = inject(RoundUpdatesService);
  private readonly alerts = inject(AlertService);

  private lastRefresh = 0;
  private refreshing: Promise<void> | null = null;
  /**
   * A read state the API did not accept, sent again with the next refresh while the same
   * league is shown (another league's read state is its own).
   */
  private unsaved: { readonly read: NotificationsRead; readonly league: string | null } | null =
    null;

  constructor() {
    const destroy = inject(DestroyRef);
    // The followed rounds change with the calendar; fetch their events when they do.
    effect(() => {
      const rounds = this.notifications.roundIds();
      if (!this.member()) return;
      this.lastRefresh = Date.now();
      untracked(() => void this.updates.load(rounds));
    });
    const timer = setInterval(() => this.tick(), TICK_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible' && this.since() >= FOCUS_REFRESH_MS)
        void this.refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    destroy.onDestroy(() => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    });
  }

  /** Moves the mark past everything shown. One write, and the exception keys can go. */
  markAllRead(): Promise<void> {
    const newest = this.notifications.stream().reduce((max, n) => Math.max(max, n.at), 0);
    return this.save({
      readAt: new Date(Math.max(this.notifications.now(), newest)).toISOString(),
      readKeys: [],
    });
  }

  /** Marks one item read without touching older ones. */
  markRead(key: string): Promise<void> {
    const read = this.notifications.read();
    const stream = this.notifications.stream();
    if (!stream.some((n) => n.key === key && n.unread)) return Promise.resolve();
    const mark = read.readAt ? Date.parse(read.readAt) : -Infinity;
    const above = new Set(stream.filter((n) => n.at > mark).map((n) => n.key));
    const keys = [key, ...read.readKeys.filter((k) => k !== key && above.has(k))].slice(
      0,
      MAX_READ_KEYS,
    );
    return this.save({ readAt: read.readAt, readKeys: keys });
  }

  /** Fetches the feed and the followed rounds' events now. */
  refresh(): Promise<void> {
    if (this.refreshing) return this.refreshing;
    this.lastRefresh = Date.now();
    const unsaved = this.unsaved?.league === this.context.slug() ? this.unsaved.read : null;
    this.unsaved = null;
    this.refreshing = Promise.allSettled([
      this.member() ? this.league.refreshFeed() : Promise.resolve(),
      this.member() ? this.updates.load(this.notifications.roundIds()) : Promise.resolve(),
      unsaved ? this.save(unsaved) : Promise.resolve(),
    ])
      .then(() => undefined)
      .finally(() => (this.refreshing = null));
    return this.refreshing;
  }

  private member(): boolean {
    return this.records.source !== 'api' || !!this.members.memberId();
  }

  private since(): number {
    return Date.now() - this.lastRefresh;
  }

  private tick(): void {
    if (document.visibilityState === 'hidden') return;
    if (this.since() >= (this.notifications.live() ? LIVE_REFRESH_MS : IDLE_REFRESH_MS))
      void this.refresh();
  }

  private async save(read: NotificationsRead): Promise<void> {
    try {
      await this.league.saveNotificationsRead(read);
    } catch (error) {
      this.unsaved = { read, league: this.context.slug() };
      this.alerts.error(
        error instanceof Error ? error.message : 'Your read notifications could not be saved.',
      );
    }
  }
}
