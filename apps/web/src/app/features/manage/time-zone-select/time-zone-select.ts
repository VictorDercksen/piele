import {
  ChangeDetectionStrategy,
  Component,
  afterRenderEffect,
  computed,
  inject,
  input,
} from '@angular/core';
import { ReactiveFormsModule, SelectControlValueAccessor } from '@angular/forms';
import { timeZoneGroups } from '../time-zones';

/** Native select shared by league creation and editing. The host owns its label and form control. */
@Component({
  selector: 'select[appTimeZoneSelect]',
  template: `
    @if (!currentZone()) {
      <option value="">Choose a time zone</option>
    }
    @for (group of groups(); track group.region) {
      <optgroup [label]="group.region">
        @for (zone of group.zones; track zone.id) {
          <option [value]="zone.id">{{ zone.label }}</option>
        }
      </optgroup>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule],
})
export class TimeZoneSelect {
  private readonly accessor = inject(SelectControlValueAccessor);
  readonly currentZone = input('');
  readonly groups = computed(() => timeZoneGroups(this.currentZone()));

  constructor() {
    // Options render inside this component, after the host form writes its initial value.
    afterRenderEffect(() => {
      this.groups();
      this.accessor.writeValue(this.accessor.value);
    });
  }
}
