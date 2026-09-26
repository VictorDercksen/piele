import { URC_TEAMS } from './teams';
import { Country, StadiumCatalogue } from './competition.models';

/** A known venue: its country and its icon in public/assets/images/stadiums. */
export interface Stadium {
  readonly country: Country;
  readonly icon: string;
  readonly background?: string;
}

/** Looks venues up by name regardless of case and surrounding space. */
export function stadiumCatalogue(venues: Readonly<Record<string, Stadium>>): StadiumCatalogue {
  const byName = new Map(Object.entries(venues).map(([name, s]) => [name.toLowerCase(), s]));
  const find = (venue: string | null | undefined) => byName.get((venue ?? '').trim().toLowerCase());
  return {
    country: (venue) => find(venue)?.country,
    icon: (venue) => find(venue)?.icon,
    background: (venue) => find(venue)?.background,
  };
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
 * Mirrors the URC stadium list in the API's competition catalogue.
 */
const URC_VENUES: Readonly<Record<string, Stadium>> = {
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

export const URC_STADIUMS = stadiumCatalogue(URC_VENUES);

function country(name: string, code: string): Country {
  return { name, flag: `assets/images/flags/${code}.svg` };
}

function stadium(country: Country, icon: string, teamId?: string): Stadium {
  return {
    country,
    icon: `assets/images/stadiums/${icon}.webp`,
    background: URC_TEAMS.find((team) => team.id === teamId)?.stadiumBackground,
  };
}
