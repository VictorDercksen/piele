/** A value the search select can hold. */
export type SelectValue = string | number;
export interface SelectOption {
  readonly value: SelectValue;
  readonly label: string;
  readonly disabled?: boolean;
}
export interface SelectGroup {
  readonly label: string;
  readonly options: readonly SelectOption[];
}
