import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import { CompetitionService } from '../../competition/competition.service';
import { LeagueTime } from '../../competition/league-time';
import { LeagueContext } from '../../league/league-context';
import { Notice, NotificationsService, PinnedNotice } from '../../league/notifications.service';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideArrowRight } from '@ng-icons/lucide';
import { Icon } from '../../../shared/icon/icon';

/** Rod extension plus the fabric drop, ripple and settle. Matches the stylesheet timings. */
const UNFURL_MS = 1800;

/**
 * The current round's log on a flag that unrolls from the notification button: league
 * events, teamsheets, previews, kick-offs and results, with the member's duty and poll
 * pinned above. In-app only, per the plan's notification default.
 */
@Component({
  selector: 'app-notifications-flag',
  templateUrl: './notifications-flag.html',
  styleUrl: './notifications-flag.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon, NgIcon],
  viewProviders: [provideIcons({ lucideArrowRight })],
  host: {
    '[class.open]': 'open()',
    '[class.settled]': 'settled()',
    '(document:keydown.escape)': 'onEscape()',
    '(document:pointerdown)': 'onPointerDown($event)',
  },
})
export class NotificationsFlag {
  private readonly router = inject(Router);
  private readonly context = inject(LeagueContext);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly notifications = inject(NotificationsService);
  private readonly competition = inject(CompetitionService);
  private readonly time = inject(LeagueTime);
  private readonly trigger = viewChild.required<ElementRef<HTMLButtonElement>>('trigger');
  private readonly ripple = viewChild.required<ElementRef<SVGElement>>('ripple');

  readonly open = signal(false);
  /** True once the fabric has come to rest, so the flag renders without animation filters. */
  readonly settled = signal(false);
  private settleTimer: ReturnType<typeof setTimeout> | undefined;

  readonly round = this.notifications.currentRound;
  readonly emblem = computed(() => this.competition.current().emblem);
  readonly competitionName = computed(() => this.competition.current().name);
  readonly pinned = this.notifications.pinned;
  readonly items = this.notifications.stream;
  readonly unread = this.notifications.unread;
  readonly stale = this.notifications.stale;
  readonly badge = computed(() => (this.unread() > 99 ? '99+' : String(this.unread())));
  readonly triggerLabel = computed(() => {
    const count = this.unread();
    return `${this.open() ? 'Close' : 'Open'} notifications${count ? `, ${count} unread` : ''}`;
  });
  /**
   * Where the read items start after the unread ones, so the list can say "Earlier". Only
   * when the read items are the whole tail: an item read on its own above newer ones gets
   * no divider, just no dot.
   */
  readonly earlierAt = computed(() => {
    const items = this.items();
    const first = items.findIndex((item) => !item.unread);
    if (first <= 0) return -1;
    return items.slice(first).every((item) => !item.unread) ? first : -1;
  });
  /** The next kick-off of the current round, for the empty state. */
  readonly nextKickoff = computed(() => {
    const now = Date.now();
    const next = this.round()
      .fixtures.filter((f) => !!f.kickoffUtc && Date.parse(f.kickoffUtc) > now)
      .sort((a, b) => a.kickoffUtc!.localeCompare(b.kickoffUtc!))[0];
    return next ? `${next.home} v ${next.away}, ${this.time.format(next.kickoffUtc)}` : null;
  });

  constructor() {
    effect(() => {
      if (this.open()) this.unfurl();
      else this.rest();
    });
    inject(DestroyRef).onDestroy(() => clearTimeout(this.settleTimer));
  }

  toggle(): void {
    this.open.set(!this.open());
  }

  close(): void {
    if (!this.open()) return;
    this.open.set(false);
    this.trigger().nativeElement.focus();
  }

  markAllRead(): void {
    void this.notifications.markAllRead();
  }

  markRead(item: Notice): void {
    void this.notifications.markRead(item.key);
  }

  /** Following a notice reads it and goes to its page in the notice's round. */
  follow(item: Notice): void {
    void this.notifications.markRead(item.key);
    if (item.path) this.go(item.path, item.round);
  }

  followPinned(item: PinnedNotice): void {
    this.go(item.path, item.round);
  }

  /** The whole log lives on the clubhouse page. */
  openFeed(): void {
    this.go('/', this.round().id);
  }

  onEscape(): void {
    this.close();
  }

  onPointerDown(event: Event): void {
    if (this.open() && !event.composedPath().includes(this.host.nativeElement))
      this.open.set(false);
  }

  private go(path: string, round: number | null): void {
    this.close();
    void this.router.navigate([this.context.url(path)], {
      queryParams: round !== null ? { round } : {},
      queryParamsHandling: 'merge',
    });
  }

  /** Closing rolls the cloth back up, so the roll shows again. */
  private rest(): void {
    clearTimeout(this.settleTimer);
    this.settled.set(false);
  }

  /** Restart the cloth ripple with every opening and drop the filter once the fabric is at rest. */
  private unfurl(): void {
    clearTimeout(this.settleTimer);
    this.settled.set(false);
    const reduced = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    if (reduced) {
      this.settled.set(true);
      return;
    }
    this.ripple()
      .nativeElement.querySelectorAll<SVGAnimateElement>('animate')
      .forEach((animation) => animation.beginElement?.());
    this.settleTimer = setTimeout(() => this.settled.set(true), UNFURL_MS);
  }
}
