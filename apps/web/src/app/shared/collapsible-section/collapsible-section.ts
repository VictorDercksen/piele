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
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideChevronDown } from '@ng-icons/lucide';
import { of } from 'rxjs';

const OPEN_MS = 460;
const CLOSE_MS = 360;
const EASING = 'cubic-bezier(0.22, 1, 0.36, 1)';

/**
 * A page section behind its heading: the chevron top right (its hit area the whole heading row)
 * opens and closes the body, which is closed by default, inert while closed and animated between
 * its measured heights like the match centre's drawers. A section with an `anchor` takes that id
 * and opens by itself when the route's fragment names it (`/captain#picks`). Content marked
 * `sectionSide` sits in the heading row beside the chevron.
 */
@Component({
  selector: 'app-collapsible-section',
  templateUrl: './collapsible-section.html',
  styleUrl: './collapsible-section.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[attr.id]': 'anchor() || null',
  },
  imports: [NgIcon],
  viewProviders: [provideIcons({ lucideChevronDown })],
})
export class CollapsibleSection {
  readonly heading = input.required<string>();
  readonly headingId = input.required<string>();
  readonly anchor = input('');
  readonly bodyId = computed(() => `${this.headingId()}-body`);
  private readonly fragment = toSignal(
    inject(ActivatedRoute, { optional: true })?.fragment ?? of(null),
    {
      initialValue: null,
    },
  );
  /** Closed by default; open while the route's fragment names the anchor, until toggled. */
  readonly open = linkedSignal(() => !!this.anchor() && this.fragment() === this.anchor());
  /** True while the body's height animates, so a closing body stays visible until the end. */
  readonly animating = signal(false);
  private readonly body = viewChild.required<ElementRef<HTMLElement>>('body');
  private animation: Animation | null = null;

  /** Opens or closes the body, animating between its measured heights. */
  toggle(): void {
    const element = this.body().nativeElement;
    const opening = !this.open();
    const from = element.getBoundingClientRect().height;
    const to = opening ? element.scrollHeight : 0;
    this.open.set(opening);
    const reduced = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduced || typeof element.animate !== 'function') return;
    // The open class leaves the height to the content once the animation ends.
    this.animation?.cancel();
    const animation = element.animate([{ height: `${from}px` }, { height: `${to}px` }], {
      duration: opening ? OPEN_MS : CLOSE_MS,
      easing: EASING,
    });
    this.animation = animation;
    this.animating.set(true);
    const settle = () => {
      if (this.animation === animation) this.animating.set(false);
    };
    animation.addEventListener('finish', settle);
    animation.addEventListener('cancel', settle);
  }
}
