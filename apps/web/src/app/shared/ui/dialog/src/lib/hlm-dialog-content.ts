import type { BooleanInput } from '@angular/cdk/coercion';
import type { ComponentType } from '@angular/cdk/portal';
import { NgComponentOutlet } from '@angular/common';
import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
} from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideX } from '@ng-icons/lucide';
import { BrnDialogRef, injectBrnDialogContext } from '@spartan-ng/brain/dialog';
import { HlmButton } from '@spartan-ng/helm/button';

import { classes } from '@spartan-ng/helm/utils';
import { HlmDialogClose } from './hlm-dialog-close';

type HlmDialogContentContext = {
  $component?: ComponentType<unknown>;
  $dynamicComponentClass?: string;
  $showCloseButton?: boolean;
  $closeLabel?: string;
};

@Component({
  selector: 'hlm-dialog-content',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    'data-slot': 'dialog-content',
    '[attr.data-state]': 'state()',
  },
  template: `
    @if (component) {
      <ng-container [ngComponentOutlet]="component" />
    } @else {
      <ng-content />
    }

    @if (showCloseButton()) {
      <button hlmBtn variant="ghost" size="icon-sm" class="absolute end-4 top-4" hlmDialogClose>
        <span class="sr-only">{{ closeLabel() }}</span>
        <ng-icon name="lucideX" />
      </button>
    }
  `,
  /* prettier-ignore */
  imports: [
    NgComponentOutlet,
    HlmButton,
    HlmDialogClose,
    NgIcon,
  ],
  providers: [provideIcons({ lucideX })],
})
export class HlmDialogContent {
  private readonly _dialogRef = inject(BrnDialogRef);
  private readonly _dialogContext = injectBrnDialogContext<HlmDialogContentContext | null>({
    optional: true,
  });

  public readonly showCloseButton = input<boolean, BooleanInput>(
    this._dialogContext?.$showCloseButton ?? true,
    {
      transform: booleanAttribute,
    },
  );
  public readonly closeLabel = input<string>(this._dialogContext?.$closeLabel ?? 'Close');

  public readonly state = computed(() => this._dialogRef?.state() ?? 'closed');

  public readonly component = this._dialogContext?.$component;
  private readonly _dynamicComponentClass = this._dialogContext?.$dynamicComponentClass;

  constructor() {
    classes(() => ['pavilion-dialog relative block outline-none', this._dynamicComponentClass]);
  }
}
