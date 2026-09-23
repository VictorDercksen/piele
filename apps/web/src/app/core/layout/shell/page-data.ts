/** Route `data` used by the shell to title each page. */
export interface PageData {
  readonly crumb: string;
  readonly eyebrow: string;
  readonly title: string;
  /** Season-wide pages are not scoped to the selected round. */
  readonly seasonWide?: boolean;
  /** Pages reached from More on mobile. */
  readonly underMore?: boolean;
}
