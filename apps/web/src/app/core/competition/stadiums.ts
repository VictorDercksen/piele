import { club } from './teams';

/** A country flag shipped in public/assets/images/flags. Source details: sources.json there. */
export interface StadiumCountry {
  readonly name: string;
  readonly flag: string;
}

/** A known URC venue: its country and its icon in public/assets/images/stadiums. */
interface Stadium {
  readonly country: StadiumCountry;
  readonly icon: string;
  readonly background?: string;
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
 * Every venue in the published URC 2026/27 schedule, the country it stands in and its icon.
 * Mirrors the stadium list in apps/api/app/matchcentre/catalogue.py.
 */
const STADIUMS: Readonly<Record<string, Stadium>> = {
  '10bet Ellis Park': stadium(COUNTRIES.southAfrica, 'ellis-park', '10bet-lions'),
  'Affidea Stadium': stadium(COUNTRIES.northernIreland, 'affidea-stadium', 'ulster-rugby'),
  'Aviva Stadium': stadium(COUNTRIES.ireland, 'aviva-stadium'),
  'Cardiff Arms Park': stadium(COUNTRIES.wales, 'cardiff-arms-park', 'cardiff-rugby'),
  'DHL Stadium': stadium(COUNTRIES.southAfrica, 'dhl-stadium', 'dhl-stormers'),
  'Dexcom Stadium': stadium(COUNTRIES.ireland, 'dexcom-stadium', 'connacht-rugby'),
  'Hampden Park': stadium(COUNTRIES.scotland, 'hampden-park'),
  'Hive Stadium': stadium(COUNTRIES.scotland, 'hive-stadium', 'edinburgh-rugby'),
  'Hollywoodbets Kings Park': stadium(COUNTRIES.southAfrica, 'kings-park', 'hollywoodbets-sharks'),
  'Laya Arena': stadium(COUNTRIES.ireland, 'laya-arena', 'leinster-rugby'),
  'Loftus Versfeld': stadium(COUNTRIES.southAfrica, 'loftus-versfeld', 'vodacom-bulls'),
  'Parc y Scarlets': stadium(COUNTRIES.wales, 'parc-y-scarlets', 'scarlets'),
  'Rodney Parade': stadium(COUNTRIES.wales, 'rodney-parade', 'dragons-rfc'),
  'Scotstoun Stadium': stadium(COUNTRIES.scotland, 'scotstoun-stadium', 'glasgow-warriors'),
  'Scottish Gas Murrayfield': stadium(COUNTRIES.scotland, 'murrayfield'),
  'Stadio Monigo': stadium(COUNTRIES.italy, 'stadio-monigo', 'benetton-rugby'),
  'Stadio Sergio Lanfranchi': stadium(COUNTRIES.italy, 'stadio-lanfranchi', 'zebre-parma'),
  "St Helen's": stadium(COUNTRIES.wales, 'st-helens', 'ospreys'),
  'Thomond Park': stadium(COUNTRIES.ireland, 'thomond-park', 'munster-rugby'),
  'Virgin Media Park': stadium(COUNTRIES.ireland, 'virgin-media-park'),
};

const BY_NAME = new Map(Object.entries(STADIUMS).map(([name, s]) => [name.toLowerCase(), s]));

/** The country of a known URC venue, or undefined for an unconfirmed or unknown one. */
export function stadiumCountry(venue: string | null | undefined): StadiumCountry | undefined {
  return find(venue)?.country;
}

/** The icon of a known URC venue, or undefined for an unconfirmed or unknown one. */
export function stadiumIcon(venue: string | null | undefined): string | undefined {
  return find(venue)?.icon;
}

/** Match-night artwork for the actual venue. Alternate grounds use the generic fallback. */
export function stadiumBackground(venue: string | null | undefined): string | undefined {
  return find(venue)?.background;
}

function find(venue: string | null | undefined): Stadium | undefined {
  return BY_NAME.get((venue ?? '').trim().toLowerCase());
}

function country(name: string, code: string): StadiumCountry {
  return { name, flag: `assets/images/flags/${code}.svg` };
}

function stadium(country: StadiumCountry, icon: string, teamId?: string): Stadium {
  return {
    country,
    icon: `assets/images/stadiums/${icon}.webp`,
    background: club(teamId ?? '')?.stadiumBackground,
  };
}
