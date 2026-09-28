import { DEFAULT_RULES } from '../../../core/league/superbru';
import { SideLook, SideLooks } from './picks-panel.models';
import { SCALE_REACH, describePick, scaleOf, scoringLegend } from './picks-panel.view';

function look(name: string): SideLook {
  return { name, colour: null, accent: null, banner: null, crest: null, jersey: '' };
}

const SIDES: SideLooks = { home: look('Zebre'), away: look('Bulls') };

describe('picks panel view', () => {
  it('draws no pick at the middle', () => {
    const scale = scaleOf(null, '', SIDES);
    expect(scale).toEqual(
      expect.objectContaining({ range: 0, pct: 50, thumb: 'Pick', text: 'No pick yet' }),
    );
  });

  it('draws a home margin left of the middle, capped at the scale reach', () => {
    const scale = scaleOf('home', '10', SIDES);
    expect(scale.range).toBe(-10);
    expect(scale.pct).toBe(50 - (10 * 50) / SCALE_REACH);
    expect(scale.fillLeft).toBe(scale.pct);
    expect(scale.fillRight).toBe(50);
    expect(scale.text).toBe('Zebre by 10');
    expect(scaleOf('away', '90', SIDES)).toEqual(
      expect.objectContaining({ range: SCALE_REACH, pct: 100, fillRight: 0, thumb: '90' }),
    );
  });

  it('names a side without a margin, and a draw', () => {
    expect(scaleOf('away', '', null)).toEqual(
      expect.objectContaining({ thumb: '?', text: 'Away, no margin yet' }),
    );
    expect(scaleOf('draw', '', SIDES)).toEqual(
      expect.objectContaining({ range: 0, thumb: 'Draw', text: 'A draw' }),
    );
  });

  it('describes a saved pick', () => {
    expect(describePick({ side: 'away', margin: 20 }, SIDES)).toBe('Bulls by 20');
    expect(describePick({ side: 'home', margin: 3 }, null)).toBe('Home by 3');
    expect(describePick({ side: 'draw', margin: 0 }, SIDES)).toBe('a draw');
  });

  it('writes the scoring legend from the rules', () => {
    const rules = {
      ...DEFAULT_RULES,
      marginWindow: 5,
      marginPoint: 0.5,
      bonusPoint: true,
      bonusPointValue: 0.333333,
      bonusPointSplit: true,
      bonusPointRangeCapped: true,
      bonusRange: 10,
    };
    expect(scoringLegend(rules, 1)).toBe(
      'Superbru scoring · Outcome 1 · Within 5 0.5 · Closest 0.33, shared when tied, within 10 only.',
    );
    expect(scoringLegend({ ...rules, bonusPoint: false }, 2)).toBe(
      'Superbru scoring · Outcome 2 · Within 5 0.5.',
    );
  });
});
