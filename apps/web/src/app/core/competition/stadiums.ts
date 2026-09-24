/** A country flag shipped in public/assets/images/flags. Source details: sources.json there. */
export interface StadiumCountry {
  readonly name: string;
  readonly flag: string;
}

const COUNTRIES = {
  southAfrica: country('South Africa', 'za'),
  ireland: country('Ireland', 'ie'),
  northernIreland: country('Northern Ireland', 'gb'),
  scotland: country('Scotland', 'gb-sct'),
  wales: country('Wales', 'gb-wls'),
  italy: country('Italy', 'it'),
} as const;

/**
 * Every venue in the published URC 2026/27 schedule and the country it stands in.
 * Mirrors the stadium list in apps/api/app/matchcentre/catalogue.py.
 */
const STADIUMS: Readonly<Record<string, StadiumCountry>> = {
  '10bet Ellis Park': COUNTRIES.southAfrica,
  'Affidea Stadium': COUNTRIES.northernIreland,
  'Aviva Stadium': COUNTRIES.ireland,
  'Cardiff Arms Park': COUNTRIES.wales,
  'DHL Stadium': COUNTRIES.southAfrica,
  'Dexcom Stadium': COUNTRIES.ireland,
  'Hampden Park': COUNTRIES.scotland,
  'Hive Stadium': COUNTRIES.scotland,
  'Hollywoodbets Kings Park': COUNTRIES.southAfrica,
  'Laya Arena': COUNTRIES.ireland,
  'Loftus Versfeld': COUNTRIES.southAfrica,
  'Parc y Scarlets': COUNTRIES.wales,
  'Rodney Parade': COUNTRIES.wales,
  'Scotstoun Stadium': COUNTRIES.scotland,
  'Scottish Gas Murrayfield': COUNTRIES.scotland,
  'Stadio Monigo': COUNTRIES.italy,
  'Stadio Sergio Lanfranchi': COUNTRIES.italy,
  "St Helen's": COUNTRIES.wales,
  'Thomond Park': COUNTRIES.ireland,
  'Virgin Media Park': COUNTRIES.ireland,
};

const BY_NAME = new Map(Object.entries(STADIUMS).map(([name, c]) => [name.toLowerCase(), c]));

/** The country of a known URC venue, or undefined for an unconfirmed or unknown one. */
export function stadiumCountry(venue: string | null | undefined): StadiumCountry | undefined {
  return BY_NAME.get((venue ?? '').trim().toLowerCase());
}

function country(name: string, code: string): StadiumCountry {
  return { name, flag: `assets/images/flags/${code}.svg` };
}
