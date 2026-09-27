import { ChangeDetectionStrategy, Component, computed, input, viewChild } from '@angular/core';
import { Dropdown } from '../../../shared/dropdown/dropdown';
import { ScoringView } from '../scoring';

/**
 * The scoring panel: a summary row with the score and a timeline of the match, over a
 * to-scale pitch that opens from it. A panel dropdown, closed by default with the top of the
 * pitch peeking out: the chevron in the heading opens and closes it, a tap anywhere on the
 * closed panel opens it, and the heading or summary (also by keyboard) closes it again.
 */
@Component({
  selector: 'app-scoring-panel',
  templateUrl: './scoring-panel.html',
  styleUrl: './scoring-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Dropdown],
  host: {
    '[class.open]': 'open()',
    '[class.live]': 'view().live',
  },
})
export class ScoringPanel {
  readonly view = input.required<ScoringView>();
  private readonly dropdown = viewChild(Dropdown);
  /** The dropdown's state, for the summary and the host's styles. */
  readonly open = computed(() => this.dropdown()?.open() ?? false);

  protected readonly summaryLabel = computed(() => {
    const { home, away, empty } = this.view();
    const score = `${home.name} ${home.score}, ${away.name} ${away.score}.`;
    return `${this.open() ? 'Hide' : 'Show'} the scoring pitch. ${home.score === '–' ? (empty ?? '') : score}`;
  });

  toggle(): void {
    this.dropdown()?.toggle();
  }

  protected onKey(event: Event): void {
    event.preventDefault();
    this.toggle();
  }
}
