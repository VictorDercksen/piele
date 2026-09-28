import type { PickRowView } from '../../../core/league/picks/pick.models';
import { PickChipView } from './pick-chip.models';

/** A pool row's pick as its chip: the picked club with the margin, a draw, or no pick. */
export function chipOf(row: PickRowView): PickChipView {
  const kind = row.side === 'missed' ? 'missed' : row.side === 'draw' ? 'draw' : 'club';
  return {
    kind,
    label: kind === 'club' ? (row.clubShortName ?? '') : kind === 'draw' ? 'Draw' : 'No pick',
    margin: kind === 'club' ? row.margin : null,
    colour: row.clubColour,
    accent: row.clubAccent,
    isDefault: row.isDefault,
  };
}
