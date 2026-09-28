import { LeagueRules, NewPick } from '../../../core/league/league.models';
import { parseMargin } from './picks-panel.form';
import { PickChoice, ScaleView, SideLooks } from './picks-panel.models';

/** The widest margin the scale reaches; beyond it the marker sits at the end. */
export const SCALE_REACH = 40;

/** The quick margins under the scale: a penalty, a converted try, two and three of them. */
export const QUICK_MARGINS: readonly number[] = [3, 7, 14, 21];

/**
 * The scale as drawn from the form's side and margin: the range's value (home is left, so
 * negative), the marker's position and label, the fill from the middle, and the pick in words
 * for the range's `aria-valuetext`.
 */
export function scaleOf(
  side: PickChoice | null,
  margin: string,
  sides: SideLooks | null,
): ScaleView {
  const parsed = parseMargin(margin);
  const club = side === 'home' || side === 'away' ? side : null;
  const name = club ? (sides?.[club].name ?? (club === 'home' ? 'Home' : 'Away')) : '';
  const reach = club && parsed !== null ? Math.min(parsed, SCALE_REACH) : 0;
  const range = club === 'home' ? -reach : reach;
  const pct = 50 + (range * 50) / SCALE_REACH;
  return {
    side,
    margin: parsed,
    range,
    pct,
    fillLeft: club === 'home' ? pct : 50,
    fillRight: club === 'away' ? 100 - pct : 50,
    thumb:
      side === null ? 'Pick' : side === 'draw' ? 'Draw' : parsed === null ? '?' : String(parsed),
    text:
      side === null
        ? 'No pick yet'
        : side === 'draw'
          ? 'A draw'
          : parsed === null
            ? `${name}, no margin yet`
            : `${name} by ${parsed}`,
  };
}

/** The pick as the chip reads it: "Bulls by 20" or "a draw". */
export function describePick(pick: NewPick, sides: SideLooks | null): string {
  if (pick.side !== 'home' && pick.side !== 'away') return 'a draw';
  const name = sides?.[pick.side].name ?? (pick.side === 'home' ? 'Home' : 'Away');
  return `${name} by ${pick.margin}`;
}

/** The rules line under the table, from the season's rules and this round's win points. */
export function scoringLegend(rules: LeagueRules, winPoints: number): string {
  const parts = [
    'Superbru scoring',
    `Outcome ${round(winPoints)}`,
    `Within ${rules.marginWindow} ${round(rules.marginPoint)}`,
  ];
  if (rules.bonusPoint) {
    let closest = `Closest ${round(rules.bonusPointValue)}`;
    if (rules.bonusPointSplit) closest += ', shared when tied';
    if (rules.bonusPointRangeCapped) closest += `, within ${rules.bonusRange} only`;
    parts.push(closest);
  }
  return `${parts.join(' · ')}.`;
}

/** A points value without floating-point noise in the scoring legend. */
function round(value: number): number {
  return Math.round(value * 100) / 100;
}
