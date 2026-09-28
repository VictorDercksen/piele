import { Directive, input } from '@angular/core';
import { BrnCollapsibleContent } from '@spartan-ng/brain/collapsible';
import { classes } from '@spartan-ng/helm/utils';

@Directive({
  selector: '[hlmCollapsibleContent],hlm-collapsible-content',
  hostDirectives: [{ directive: BrnCollapsibleContent, inputs: ['id'] }],
  host: { 'data-slot': 'collapsible-content' },
})
export class HlmCollapsibleContent {
  readonly preserveContent = input(false);
  constructor() {
    classes(() => (this.preserveContent() ? '' : 'data-[state=closed]:hidden'));
  }
}
