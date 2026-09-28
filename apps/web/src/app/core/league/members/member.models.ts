/** How a member shows in a table or pick list. */
export interface MemberLook {
  readonly you: boolean;
  readonly name: string;
  readonly photo: string | null;
  readonly teamId: string;
}
