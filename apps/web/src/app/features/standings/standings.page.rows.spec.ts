import { RoundRowView, SeasonRowView } from '../../core/league/standings/standing.models';
import { measureFrom, pointsRows } from './standings.page.rows';

const LOOK = { you: false, name: 'Johan', photo: null, teamId: 'vodacom-bulls' };

function roundRow(change: Partial<RoundRowView>): RoundRowView {
  return {
    ...LOOK,
    memberId: 'member-johan',
    roundId: 1,
    wp: 2,
    mp: 1,
    gsp: 0,
    bp: 1,
    points: 4,
    derived: 4,
    distance: 10,
    rank: 1,
    complete: true,
    override: null,
    cap: false,
    spoon: false,
    ...change,
  } as RoundRowView;
}

describe('standings page rows', () => {
  it('reads the tab from the query parameter, else the round', () => {
    expect(measureFrom('season')).toBe('season');
    expect(measureFrom('marks')).toBe('marks');
    expect(measureFrom('other')).toBe('round');
    expect(measureFrom(null)).toBe('round');
  });

  it('sizes each bar against the top total, including a recorded override', () => {
    const [top, other] = pointsRows([
      roundRow({ points: 8, override: 8 }),
      roundRow({ memberId: 'member-me', wp: 1, mp: 0, bp: 0, points: 1, you: true }),
    ]);
    expect(top.bar).toEqual({ wp: 25, mp: 12.5, gsp: 0, bp: 12.5 });
    expect(top.override).toBe(8);
    expect(top.crown).toBe(false);
    expect(top.rounds).toBeNull();
    expect(other.bar.wp).toBe(12.5);
    expect(other.you).toBe(true);
  });

  it('carries the season columns and draws no bars without points', () => {
    const season = {
      ...LOOK,
      memberId: 'member-johan',
      points: 0,
      wp: 0,
      mp: 0,
      gsp: 0,
      bp: 0,
      distance: 0,
      rounds: 3,
      rank: 1,
      cap: true,
      spoon: false,
      crown: true,
    } as SeasonRowView;
    const [row] = pointsRows([season]);
    expect(row).toEqual(
      expect.objectContaining({ rounds: 3, crown: true, cap: true, override: null }),
    );
    expect(row.bar).toEqual({ wp: 0, mp: 0, gsp: 0, bp: 0 });
  });
});
