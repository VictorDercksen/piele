/**
 * League slugs, the first segment of every league page (`/piele/duties`). The API checks the
 * same pattern and reserved words (`app.league.service.SLUG_PATTERN`, `RESERVED_SLUGS`);
 * these let the management centre explain a bad slug before it asks.
 */
export const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])?$/;

/** Top-level paths of the web app and the API that a slug must never shadow. */
export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
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
]);

/**
 * A slug from a league's name: lower-case ASCII letters and digits joined by single hyphens,
 * at most 40 characters. `Pofadder Bowl` gives `pofadder-bowl`, `Die Ou Manne 2027!`
 * `die-ou-manne-2027`. It may still be too short or reserved; `slugProblem` says.
 */
export function deriveSlug(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '');
}

/** Why a slug cannot be used, or null when it can. */
export function slugProblem(slug: string): string | null {
  if (!slug) return 'Give the league a slug for its address.';
  if (RESERVED_SLUGS.has(slug)) return `“${slug}” is one of the app’s own paths. Choose another.`;
  if (!SLUG_PATTERN.test(slug))
    return 'Use 3 to 40 lower-case letters, digits and hyphens, starting and ending with a letter or digit.';
  return null;
}
