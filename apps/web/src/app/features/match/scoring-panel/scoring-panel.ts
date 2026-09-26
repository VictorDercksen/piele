import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { ScoringView } from '../scoring';

/** Height of the pitch left showing while the panel is closed. */
const PEEK_PX = 30;
const OPEN_MS = 520;
const CLOSE_MS = 420;
const EASING = 'cubic-bezier(0.22, 1, 0.36, 1)';

/**
 * The scoring panel: a summary row with the score and a timeline of the match, over a
 * to-scale pitch that opens from it. Closed by default; a tap anywhere opens it, and the
 * heading or summary closes it again.
 */
@Component({
  selector: 'app-scoring-panel',
  templateUrl: './scoring-panel.html',
  styleUrl: './scoring-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.open]': 'open()',
    '(click)': 'onClick($event)',
  },
})
export class ScoringPanel {
  readonly view = input.required<ScoringView>();
  readonly open = signal(false);

  private readonly body = viewChild.required<ElementRef<HTMLElement>>('body');
  private animation: Animation | null = null;

  protected readonly summaryLabel = computed(() => {
    const { home, away, empty } = this.view();
    const score = `${home.name} ${home.score}, ${away.name} ${away.score}.`;
    return `${this.open() ? 'Hide' : 'Show'} the scoring pitch. ${home.score === '–' ? (empty ?? '') : score}`;
  });

  toggle(): void {
    const element = this.body().nativeElement;
    const opening = !this.open();
    const from = element.getBoundingClientRect().height;
    const to = opening ? element.scrollHeight : PEEK_PX;
    this.open.set(opening);
    const reduced = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduced || typeof element.animate !== 'function') return;
    // Animate between measured heights; the open class then leaves the height to its content.
    this.animation?.cancel();
    this.animation = element.animate([{ height: `${from}px` }, { height: `${to}px` }], {
      duration: opening ? OPEN_MS : CLOSE_MS,
      easing: EASING,
    });
  }

  protected onClick(event: MouseEvent): void {
    const target = event.target instanceof Element ? event.target : null;
    if (!this.open() || target?.closest('.head')) this.toggle();
  }

  protected onKey(event: Event): void {
    event.preventDefault();
    this.toggle();
  }
}
