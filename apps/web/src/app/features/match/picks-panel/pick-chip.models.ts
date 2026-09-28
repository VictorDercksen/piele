/** A pick chip: the club block and margin, a draw, or no pick. */
export interface PickChipView {
  readonly kind: 'club' | 'draw' | 'missed';
  readonly label: string;
  readonly margin: number | null;
  readonly colour: string | null;
  readonly accent: string | null;
  readonly isDefault: boolean;
}
