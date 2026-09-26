import { RESERVED_SLUGS, SLUG_PATTERN, deriveSlug, slugProblem } from './league-slugs';

describe('league slugs', () => {
  it('derive a kebab-case slug from the name', () => {
    expect(deriveSlug('Pofadder Bowl')).toBe('pofadder-bowl');
    expect(deriveSlug('  Die Ou Manne 2027! ')).toBe('die-ou-manne-2027');
    expect(deriveSlug('Kallie’s Spoon -- Club')).toBe('kallies-spoon-club');
    expect(deriveSlug('Vrystaat Hoërskool')).toBe('vrystaat-hoerskool');
    expect(deriveSlug('***')).toBe('');
  });

  it('keep a derived slug within 40 characters without a trailing hyphen', () => {
    const slug = deriveSlug('The Extremely Long Named Social Rugby League Of Friends');
    expect(slug.length).toBeLessThanOrEqual(40);
    expect(slug.endsWith('-')).toBe(false);
    expect(SLUG_PATTERN.test(slug)).toBe(true);
  });

  it('accept a slug the API accepts', () => {
    expect(slugProblem('pofadder-bowl')).toBeNull();
    expect(slugProblem('xv7')).toBeNull();
  });

  it('explain an empty, malformed or reserved slug', () => {
    expect(slugProblem('')).toContain('slug');
    expect(slugProblem('ab')).toContain('3 to 40');
    expect(slugProblem('-bowl')).toContain('3 to 40');
    expect(slugProblem('Bowl')).toContain('lower-case');
    expect(slugProblem('a'.repeat(41))).toContain('3 to 40');
    for (const word of RESERVED_SLUGS) expect(slugProblem(word)).toContain('app’s own paths');
  });

  it('reserve the app’s own paths', () => {
    expect([...RESERVED_SLUGS].sort()).toEqual(
      [
        'sign-in',
        'join',
        'no-league',
        'manage',
        'standings',
        'duties',
        'decisions',
        'constitution',
        'captain',
        'more',
        'profile',
        'welcome',
        'match',
        'api',
        'v1',
      ].sort(),
    );
  });
});
