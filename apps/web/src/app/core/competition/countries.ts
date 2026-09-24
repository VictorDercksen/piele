/** A country with a flag shipped in public/assets/images/flags. Source details: sources.json there. */
export interface Country {
  readonly name: string;
  readonly flag: string;
}

/**
 * Flag codes for the countries of birth the URC player feed reports, keyed by the feed's
 * spelling. Covers every country in the 2026/27 squads plus the other rugby nations.
 * Northern Ireland has no flag of its own in the set, so it uses the United Kingdom's.
 */
const FLAG_CODES: Readonly<Record<string, string>> = {
  Albania: 'al',
  Argentina: 'ar',
  Australia: 'au',
  Austria: 'at',
  Belgium: 'be',
  Botswana: 'bw',
  Canada: 'ca',
  Chile: 'cl',
  'Cook Islands': 'ck',
  'Democratic Republic of the Congo': 'cd',
  'Dominican Republic': 'do',
  England: 'gb-eng',
  Fiji: 'fj',
  France: 'fr',
  Georgia: 'ge',
  Germany: 'de',
  'Guinea-Bissau': 'gw',
  'Hong Kong': 'hk',
  Ireland: 'ie',
  Italy: 'it',
  Japan: 'jp',
  Kenya: 'ke',
  Moldova: 'md',
  Monaco: 'mc',
  Namibia: 'na',
  Netherlands: 'nl',
  'New Zealand': 'nz',
  Nigeria: 'ng',
  'Northern Ireland': 'gb',
  'Papua New Guinea': 'pg',
  Peru: 'pe',
  Portugal: 'pt',
  Romania: 'ro',
  Samoa: 'ws',
  Scotland: 'gb-sct',
  'South Africa': 'za',
  Spain: 'es',
  Tonga: 'to',
  Uganda: 'ug',
  'United Kingdom': 'gb',
  'United States': 'us',
  Uruguay: 'uy',
  Wales: 'gb-wls',
  Zambia: 'zm',
  Zimbabwe: 'zw',
};

const BY_NAME = new Map(
  Object.entries(FLAG_CODES).map(([name, code]) => [name.toLowerCase(), code]),
);

/** The country and flag for a name from the player feed, or undefined when there is no flag. */
export function countryNamed(name: string | null | undefined): Country | undefined {
  const trimmed = (name ?? '').trim();
  const code = BY_NAME.get(trimmed.toLowerCase());
  return code ? { name: trimmed, flag: `assets/images/flags/${code}.svg` } : undefined;
}
