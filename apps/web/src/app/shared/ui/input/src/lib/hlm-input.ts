import { Directive, input, booleanAttribute, inject, computed } from '@angular/core';
import {
  BrnFieldControl,
  BrnFieldControlDescribedBy,
  provideBrnLabelable,
} from '@spartan-ng/brain/field';
import { classes } from '@spartan-ng/helm/utils';

@Directive({
  selector: '[hlmInput]',
  hostDirectives: [BrnFieldControl, BrnFieldControlDescribedBy],
  providers: [provideBrnLabelable(HlmInput)],
  host: {
    '[id]': 'id()',
    '[attr.data-touched]': 'field.touched?.() ? "true" : null',
    '[attr.data-dirty]': 'field.dirty?.() ? "true" : null',
    '[attr.data-invalid]': 'invalid() ? "true" : null',
    'data-slot': 'input',
    '[attr.aria-invalid]': 'invalid() ? "true" : "false"',
  },
})
export class HlmInput {
  private static nextId = 0;
  readonly id = input(`hlm-input-${HlmInput.nextId++}`);
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
        'dark:bg-input/30 border-input focus-visible:border-ring focus-visible:ring-ring/50 data-[matches-spartan-invalid=true]:ring-destructive/20 dark:data-[matches-spartan-invalid=true]:ring-destructive/40 data-[matches-spartan-invalid=true]:border-destructive dark:data-[matches-spartan-invalid=true]:border-destructive/50 h-9 rounded-md border bg-transparent px-2.5 py-1 text-base shadow-xs transition-[color,box-shadow] file:h-7 file:text-sm file:font-medium focus-visible:ring-3 data-[matches-spartan-invalid=true]:ring-3 md:text-sm file:text-foreground placeholder:text-muted-foreground w-full min-w-0 outline-none file:inline-flex file:border-0 file:bg-transparent disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
    );
  }
}
