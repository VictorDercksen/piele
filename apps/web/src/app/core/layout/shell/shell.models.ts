/** What the header's profile link shows: the photo or initials, and the name. */
export interface HeaderIdentity {
  readonly photo: string | null;
  readonly initials: string;
  readonly name: string;
  /** Whether the league's records were loading when this was read. */
  readonly loading: boolean;
}
