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

/** `section`: a page section under the shared double rule. `panel`: a grain card with a chalk top rule. */
export type DropdownAppearance = 'section' | 'panel';

/**
 * The app's one dropdown: a heading with a chevron top right (its hit area the whole heading
 * row) over a body that is closed by default, inert while closed and animated between its
 * measured heights (skipped under reduced motion). While open, the heading row sticks under the
 * shell's top bar and round header (`--sticky-offset`) so the dropdown can always be closed, and
 * takes a background once it is actually stuck.
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
  imports: [NgIcon],
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
  private readonly body = viewChild.required<ElementRef<HTMLElement>>('body');
  private animation: Animation | null = null;

  constructor() {
    if (typeof window === 'undefined') return;
    merge(fromEvent(window, 'scroll', { passive: true }), fromEvent(window, 'resize'))
      .pipe(takeUntilDestroyed())
      .subscribe({ next: () => this.measureStuck() });
  }

  /** Opens or closes the body, animating between its measured heights. */
  toggle(): void {
    if (!this.collapsible()) return;
    const element = this.body().nativeElement;
    const opening = !this.open();
    // Closing from inside a long body scrolls the page back first; the body then goes at once.
    // Animating the layout straight after a programmatic scroll leaves iOS Safari drawing the
    // shell's sticky bars out of place (the page shows through them) until the animation ends.
    const scrolledBack = !opening && this.returnToHeading();
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
    if (reduced || scrolledBack || typeof element.animate !== 'function') {
      this.animation?.cancel();
      return;
    }
    // The open class leaves the height to the content once the animation ends.
    this.animation?.cancel();
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

  /**
   * Closing from inside a long body would leave the reader wherever the page shrinks to, with the
   * heading gone far above. Instead the page scrolls back to where the heading pins, so the
   * heading stays where it is on screen and the body goes from under it. True when it scrolled.
   */
  private returnToHeading(): boolean {
    const head = this.head().nativeElement;
    if (typeof scrollBy !== 'function') return false;
    const pin = parseFloat(getComputedStyle(head).top) || 0;
    // Where the heading sits in the page's flow, not where it is pinned.
    const sticky = head.style.position;
    head.style.position = 'static';
    const home = head.getBoundingClientRect().top;
    head.style.position = sticky;
    if (home >= pin - 1) return false;
    scrollBy(0, home - pin);
    return true;
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
