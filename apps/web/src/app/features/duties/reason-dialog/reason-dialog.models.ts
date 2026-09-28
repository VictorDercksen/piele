export interface ReasonRequest {
  /** The line above the title; the league's captain's desk by default. */
  readonly eyebrow?: string;
  readonly title: string;
  readonly description: string;
  readonly submitLabel: string;
  readonly required: boolean;
  /** A plain confirmation: no reason field. */
  readonly noReason?: boolean;
  readonly spoon?: boolean;
  readonly action: (reason: string) => Promise<void>;
  /**
   * A refusal to show as a warning rather than a failure, or null for a failure. The dialog
   * closes on it: what it asked about has changed, for instance decided meanwhile.
   */
  readonly refused?: (error: unknown) => string | null;
  readonly done?: () => void;
}
