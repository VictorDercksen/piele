import { PickRowView } from '../../../core/league/picks/pick.models';
import { poolRowOf } from './pool-picks-table.rows';

function row(change: Partial<PickRowView>): PickRowView {
  return {
    memberId: 'member-me',
    memberName: 'Victor',
    side: 'away',
    margin: 20,
    isDefault: false,
    dutyId: null,
    you: true,
    name: 'Victor',
    photo: null,
    teamId: '',
    clubId: 'vodacom-bulls',
    clubShortName: 'Bulls',
    clubColour: null,
    clubAccent: null,
    wp: 0,
    mp: 0,
    bp: 0,
    points: 0,
    distance: null,
    scored: false,
    correct: false,
    ...change,
  };
}

describe('poolRowOf', () => {
  it('marks nothing earned for a pick without points', () => {
    const pool = poolRowOf(row({}), 1);
    expect(pool.chip.kind).toBe('club');
    expect(pool.marks.map((mark) => [mark.key, mark.earned, mark.text])).toEqual([
      ['w', false, 'no outcome point'],
      ['m', false, 'no margin point'],
      ['b', false, 'no bonus point'],
    ]);
  });

  it('marks a whole bonus point without a fraction', () => {
    const pool = poolRowOf(row({ wp: 1, mp: 0.5, bp: 1 }), 1);
    expect(pool.marks).toEqual([
      { key: 'w', earned: true, fraction: null, text: 'outcome point' },
      { key: 'm', earned: true, fraction: null, text: 'margin point' },
      { key: 'b', earned: true, fraction: null, text: 'bonus point' },
    ]);
  });

  it('marks a shared bonus point with its share', () => {
    const bonus = poolRowOf(row({ bp: 1 / 3 }), 1).marks[2];
    expect(bonus).toEqual({
      key: 'b',
      earned: true,
      fraction: 1 / 3,
      text: '0.33 of the bonus point',
    });
  });
});
