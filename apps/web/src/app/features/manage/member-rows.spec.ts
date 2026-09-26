import { MAX_MEMBERS, MemberRow, checkMembers } from './member-rows';

const row = (name: string, surname: string, superbru: string): MemberRow => ({
  name,
  surname,
  superbru,
});

describe('checkMembers', () => {
  it('joins name and surname into the full name, skipping blank rows', () => {
    const checked = checkMembers([
      row('Kallie', 'Kruger', 'Kallie'),
      row(' ', '', ''),
      row('  Sanet ', '  van  der Merwe ', '  Sanet  '),
    ]);
    expect(checked.errors).toEqual([]);
    expect(checked.members).toEqual([
      { row: 0, fullName: 'Kallie Kruger', displayName: 'Kallie' },
      { row: 2, fullName: 'Sanet van der Merwe', displayName: 'Sanet' },
    ]);
  });

  it('allows a member without a surname', () => {
    expect(checkMembers([row('Doempie', '', 'Doempie')]).members).toEqual([
      { row: 0, fullName: 'Doempie', displayName: 'Doempie' },
    ]);
  });

  it('reports each unusable row with the input to fix and keeps the rest', () => {
    const checked = checkMembers([
      row('', 'Kruger', 'Kallie'),
      row('Thabo', 'Nkosi', ''),
      row('Kallie', 'Kruger', 'Kallie'),
      row('Kallie', 'Other', 'kallie'),
    ]);
    expect(checked.members.map((m) => m.displayName)).toEqual(['Kallie']);
    expect(checked.errors).toEqual([
      { row: 0, field: 'name', message: 'Add the name.' },
      { row: 1, field: 'superbru', message: 'Add the Superbru name.' },
      { row: 3, field: 'superbru', message: 'kallie is already member 3.', duplicate: true },
    ]);
  });

  it('holds names to the API’s lengths', () => {
    const checked = checkMembers([
      row('x'.repeat(60), 'y'.repeat(60), 'Name'),
      row('Full', '', 'y'.repeat(51)),
    ]);
    expect(checked.members).toEqual([]);
    expect(checked.errors.map((e) => [e.field, e.message])).toEqual([
      ['surname', 'Keep the name and surname to 120 characters.'],
      ['superbru', 'Keep the Superbru name to 50 characters.'],
    ]);
  });

  it('stops at the most members a league can start with', () => {
    const rows = Array.from({ length: MAX_MEMBERS + 2 }, (_, i) => row(`Member`, `${i}`, `M${i}`));
    const checked = checkMembers(rows);
    expect(checked.members.length).toBe(MAX_MEMBERS);
    expect(checked.errors.map((e) => e.row)).toEqual([MAX_MEMBERS, MAX_MEMBERS + 1]);
  });

  it('has nothing to say about an empty sheet', () => {
    expect(checkMembers([row('', '', ''), row(' ', ' ', ' ')])).toEqual({
      members: [],
      errors: [],
    });
  });
});
