/** Route `data` used by the shell to title each page. */
export interface PageData {
  readonly eyebrow: string;
  readonly title: string;
  /** Season-wide pages are not scoped to the selected round. */
  readonly seasonWide?: boolean;
  /** Pages reached from More on mobile. */
  readonly underMore?: boolean;
  /** The page a breadcrumb leads back to. */
  readonly parent?: { readonly label: string; readonly path: string };
}
