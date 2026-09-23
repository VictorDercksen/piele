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
import { RoundViewService } from '../../league/round-view.service';
import { Icon } from '../../../shared/icon/icon';

const READ_KEY = 'piele-notifications-read-v1';
/** Rod extension plus the fabric drop, ripple and settle. Matches the stylesheet timings. */
const UNFURL_MS = 1800;

/**
 * Round-scoped updates on a flag that unrolls from the notification button.
 * In-app only, per the plan's notification default. Read status stays in the browser.
 */
@Component({
  selector: 'app-notifications-flag',
  templateUrl: './notifications-flag.html',
  styleUrl: './notifications-flag.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon],
  host: {
    '[class.open]': 'open()',
    '[class.settled]': 'settled()',
    '(document:keydown.escape)': 'onEscape()',
    '(document:pointerdown)': 'onPointerDown($event)',
  },
})
export class NotificationsFlag {
  private readonly router = inject(Router);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly view = inject(RoundViewService);
  private readonly trigger = viewChild.required<ElementRef<HTMLButtonElement>>('trigger');
  private readonly ripple = viewChild.required<ElementRef<SVGElement>>('ripple');

  readonly open = signal(false);
  /** True once the fabric has come to rest, so the flag renders without animation filters. */
  readonly settled = signal(false);
  private settleTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly read = signal<ReadonlySet<string>>(readStoredKeys());

  readonly items = computed<FlagNotification[]>(() => {
    const round = this.view.round();
    const duty = this.view.myDuty();
    const poll = this.view.poll();
    const items: FlagNotification[] = [
      {
        key: `round:${round.id}:${round.status}`,
        icon: 'rounds',
        title: round.status,
        detail: this.view.activity(),
        action: 'View round fixtures →',
        path: '/rounds',
        spoon: false,
      },
    ];
    if (duty) {
      items.push({
        key: `duty:${duty.id}:${duty.deadline}`,
        icon: 'duties',
        title: duty.title,
        detail: `Due ${duty.deadline}`,
        action: 'View duty →',
        path: '/duties',
        spoon: duty.spoon,
      });
    }
    if (poll) {
      items.push({
        key: `poll:${poll.id}:${poll.status}`,
        icon: 'decisions',
        title: poll.question,
        detail: `${poll.status} · ${poll.closes}`,
        action: 'View decision →',
        path: '/decisions',
        spoon: false,
      });
    }
    return items.map((item) => ({ ...item, unread: !this.read().has(item.key) }));
  });
  readonly unread = computed(() => this.items().filter((item) => item.unread).length);
  readonly badge = computed(() => (this.unread() > 99 ? '99+' : String(this.unread())));
  readonly triggerLabel = computed(() => {
    const count = this.unread();
    return `${this.open() ? 'Close' : 'Open'} notifications${count ? `, ${count} unread` : ''}`;
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
    const keys = new Set(this.read());
    for (const item of this.items()) keys.add(item.key);
    this.read.set(keys);
    try {
      localStorage.setItem(READ_KEY, JSON.stringify([...keys]));
    } catch {
      // Read status is a convenience; the flag still works without storage.
    }
  }

  go(path: string): void {
    this.close();
    void this.router.navigate([path], { queryParamsHandling: 'preserve' });
  }

  onEscape(): void {
    this.close();
  }

  onPointerDown(event: Event): void {
    if (this.open() && !event.composedPath().includes(this.host.nativeElement))
      this.open.set(false);
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

export interface FlagNotification {
  readonly key: string;
  readonly icon: string;
  readonly title: string;
  readonly detail: string;
  readonly action: string;
  readonly path: string;
  readonly spoon: boolean;
  readonly unread?: boolean;
}

function readStoredKeys(): ReadonlySet<string> {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(READ_KEY) ?? '[]');
    return new Set(Array.isArray(value) ? value.filter((k) => typeof k === 'string') : []);
  } catch {
    return new Set();
  }
}
