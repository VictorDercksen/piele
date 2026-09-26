import { MAX_MEMBERS, parseMembers } from './members-parser';

describe('parseMembers', () => {
  it('reads "Full name, Superbru name" per line, skipping blank lines', () => {
    const parsed = parseMembers('Kallie Kruger, Kallie\n\n  Sanet   Louw ,  Sanet  \r\n');
    expect(parsed.errors).toEqual([]);
    expect(parsed.members).toEqual([
      { line: 1, fullName: 'Kallie Kruger', displayName: 'Kallie' },
      { line: 3, fullName: 'Sanet Louw', displayName: 'Sanet' },
    ]);
  });

  it('takes the Superbru name after the last comma, so a full name may hold one', () => {
    expect(parseMembers('Pretorius, Johan, Johan').members).toEqual([
      { line: 1, fullName: 'Pretorius, Johan', displayName: 'Johan' },
    ]);
  });

  it('reports each unusable line with its number and keeps the rest', () => {
    const parsed = parseMembers(
      ['Kallie', 'Kruger, Kallie', ', Nameless', 'Nobody,', 'Kallie Other, kallie', 'Thabo Nkosi, Thabo'].join(
        '\n',
      ),
    );
    expect(parsed.members.map((m) => m.displayName)).toEqual(['Kallie', 'Thabo']);
    expect(parsed.errors.map((e) => [e.line, e.text])).toEqual([
      [1, 'Kallie'],
      [3, ', Nameless'],
      [4, 'Nobody,'],
      [5, 'Kallie Other, kallie'],
    ]);
    expect(parsed.errors[0].message).toContain('Full name, Superbru name');
    expect(parsed.errors[1].message).toContain('full name is missing');
    expect(parsed.errors[2].message).toContain('Superbru name is missing');
    expect(parsed.errors[3].message).toBe('kallie is already on line 2.');
  });

  it('holds names to the API’s lengths', () => {
    const long = parseMembers(`${'x'.repeat(121)}, Name\nFull, ${'y'.repeat(51)}`);
    expect(long.members).toEqual([]);
    expect(long.errors.map((e) => e.message)).toEqual([
      'Keep the full name to 120 characters.',
      'Keep the Superbru name to 50 characters.',
    ]);
  });

  it('stops at the most members a league can start with', () => {
    const text = Array.from({ length: MAX_MEMBERS + 2 }, (_, i) => `Member ${i}, M${i}`).join('\n');
    const parsed = parseMembers(text);
    expect(parsed.members.length).toBe(MAX_MEMBERS);
    expect(parsed.errors.map((e) => e.line)).toEqual([MAX_MEMBERS + 1, MAX_MEMBERS + 2]);
  });

  it('has nothing to say about an empty sheet', () => {
    expect(parseMembers('  \n ')).toEqual({ members: [], errors: [] });
  });
});
