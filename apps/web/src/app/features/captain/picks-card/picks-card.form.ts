import { FormControl, FormGroup } from '@angular/forms';
import { MemberPick, StandingEntry, StewardPick } from '../../../core/league/league.models';
import { DerivedVsRecorded } from '../../../core/league/standings/standing.models';
import { GridRow, PickRow } from './picks-card.models';

/** A row's controls, filled from the member's saved pick if there is one. */
export function pickRow(pick: MemberPick | undefined): PickRow {
  const side = pick && pick.side !== 'missed' ? pick.side : '';
  return new FormGroup({
    side: new FormControl<'home' | 'away' | 'draw' | ''>(side, { nonNullable: true }),
    margin: new FormControl(
      pick && (pick.side === 'home' || pick.side === 'away') && pick.margin !== null
        ? String(pick.margin)
        : '',
      { nonNullable: true },
    ),
    isDefault: new FormControl(pick?.isDefault ?? false, { nonNullable: true }),
    missed: new FormControl(pick?.side === 'missed', { nonNullable: true }),
  });
}

/** Disables the margin for a draw or a missed pick, and the default for both. */
export function settle(group: PickRow): void {
  if (group.disabled) return;
  const { side, missed } = group.getRawValue();
  const c = group.controls;
  const noMargin = side === 'draw' || missed;
  if (noMargin) c.margin.disable({ emitEvent: false });
  else c.margin.enable({ emitEvent: false });
  if (noMargin) c.isDefault.disable({ emitEvent: false });
  else c.isDefault.enable({ emitEvent: false });
}

/** A whole number from 1 to 150, or null. */
export function parseMargin(value: string): number | null {
  const text = value.trim();
  if (!/^\d{1,3}$/.test(text)) return null;
  const margin = Number(text);
  return margin >= 1 && margin <= 150 ? margin : null;
}

/** The pick a row describes, or null for an empty row. Call once margins are checked. */
export function pickOf(group: PickRow): Pick<MemberPick, 'side' | 'margin' | 'isDefault'> | null {
  const { side, margin, isDefault, missed } = group.getRawValue();
  if (missed) return { side: 'missed', margin: null, isDefault: false };
  if (side === 'draw') return { side: 'draw', margin: 0, isDefault: false };
  if (side === 'home' || side === 'away') return { side, margin: parseMargin(margin), isDefault };
  return null;
}

/** The rows with a home or away side whose margin is not from 1 to 150. */
export function invalidMargins(grid: readonly GridRow[]): readonly GridRow[] {
  return grid.filter(({ group }) => {
    const { side, margin } = group.getRawValue();
    return (side === 'home' || side === 'away') && parseMargin(margin) === null;
  });
}

/**
 * The grid's changes against the saved picks: the picks to record (new or changed, keeping a
 * saved pick's linked duty) and the members whose saved pick was cleared.
 */
export function pickChanges(
  grid: readonly GridRow[],
  saved: ReadonlyMap<string, MemberPick>,
): { readonly record: readonly StewardPick[]; readonly remove: readonly string[] } {
  const record: StewardPick[] = [];
  const remove: string[] = [];
  for (const { memberId, group } of grid) {
    const wanted = pickOf(group);
    const before = saved.get(memberId);
    if (!wanted) {
      if (before) remove.push(memberId);
      continue;
    }
    if (
      before &&
      before.side === wanted.side &&
      before.margin === wanted.margin &&
      before.isDefault === wanted.isDefault
    )
      continue;
    record.push({ memberId, ...wanted, ...(before?.dutyId ? { dutyId: before.dutyId } : {}) });
  }
  return { record, remove };
}

/**
 * A round's recorded totals with one member's overridden: a round's totals are replaced as a
 * whole, so everyone else's recorded total is kept.
 */
export function overrideEntries(
  rows: readonly DerivedVsRecorded[],
  memberId: string,
  points: number,
): StandingEntry[] {
  return [
    ...rows
      .filter((r) => r.memberId !== memberId && r.recorded !== null)
      .map((r) => ({ memberId: r.memberId, points: r.recorded! })),
    { memberId, points },
  ];
}
