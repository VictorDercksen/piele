import { Fixture } from '../../competition/competition.models';

export interface PinnedNotice {
  readonly key: string;
  readonly icon: string;
  readonly title: string;
  readonly detail: string;
  readonly action: string;
  readonly path: string;
  readonly round: number | null;
  readonly spoon: boolean;
}

export interface LocatedFixture {
  readonly fixture: Fixture;
  readonly round: number;
}

export interface Notice {
  readonly key: string;
  readonly kind: string;
  readonly icon: string;
  readonly label: string;
  readonly title: string;
  readonly detail: string;
  readonly occurredAt: string;
  /** `occurredAt` as epoch milliseconds, for ordering and read comparisons. */
  readonly at: number;
  readonly path: string | null;
  /** The link's wording, when there is a link. */
  readonly action: string | null;
  readonly round: number | null;
  readonly when?: string;
  readonly roundLabel?: string | null;
  readonly unread?: boolean;
}
