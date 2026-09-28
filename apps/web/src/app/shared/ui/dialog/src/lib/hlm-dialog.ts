import { ChangeDetectionStrategy, Component, forwardRef } from '@angular/core';
import { BrnDialog, provideBrnDialogDefaultOptions } from '@spartan-ng/brain/dialog';
import { HlmDialogOverlay } from './hlm-dialog-overlay';

@Component({
  selector: 'hlm-dialog',
  exportAs: 'hlmDialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <hlm-dialog-overlay />
    <ng-content />
  `,
  imports: [HlmDialogOverlay],
  /* prettier-ignore */
  providers: [
    {
      provide: BrnDialog,
      useExisting: forwardRef(() => HlmDialog),
    },
    provideBrnDialogDefaultOptions({}),
  ],
})
export class HlmDialog extends BrnDialog {}
