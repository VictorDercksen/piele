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
  readonly done?: () => void;
}
