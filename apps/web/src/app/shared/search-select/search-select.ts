import { SearchSelectTrigger } from './search-select-trigger';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  forwardRef,
  input,
  output,
  signal,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { SelectGroup, SelectOption, SelectValue } from './search-select.models';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideCheck, lucideChevronDown, lucideSearch } from '@ng-icons/lucide';
import {
  BrnCombobox,
  BrnComboboxAnchor,
  BrnComboboxContent,
  BrnComboboxEmpty,
  BrnComboboxGroup,
  BrnComboboxInput,
  BrnComboboxItem,
  BrnComboboxLabel,
  BrnComboboxList,
  BrnComboboxPopoverTrigger,
} from '@spartan-ng/brain/combobox';
import {
  BrnPopoverImports,
  provideBrnPopoverConfig,
  provideBrnPopoverDefaultOptions,
} from '@spartan-ng/brain/popover';
import { HlmButton } from '@spartan-ng/helm/button';

/** A themed Spartan combobox for searchable member, round, and time-zone choices. */
@Component({
  selector: 'app-search-select',
  templateUrl: './search-select.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'pavilion-search-select', '[attr.aria-label]': 'null' },
  /* prettier-ignore */
  imports: [
    SearchSelectTrigger,
    BrnCombobox,
    BrnComboboxAnchor,
    BrnComboboxContent,
    BrnComboboxEmpty,
    BrnComboboxGroup,
    BrnComboboxInput,
    BrnComboboxItem,
    BrnComboboxLabel,
    BrnComboboxList,
    BrnComboboxPopoverTrigger,
    BrnPopoverImports,
    HlmButton,
    NgIcon,
  ],
  /* prettier-ignore */
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => SearchSelect), multi: true },
    provideBrnPopoverConfig({ align: 'start', sideOffset: 8 }),
    provideBrnPopoverDefaultOptions({ role: null }),
  ],
  viewProviders: [provideIcons({ lucideCheck, lucideChevronDown, lucideSearch })],
})
export class SearchSelect implements ControlValueAccessor {
  private static nextId = 0;
  readonly selectId = input(`pavilion-select-${SearchSelect.nextId++}`);
  readonly options = input<readonly SelectOption[]>([]);
  readonly groups = input<readonly SelectGroup[]>([]);
  readonly placeholder = input('Choose an option');
  readonly searchLabel = input('Search options');
  readonly disabled = input(false);
  private readonly formDisabled = signal(false);
  readonly isDisabled = computed(() => this.disabled() || this.formDisabled());
  readonly ariaInvalid = input<boolean | null>(null, { alias: 'aria-invalid' });
  readonly ariaDescribedby = input<string | null>(null, { alias: 'aria-describedby' });
  readonly ariaLabel = input<string | null>(null, { alias: 'aria-label' });
  readonly selectionChange = output<SelectValue>();
  readonly value = signal<SelectValue | null>(null);
  readonly optionGroups = computed(() =>
    this.groups().length ? this.groups() : [{ label: '', options: this.options() }],
  );
  readonly allOptions = computed(() => this.optionGroups().flatMap((group) => group.options));
  readonly selected = computed(() =>
    this.allOptions().find((option) => option.value === this.value()),
  );
  readonly itemLabel = (value: SelectValue) =>
    this.allOptions().find((option) => option.value === value)?.label ?? String(value);
  readonly filter = (value: SelectValue, search: string) =>
    `${this.itemLabel(value)} ${value}`
      .toLocaleLowerCase()
      .includes(search.trim().toLocaleLowerCase());
  private onChange: (value: SelectValue) => void = () => {};
  private onTouched: () => void = () => {};

  choose(value: unknown): void {
    if (this.isDisabled() || (typeof value !== 'string' && typeof value !== 'number')) return;
    this.value.set(value);
    this.onChange(value);
    this.onTouched();
    this.selectionChange.emit(value);
  }

  touch(): void {
    this.onTouched();
  }
  writeValue(value: SelectValue | null): void {
    this.value.set(value);
  }
  registerOnChange(fn: (value: SelectValue) => void): void {
    this.onChange = fn;
  }
  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }
  setDisabledState(disabled: boolean): void {
    this.formDisabled.set(disabled);
  }
}
