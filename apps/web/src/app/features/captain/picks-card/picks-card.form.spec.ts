import { MemberPick } from '../../../core/league/league.models';
import { DerivedVsRecorded } from '../../../core/league/standings/standing.models';
import {
  invalidMargins,
  overrideEntries,
  parseMargin,
  pickChanges,
  pickOf,
  pickRow,
  settle,
} from './picks-card.form';
import { GridRow } from './picks-card.models';

function saved(memberId: string, pick: Partial<MemberPick>): MemberPick {
  return {
    memberId,
    memberName: memberId,
    side: 'home',
    margin: 7,
    isDefault: false,
    dutyId: null,
    ...pick,
  } as MemberPick;
}

function row(memberId: string, pick?: MemberPick): GridRow {
  return { memberId, name: memberId, teamId: '', group: pickRow(pick) };
}

describe('picks card form', () => {
  it('pickRow fills the controls from a saved pick', () => {
    expect(
      pickRow(saved('a', { side: 'away', margin: 12, isDefault: true })).getRawValue(),
    ).toEqual({ side: 'away', margin: '12', isDefault: true, missed: false });
    expect(pickRow(saved('a', { side: 'missed', margin: null })).getRawValue()).toEqual({
      side: '',
      margin: '',
      isDefault: false,
      missed: true,
    });
    expect(pickRow(undefined).getRawValue()).toEqual({
      side: '',
      margin: '',
      isDefault: false,
      missed: false,
    });
  });

  it('settle disables the margin and default for a draw or a missed pick', () => {
    const group = pickRow(saved('a', { side: 'draw', margin: 0 }));
    settle(group);
    expect(group.controls.margin.disabled).toBe(true);
    expect(group.controls.isDefault.disabled).toBe(true);
    group.controls.side.setValue('home');
    settle(group);
    expect(group.controls.margin.enabled).toBe(true);
    expect(group.controls.isDefault.enabled).toBe(true);
  });

  it('parseMargin accepts whole numbers from 1 to 150', () => {
    expect(parseMargin(' 7 ')).toBe(7);
    expect(parseMargin('150')).toBe(150);
    expect(parseMargin('0')).toBeNull();
    expect(parseMargin('151')).toBeNull();
    expect(parseMargin('3.5')).toBeNull();
    expect(parseMargin('')).toBeNull();
  });

  it('pickOf reads a row as a pick, or null when empty', () => {
    expect(pickOf(pickRow(saved('a', { side: 'home', margin: 5 })))).toEqual({
      side: 'home',
      margin: 5,
      isDefault: false,
    });
    expect(pickOf(pickRow(saved('a', { side: 'draw', margin: 0 })))).toEqual({
      side: 'draw',
      margin: 0,
      isDefault: false,
    });
    expect(pickOf(pickRow(saved('a', { side: 'missed', margin: null })))).toEqual({
      side: 'missed',
      margin: null,
      isDefault: false,
    });
    expect(pickOf(pickRow(undefined))).toBeNull();
  });

  it('invalidMargins lists home or away rows without a valid margin', () => {
    const bad = row('a');
    bad.group.controls.side.setValue('home');
    const draw = row('b');
    draw.group.controls.side.setValue('draw');
    expect(invalidMargins([bad, draw, row('c', saved('c', {}))]).map((r) => r.memberId)).toEqual([
      'a',
    ]);
  });

  it('pickChanges records new and changed picks, keeps duties and removes cleared ones', () => {
    const before = new Map([
      ['a', saved('a', { side: 'home', margin: 7 })],
      ['b', saved('b', { side: 'away', margin: 3, dutyId: 'd-1' })],
      ['c', saved('c', { side: 'draw', margin: 0 })],
    ]);
    const unchanged = row('a', before.get('a'));
    const changed = row('b', before.get('b'));
    changed.group.controls.margin.setValue('4');
    const cleared = row('c');
    const added = row('d');
    added.group.controls.missed.setValue(true);
    expect(pickChanges([unchanged, changed, cleared, added], before)).toEqual({
      record: [
        { memberId: 'b', side: 'away', margin: 4, isDefault: false, dutyId: 'd-1' },
        { memberId: 'd', side: 'missed', margin: null, isDefault: false },
      ],
      remove: ['c'],
    });
  });

  it('overrideEntries keeps the other recorded totals and sets the member', () => {
    const rows = [
      { memberId: 'a', recorded: 4 },
      { memberId: 'b', recorded: null },
      { memberId: 'c', recorded: 2 },
    ] as DerivedVsRecorded[];
    expect(overrideEntries(rows, 'c', 9)).toEqual([
      { memberId: 'a', points: 4 },
      { memberId: 'c', points: 9 },
    ]);
  });
});
