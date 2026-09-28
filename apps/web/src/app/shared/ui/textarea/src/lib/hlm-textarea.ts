import { Directive, input, booleanAttribute, inject, computed } from '@angular/core';
import {
  BrnFieldControl,
  BrnFieldControlDescribedBy,
  provideBrnLabelable,
} from '@spartan-ng/brain/field';
import { classes } from '@spartan-ng/helm/utils';

@Directive({
  selector: '[hlmTextarea]',
  hostDirectives: [BrnFieldControl, BrnFieldControlDescribedBy],
  providers: [provideBrnLabelable(HlmTextarea)],
  host: {
    '[id]': 'id()',
    '[attr.data-touched]': 'field.touched?.() ? "true" : null',
    '[attr.data-dirty]': 'field.dirty?.() ? "true" : null',
    '[attr.data-invalid]': 'invalid() ? "true" : null',
    'data-slot': 'textarea',
    '[attr.aria-invalid]': 'invalid() ? "true" : "false"',
  },
})
export class HlmTextarea {
  private static nextId = 0;
  readonly id = input(`hlm-textarea-${HlmTextarea.nextId++}`);
  readonly labelableId = this.id;
  readonly forceInvalid = input(false, { transform: booleanAttribute });
  // A form controls when validation is shown. Do not let a second host binding override it.
  readonly invalid = computed(
    () => this.forceInvalid() || (this.ariaInvalid() ?? this.field.spartanInvalid()),
  );
  readonly field = inject(BrnFieldControl);
  readonly ariaInvalid = input<boolean | undefined, unknown>(undefined, {
    alias: 'aria-invalid',
    transform: (value) => (value === undefined ? undefined : booleanAttribute(value)),
  });
  constructor() {
    classes(
      () =>
        'border-input dark:bg-input/30 focus-visible:border-ring focus-visible:ring-ring/50 data-[matches-spartan-invalid=true]:ring-destructive/20 dark:data-[matches-spartan-invalid=true]:ring-destructive/40 data-[matches-spartan-invalid=true]:border-destructive dark:data-[matches-spartan-invalid=true]:border-destructive/50 rounded-md border bg-transparent px-2.5 py-2 text-base shadow-xs transition-[color,box-shadow] focus-visible:ring-3 data-[matches-spartan-invalid=true]:ring-3 md:text-sm placeholder:text-muted-foreground flex field-sizing-content min-h-16 w-full outline-none disabled:cursor-not-allowed disabled:opacity-50',
    );
  }
}
