import { Directive } from '@angular/core';
import { BrnLabel } from '@spartan-ng/brain/label';
import { classes } from '@spartan-ng/helm/utils';

@Directive({
  selector: '[hlmLabel]',
  hostDirectives: [{ directive: BrnLabel, inputs: ['id', 'for'] }],
  host: { 'data-slot': 'label' },
})
export class HlmLabel {
  constructor() {
    classes(() => 'pavilion-label');
  }
}
