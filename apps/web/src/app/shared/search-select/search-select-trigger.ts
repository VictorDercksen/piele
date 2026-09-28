import { computed, Directive, input } from '@angular/core';
import { BrnComboboxTrigger, injectBrnComboboxBase } from '@spartan-ng/brain/combobox';

/** Preserve Spartan keyboard behavior while letting forms choose when to show errors. */
@Directive({ selector: 'button[appSearchSelectTrigger]' })
export class SearchSelectTrigger extends BrnComboboxTrigger<unknown> {
  private readonly combobox = injectBrnComboboxBase();
  readonly ariaInvalid = input<boolean | null>(null, { alias: 'aria-invalid' });
  protected override readonly _ariaInvalid = computed(
    () => this.ariaInvalid() ?? this.combobox.controlState?.()?.invalid,
  );
}
