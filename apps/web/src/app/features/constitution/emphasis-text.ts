import { Component, computed, input } from '@angular/core';
import { emphasisSegments } from './emphasis';

/**
 * Text with `**bold**` markers rendered as plain and strong runs. The template stays on one
 * line: whitespace around the runs would show as stray spaces beside the bold text.
 */
@Component({
  selector: 'app-emphasis-text',
  // prettier-ignore
  template: `@for (part of parts(); track $index) {@if (part.strong) {<strong>{{ part.text }}</strong>} @else {<span>{{ part.text }}</span>}}`,
})
export class EmphasisText {
  readonly text = input.required<string>();
  protected readonly parts = computed(() => emphasisSegments(this.text()));
}
