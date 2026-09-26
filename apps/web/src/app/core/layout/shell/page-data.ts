/** A page in the breadcrumb: its label and its path inside the league. */
export interface Crumb {
  readonly label: string;
  readonly path: string;
}

/** Route `data` used by the shell to title each page. */
export interface PageData {
  /** The page's name in a breadcrumb. */
  readonly label: string;
  readonly eyebrow: string;
  readonly title: string;
  /** Season-wide pages are not scoped to the selected round. */
  readonly seasonWide?: boolean;
  /** Pages reached from More on mobile. */
  readonly underMore?: boolean;
  /**
   * The page a breadcrumb leads back to when this one is opened directly. Main pages have
   * none; see `Breadcrumbs`.
   */
  readonly parent?: Crumb;
}
