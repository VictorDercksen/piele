/** The member's favourite club as the chat wears it: its colours and URC banner pattern. */
export interface ChatClub {
  readonly colour: string;
  readonly accent: string;
  /** The banner's base colour, shown behind its pattern. */
  readonly bannerColour: string | null;
  readonly pattern: string | null;
}
