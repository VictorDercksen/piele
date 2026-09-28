import { PickRowView } from '../../../core/league/picks/pick.models';
import { chipOf } from './pick-chip.view';

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
    clubColour: '#003',
    clubAccent: '#fff',
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

describe('chipOf', () => {
  it('shows a club pick with its colours and margin', () => {
    expect(chipOf(row({ isDefault: true }))).toEqual({
      kind: 'club',
      label: 'Bulls',
      margin: 20,
      colour: '#003',
      accent: '#fff',
      isDefault: true,
    });
  });

  it('shows a draw and a missed pick without a margin', () => {
    expect(chipOf(row({ side: 'draw', margin: 0 }))).toEqual(
      expect.objectContaining({ kind: 'draw', label: 'Draw', margin: null }),
    );
    expect(chipOf(row({ side: 'missed', margin: null }))).toEqual(
      expect.objectContaining({ kind: 'missed', label: 'No pick', margin: null }),
    );
  });
});
