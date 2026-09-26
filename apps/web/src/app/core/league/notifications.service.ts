import { DestroyRef, Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { RoundEvent } from '../api/match-centre.models';
import { inPlayWindow } from '../api/live-scores.service';
import { RoundUpdatesService } from '../api/round-updates.service';
import { CompetitionRound, Fixture } from '../competition/competition.models';
import { CompetitionService } from '../competition/competition.service';
import { DEFAULT_ZONE, LeagueTime, zoneAbbreviation } from '../competition/league-time';
import { ToastService } from '../feedback/toast.service';
import { ProfileStore } from '../profile/profile.store';
import { feedIcon, feedLabel, feedPath } from './feed-presentation';
import { LeagueData } from './league-data';
import { FeedItem, NotificationsRead } from './league.models';
import { RoundViewService } from './round-view.service';

/** League events from other rounds stay in the panel this long; fixtures this close count. */
export const RECENT_MS = 7 * 24 * 60 * 60_000;
/** How often the panel refreshes while the tab is visible, and while a match is in play. */
export const IDLE_REFRESH_MS = 10 * 60_000;
export const LIVE_REFRESH_MS = 2 * 60_000;
/** Coming back to the tab refreshes only when the last refresh is older than this. */
export const FOCUS_REFRESH_MS = 2 * 60_000;
const TICK_MS = 60_000;
const MAX_ITEMS = 40;
const MAX_READ_KEYS = 200;

/**
 * The notifications panel's content: the league's transaction log and the competition's
 * milestones for the current round, plus the member's pinned duty and poll. Read state is a
 * high-water mark and the keys read individually above it (see `NotificationsRead`).
 */
@Injectable({ providedIn: 'root' })
export class NotificationsService {
  private readonly league = inject(LeagueData);
  private readonly competition = inject(CompetitionService);
  private readonly time = inject(LeagueTime);
  private readonly profile = inject(ProfileStore);
  private readonly view = inject(RoundViewService);
  private readonly updates = inject(RoundUpdatesService);
  private readonly toast = inject(ToastService);

  /** Advances every minute so windows open and relative times move. */
  private readonly now = signal(Date.now());
  private lastRefresh = 0;
  private refreshing: Promise<void> | null = null;

  readonly currentRound = computed(() => this.competition.round(this.competition.currentRoundId)!);
  /**
   * The rounds the panel follows: the current one, plus any other round with a fixture
   * within a week, because a rescheduled match can land in another round's window.
   */
  readonly rounds = computed<readonly CompetitionRound[]>(() => {
    const now = this.now();
    const current = this.currentRound();
    const others = this.competition.rounds.filter(
      (round) =>
        round.id !== current.id &&
        round.fixtures.some(
          (f) => !!f.kickoffUtc && Math.abs(Date.parse(f.kickoffUtc) - now) <= RECENT_MS,
        ),
    );
    return [current, ...others];
  });
  /** Compared by value, so the minute tick does not refetch the rounds' events. */
  private readonly roundIds = computed(() => this.rounds().map((round) => round.id), {
    equal: (a, b) => a.length === b.length && a.every((id, i) => id === b[i]),
  });
  /** Fixtures that get their own line: the favourite team's and the featured one. */
  private readonly highlighted = computed<ReadonlySet<string>>(() => {
    const team = this.profile.profile()?.teamId;
    const featured = this.view.featured()?.id;
    const ids = new Set<string>();
    for (const round of this.rounds())
      for (const fixture of round.fixtures) {
        if (team && (fixture.homeAsset === team || fixture.awayAsset === team)) ids.add(fixture.id);
        if (fixture.id === featured) ids.add(fixture.id);
      }
    return ids;
  });

  readonly read = this.league.notificationsRead;

  /** The member's live duties and the current round's poll, kept at the top and never counted. */
  readonly pinned = computed<PinnedNotice[]>(() => {
    const current = this.currentRound();
    const items: PinnedNotice[] = this.view
      .seasonDuties()
      .filter((duty) => duty.mine && duty.status !== 'voided' && duty.status !== 'completed')
      .map((duty) => ({
        key: `duty:${duty.id}`,
        icon: 'duties',
        title: duty.title,
        detail:
          duty.display === 'overdue'
            ? `Overdue since ${this.time.format(duty.deadlineAt)} · ${duty.marks.marks} ${duty.marks.marks === 1 ? 'mark' : 'marks'}`
            : `${duty.statusLabel} · due ${this.time.format(duty.deadlineAt)}`,
        action: 'View duty',
        path: '/duties',
        round: duty.roundId,
        spoon: duty.spoon,
      }));
    const poll = this.league.polls().find((p) => p.roundId === current.id);
    if (poll)
      items.push({
        key: `poll:${poll.id}`,
        icon: 'decisions',
        title: poll.question,
        detail: poll.myChoice ? 'Your choice is recorded.' : `${poll.status} · ${poll.closes}`,
        action: 'View decision',
        path: '/decisions',
        round: poll.roundId,
        spoon: false,
      });
    return items;
  });

  /** Everything that happened, newest first, with the member's read state applied. */
  readonly stream = computed<Notice[]>(() => {
    const now = this.now();
    const current = this.currentRound();
    const rounds = this.roundIds();
    const recent = (iso: string) => now - Date.parse(iso) <= RECENT_MS;
    const fixtures = new Map<string, LocatedFixture>();
    for (const round of this.rounds())
      for (const fixture of round.fixtures) fixtures.set(fixture.id, { fixture, round: round.id });
    const league = this.league
      .feed()
      .filter(
        (item) =>
          (item.roundId !== null && rounds.includes(item.roundId)) || recent(item.occurredAt),
      )
      .map((item) => feedNotice(item));
    const competition = competitionNotices(
      this.updates.events().filter((event) => fixtures.has(event.fixtureId)),
      fixtures,
      this.highlighted(),
      this.time.zone(),
    );
    const read = this.read();
    return [...league, ...competition]
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
      .slice(0, MAX_ITEMS)
      .map((notice) => ({
        ...notice,
        when: this.time.relative(notice.occurredAt, new Date(now)),
        roundLabel:
          notice.round !== null && notice.round !== current.id
            ? `R${this.competition.round(notice.round)?.code ?? notice.round}`
            : null,
        unread: isUnread(read, notice.key, notice.occurredAt),
      }));
  });
  readonly unread = computed(() => this.stream().filter((notice) => notice.unread).length);
  /** True while a followed match is in its play window, when refreshes come sooner. */
  readonly live = computed(() => {
    const now = this.now();
    return this.rounds().some((round) => round.fixtures.some((f) => inPlayWindow(f, now)));
  });
  readonly stale = this.updates.stale;

  constructor() {
    const destroy = inject(DestroyRef);
    // The followed rounds change with the calendar; fetch their events when they do.
    effect(() => {
      const rounds = this.roundIds();
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
    const newest = this.stream().reduce((max, n) => (n.occurredAt > max ? n.occurredAt : max), '');
    const now = new Date(this.now()).toISOString();
    return this.save({ readAt: newest > now ? newest : now, readKeys: [] });
  }

  /** Marks one item read without touching older ones. */
  markRead(key: string): Promise<void> {
    const read = this.read();
    if (!this.stream().some((n) => n.key === key && n.unread)) return Promise.resolve();
    const above = new Set(
      this.stream()
        .filter((n) => !read.readAt || n.occurredAt > read.readAt)
        .map((n) => n.key),
    );
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
    this.refreshing = Promise.allSettled([
      this.member() ? this.league.refreshFeed() : Promise.resolve(),
      this.member() ? this.updates.load(this.roundIds()) : Promise.resolve(),
    ])
      .then(() => undefined)
      .finally(() => (this.refreshing = null));
    return this.refreshing;
  }

  private member(): boolean {
    return this.league.source !== 'api' || !!this.league.currentMemberId();
  }

  private since(): number {
    return Date.now() - this.lastRefresh;
  }

  private tick(): void {
    this.now.set(Date.now());
    if (document.visibilityState === 'hidden') return;
    if (this.since() >= (this.live() ? LIVE_REFRESH_MS : IDLE_REFRESH_MS)) void this.refresh();
  }

  private async save(read: NotificationsRead): Promise<void> {
    try {
      await this.league.saveNotificationsRead(read);
    } catch (error) {
      this.toast.show(
        error instanceof Error ? error.message : 'Your read notifications could not be saved.',
      );
    }
  }
}

export interface PinnedNotice {
  readonly key: string;
  readonly icon: string;
  readonly title: string;
  readonly detail: string;
  readonly action: string;
  readonly path: string;
  readonly round: number | null;
  readonly spoon: boolean;
}

export interface LocatedFixture {
  readonly fixture: Fixture;
  readonly round: number;
}

export interface Notice {
  readonly key: string;
  readonly kind: string;
  readonly icon: string;
  readonly label: string;
  readonly title: string;
  readonly detail: string;
  readonly occurredAt: string;
  readonly path: string | null;
  /** The link's wording, when there is a link. */
  readonly action: string | null;
  readonly round: number | null;
  readonly when?: string;
  readonly roundLabel?: string | null;
  readonly unread?: boolean;
}

/** Read when at or before the mark, or read on its own. */
export function isUnread(read: NotificationsRead, key: string, occurredAt: string): boolean {
  if (read.readKeys.includes(key)) return false;
  return !read.readAt || occurredAt > read.readAt;
}

const FEED_ACTIONS: Record<string, string> = {
  '/duties': 'View duties',
  '/decisions': 'View decision',
  '/standings': 'View standings',
};

export function feedNotice(item: FeedItem): Notice {
  const path = feedPath(item);
  return {
    key: `feed:${item.id}`,
    kind: item.kind,
    icon: feedIcon(item.kind),
    label: feedLabel(item.kind),
    title: item.title,
    detail: item.detail,
    occurredAt: item.occurredAt,
    path,
    action: path ? (FEED_ACTIONS[path] ?? 'Open') : null,
    round: item.roundId,
  };
}

const EVENT_ICONS: Record<RoundEvent['kind'], string> = {
  teamsheets_published: 'duties',
  preview_published: 'book',
  kicked_off: 'clock',
  full_time: 'standings',
};
const EVENT_LABELS: Record<RoundEvent['kind'], string> = {
  teamsheets_published: 'TEAMSHEETS',
  preview_published: 'PAVILION PREVIEW',
  kicked_off: 'KICK-OFF',
  full_time: 'FULL TIME',
};

/**
 * Competition events as notices. Highlighted fixtures get a line each; the rest of a
 * round's events of one kind fold into one line whose key changes as fixtures join it, so
 * it reads as new again when it grows.
 */
export function competitionNotices(
  events: readonly RoundEvent[],
  fixtures: ReadonlyMap<string, LocatedFixture>,
  highlighted: ReadonlySet<string>,
  zone = DEFAULT_ZONE,
): Notice[] {
  const notices: Notice[] = [];
  const groups = new Map<string, { round: number; events: RoundEvent[] }>();
  for (const event of events) {
    const located = fixtures.get(event.fixtureId);
    if (!located) continue;
    if (highlighted.has(located.fixture.id)) {
      notices.push(fixtureNotice(event, located, zone));
      continue;
    }
    const groupKey = `${located.round}:${event.kind}`;
    const group = groups.get(groupKey) ?? { round: located.round, events: [] };
    group.events.push(event);
    groups.set(groupKey, group);
  }
  const single = notices.slice();
  for (const { round, events: grouped } of groups.values()) {
    if (grouped.length === 1) {
      notices.push(fixtureNotice(grouped[0], fixtures.get(grouped[0].fixtureId)!, zone));
      continue;
    }
    const kind = grouped[0].kind;
    const ids = grouped.map((e) => e.fixtureId).sort();
    const matches = grouped
      .slice()
      .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))
      .map((e) => scoreline(e, fixtures.get(e.fixtureId)!.fixture));
    const more = single.some((n) => n.kind === kind && n.round === round);
    notices.push({
      key: `round:${round}:${kind}:${ids.join('.')}`,
      kind,
      icon: EVENT_ICONS[kind],
      label: EVENT_LABELS[kind],
      title: GROUP_TITLES[kind](grouped.length, more),
      detail: matches.join(' · '),
      occurredAt: grouped.reduce((max, e) => (e.occurredAt > max ? e.occurredAt : max), ''),
      path: '/',
      action: 'View the round',
      round,
    });
  }
  return notices;
}

const GROUP_TITLES: Record<RoundEvent['kind'], (n: number, more: boolean) => string> = {
  teamsheets_published: (n, more) => `Teamsheets are in for ${n} ${more ? 'more ' : ''}matches.`,
  preview_published: (n, more) => `${n} ${more ? 'more ' : ''}Pavilion previews are ready.`,
  kicked_off: (n, more) => `${n} ${more ? 'more ' : ''}matches are under way.`,
  full_time: (n, more) => `Full time in ${n} ${more ? 'more ' : ''}matches.`,
};

function fixtureNotice(
  event: RoundEvent,
  { fixture, round }: LocatedFixture,
  zone: string,
): Notice {
  const pair = `${fixture.home} v ${fixture.away}`;
  const when = `${fixture.day} · ${fixture.time} ${zoneAbbreviation(zone, fixture.kickoffUtc)}`;
  const text: Record<RoundEvent['kind'], [string, string]> = {
    teamsheets_published: [`${pair}: teamsheets are in.`, `${when} · ${fixture.venue}`],
    preview_published: [`${pair}: the Pavilion preview is ready.`, `${when} · ${fixture.venue}`],
    kicked_off: [`${pair} is under way.`, fixture.venue],
    full_time: [`${scoreline(event, fixture)}.`, `Full time at ${fixture.venue}`],
  };
  const [title, detail] = text[event.kind];
  const revision = event.kind === 'preview_published' && event.revision ? `:${event.revision}` : '';
  return {
    key: `fixture:${fixture.id}:${event.kind}${revision}`,
    kind: event.kind,
    icon: EVENT_ICONS[event.kind],
    label: EVENT_LABELS[event.kind],
    title,
    detail,
    occurredAt: event.occurredAt,
    path: `/match/${fixture.id}`,
    action: 'Open the match centre',
    round,
  };
}

/** `Home 24–19 Away` at full time with a known score, else `Home v Away`. */
function scoreline(event: RoundEvent, fixture: Fixture): string {
  if (event.kind === 'full_time' && event.homeScore != null && event.awayScore != null)
    return `${fixture.home} ${event.homeScore}–${event.awayScore} ${fixture.away}`;
  return `${fixture.home} v ${fixture.away}`;
}
