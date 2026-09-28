import { HlmCollapsible } from '@spartan-ng/helm/collapsible';
import { HlmCollapsibleContent } from '@spartan-ng/helm/collapsible';
import { HlmButton } from '@spartan-ng/helm/button';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  input,
  linkedSignal,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideChevronDown } from '@ng-icons/lucide';
import { fromEvent, merge, of } from 'rxjs';

const OPEN_MS = 460;
const CLOSE_MS = 360;
const EASING = 'cubic-bezier(0.22, 1, 0.36, 1)';
/** The longest a scroll back to the heading may take before the body folds regardless. */
const SCROLL_TIMEOUT_MS = 1500;
/** Without `scrollend`, how long the page must hold still after moving to count as at rest. */
const SCROLL_STILL_MS = 250;

const now = () => (typeof performance === 'undefined' ? Date.now() : performance.now());
const nextFrame = (callback: () => void) =>
  typeof requestAnimationFrame === 'function'
    ? requestAnimationFrame(() => callback())
    : setTimeout(callback, 16);

/** `section`: a page section under the shared double rule. `panel`: a grain card with a chalk top rule. */
export type DropdownAppearance = 'section' | 'panel';

/**
 * The app's one dropdown: a heading with a chevron top right (its hit area the whole heading
 * row) over a body that is closed by default, inert while closed and animated between its
 * measured heights (skipped under reduced motion). While open, the heading row sticks under the
 * shell's top bar and round header (`--sticky-offset`) so the dropdown can always be closed, and
 * takes a background once it is actually stuck. Closed from there, the page first scrolls back
 * to the heading, then the body folds.
 *
 * Content marked `dropdownSide` sits beside the chevron (a state tag); content marked
 * `dropdownLead` shows between the heading and the body whether open or not, and content marked
 * `dropdownFoot` after the body (a source line); everything else is the body. Options: `appearance`, `toggleName` (names the chevron "Show {name}" / "Hide {name}"
 * instead of by the heading), `bodyId`, `peek` (px of the body left showing while closed),
 * `tapToOpen` (a tap anywhere on the closed dropdown opens it; once open the heading and lead
 * close it), `collapsible` (false: no chevron and the body stays closed), `resetKey` (closes
 * again whenever it changes) and `anchor` (the host's id; opens when the route's fragment names
 * it). The top rule and stuck background follow `--dropdown-rule` and `--dropdown-stuck-bg`.
 */
@Component({
  selector: 'app-dropdown',
  templateUrl: './dropdown.html',
  styleUrl: './dropdown.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[attr.id]': 'anchor() || null',
  },
  /* prettier-ignore */
  imports: [
    NgIcon,
    HlmButton,
    HlmCollapsible,
    HlmCollapsibleContent,
  ],
  viewProviders: [provideIcons({ lucideChevronDown })],
})
export class Dropdown {
  readonly heading = input.required<string>();
  readonly headingId = input.required<string>();
  readonly appearance = input<DropdownAppearance>('section');
  readonly toggleName = input('');
  readonly bodyId = input('');
  readonly peek = input(0);
  readonly tapToOpen = input(false);
  readonly collapsible = input(true);
  readonly resetKey = input<unknown>(null);
  readonly anchor = input('');

  readonly contentId = computed(() => this.bodyId() || `${this.headingId()}-body`);
  readonly toggleLabel = computed(() =>
    this.toggleName() ? `${this.open() ? 'Hide' : 'Show'} ${this.toggleName()}` : null,
  );
  private readonly fragment = toSignal(
    inject(ActivatedRoute, { optional: true })?.fragment ?? of(null),
    { initialValue: null },
  );
  /** Closed by default and on every new `resetKey`; opens when the fragment names the anchor. */
  readonly open = linkedSignal<{ anchor: string; fragment: string | null; key: unknown }, boolean>({
    source: () => ({ anchor: this.anchor(), fragment: this.fragment(), key: this.resetKey() }),
    computation: ({ anchor, fragment, key }, previous) => {
      if (anchor && fragment === anchor) return true;
      return previous !== undefined && previous.source.key === key ? previous.value : false;
    },
  });
  /** True while the body's height animates, so a closing body stays visible until the end. */
  readonly animating = signal(false);
  /** The open heading row is pinned under the shell's bars. */
  readonly stuck = signal(false);
  private readonly head = viewChild.required<ElementRef<HTMLElement>>('head');
  private readonly lead = viewChild.required<ElementRef<HTMLElement>>('lead');
  private readonly body = viewChild.required<ElementRef<HTMLElement>>('body');
  private animation: Animation | null = null;
  /** True while the page scrolls back to the heading ahead of a close. */
  private closing = false;
  private closeToken = 0;

  constructor() {
    if (typeof window === 'undefined') return;
    merge(fromEvent(window, 'scroll', { passive: true }), fromEvent(window, 'resize'))
      .pipe(takeUntilDestroyed())
      .subscribe({ next: () => this.measureStuck() });
  }

  /**
   * Opens or closes the body. Closing from inside a long body (the heading pinned) first brings
   * the page back to where the heading pins and only then folds the body: the page scrolls
   * through its native, compositor-driven scroll while the layout stays as it is, and the layout
   * changes once the page is at rest. A programmatic scroll and a layout change in the same frame
   * leave iOS Safari drawing the page over the shell's sticky bars for a moment.
   */
  toggle(): void {
    if (!this.collapsible() || this.closing) return;
    if (!this.open()) {
      this.animateBody(true);
      return;
    }
    const gap = this.stuck() ? this.pinGap() : 0;
    if (gap > 1 && typeof scrollTo === 'function') this.closeAfterScroll(gap);
    else this.animateBody(false);
  }

  /** How far the heading's place in the page's flow is above its pinned line (0 when not pinned). */
  private pinGap(): number {
    const head = this.head().nativeElement;
    const lead = this.lead().nativeElement;
    const pin = parseFloat(getComputedStyle(head).top) || 0;
    // The lead never moves, so the heading's natural spot sits just above it.
    const natural =
      lead.getBoundingClientRect().top -
      (parseFloat(getComputedStyle(lead).marginTop) || 0) -
      head.getBoundingClientRect().height;
    return pin - natural;
  }

  /**
   * Scrolls the page by `gap` (smoothly unless motion is reduced), then folds the body at rest:
   * on `scrollend` where the browser has it, else once the page has moved and then held still
   * for a while (a smooth scroll can stall for frames on a busy machine), or at the cap.
   */
  private closeAfterScroll(gap: number): void {
    const token = ++this.closeToken;
    this.closing = true;
    const target = Math.max(0, Math.round(scrollY - gap));
    const reduced = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const started = now();
    const from = scrollY;
    let last = from;
    let lastMove = started;
    let frames = 0;
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      removeEventListener('scrollend', finish);
      if (token !== this.closeToken) return;
      this.closing = false;
      if (this.open()) this.animateBody(false);
    };
    const tick = () => {
      if (finished) return;
      if (token !== this.closeToken || !this.open()) {
        // Closed meanwhile (a new reset key).
        finished = true;
        removeEventListener('scrollend', finish);
        this.closing = false;
        return;
      }
      frames++;
      const still = scrollY === last;
      if (!still) {
        last = scrollY;
        lastMove = now();
      }
      // Where the browser says when a scroll ends, only that (or the cap) finishes: a smooth
      // scroll can sit within a pixel of its target for several frames while still moving.
      const moved = last !== from;
      const arrived = !hasScrollEnd && frames >= 2 && still && Math.abs(scrollY - target) < 0.5;
      const held = !hasScrollEnd && moved && now() - lastMove >= SCROLL_STILL_MS;
      if (arrived || held || now() - started > SCROLL_TIMEOUT_MS) finish();
      else nextFrame(tick);
    };
    const hasScrollEnd = 'onscrollend' in window;
    if (hasScrollEnd) addEventListener('scrollend', finish);
    scrollTo({ top: target, behavior: reduced ? 'instant' : 'smooth' });
    nextFrame(tick);
  }

  /** Sets the open state and animates the body between its measured heights. */
  private animateBody(opening: boolean): void {
    const element = this.body().nativeElement;
    let from = element.getBoundingClientRect().height;
    // Closing, only the part of the body on screen needs to fold away; below the fold it can go
    // at once.
    if (!opening) {
      const onScreen = Math.max(0, innerHeight - element.getBoundingClientRect().top);
      from = Math.max(this.peek(), Math.min(from, onScreen));
    }
    const to = opening ? element.scrollHeight : this.peek();
    this.open.set(opening);
    if (!opening) this.stuck.set(false);
    const reduced = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    this.animation?.cancel();
    if (reduced || typeof element.animate !== 'function') return;
    // The open class leaves the height to the content once the animation ends.
    const animation = element.animate([{ height: `${from}px` }, { height: `${to}px` }], {
      duration: opening ? OPEN_MS : CLOSE_MS,
      easing: EASING,
    });
    this.animation = animation;
    this.animating.set(true);
    const settle = () => {
      if (this.animation !== animation) return;
      this.animating.set(false);
      // The page changed height without a scroll; the heading may have become (un)pinned.
      this.measureStuck();
    };
    animation.addEventListener('finish', settle);
    animation.addEventListener('cancel', settle);
  }

  /** With `tapToOpen`, a tap on the closed dropdown opens it and the open heading or lead close it. */
  protected onClick(event: MouseEvent): void {
    if (!this.tapToOpen() || !this.collapsible()) return;
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('.chevron')) return;
    if (!this.open() || target?.closest('.dropdown-head, .dropdown-lead')) this.toggle();
  }

  private measureStuck(): void {
    if (!this.open()) {
      this.stuck.set(false);
      return;
    }
    const head = this.head().nativeElement;
    const top = parseFloat(getComputedStyle(head).top) || 0;
    const { top: headTop } = head.getBoundingClientRect();
    const sectionTop = head.parentElement?.getBoundingClientRect().top ?? headTop;
    // Stuck once the section has scrolled up past the heading's pinned line.
    this.stuck.set(headTop <= top + 1 && sectionTop < headTop - 1);
  }
}
