import { URC_TEAMS } from './teams';
import { Coordinates, Country, StadiumCatalogue } from './competition.models';
import { StadiumBackgrounds } from './stadium-weather';

/** A known venue: its country, position and its icon in public/assets/images/stadiums. */
export interface Stadium extends Coordinates {
  readonly country: Country;
  readonly icon: string;
  readonly background?: string;
  readonly backgrounds?: StadiumBackgrounds;
}

/** Looks venues up by name regardless of case and surrounding space. */
export function stadiumCatalogue(venues: Readonly<Record<string, Stadium>>): StadiumCatalogue {
  const byName = new Map(Object.entries(venues).map(([name, s]) => [name.toLowerCase(), s]));
  const find = (venue: string | null | undefined) => byName.get((venue ?? '').trim().toLowerCase());
  return {
    country: (venue) => find(venue)?.country,
    icon: (venue) => find(venue)?.icon,
    background: (venue) => find(venue)?.background,
    backgrounds: (venue) => find(venue)?.backgrounds,
    position: (venue) => {
      const found = find(venue);
      return found && { latitude: found.latitude, longitude: found.longitude };
    },
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
 * Every venue in the published URC 2026/27 schedule, the country it stands in, its position
 * and its icon. Mirrors the URC stadium list in the API's competition catalogue.
 */
const URC_VENUES: Readonly<Record<string, Stadium>> = {
  '10bet Ellis Park': stadium(
    COUNTRIES.southAfrica,
    [-26.1978, 28.0606],
    'ellis-park',
    '10bet-lions',
  ),
  'Affidea Stadium': stadium(
    COUNTRIES.northernIreland,
    [54.5806, -5.9139],
    'affidea-stadium',
    'ulster-rugby',
  ),
  'Aviva Stadium': stadium(COUNTRIES.ireland, [53.3352, -6.2285], 'aviva-stadium'),
  'Cardiff Arms Park': stadium(
    COUNTRIES.wales,
    [51.4794, -3.1839],
    'cardiff-arms-park',
    'cardiff-rugby',
  ),
  'DHL Stadium': stadium(COUNTRIES.southAfrica, [-33.9036, 18.4113], 'dhl-stadium', 'dhl-stormers'),
  'Dexcom Stadium': stadium(
    COUNTRIES.ireland,
    [53.2769, -9.0355],
    'dexcom-stadium',
    'connacht-rugby',
  ),
  'Hampden Park': stadium(COUNTRIES.scotland, [55.8256, -4.252], 'hampden-park'),
  'Hive Stadium': stadium(
    COUNTRIES.scotland,
    [55.9422, -3.2408],
    'hive-stadium',
    'edinburgh-rugby',
  ),
  'Hollywoodbets Kings Park': stadium(
    COUNTRIES.southAfrica,
    [-29.8286, 31.0303],
    'kings-park',
    'hollywoodbets-sharks',
  ),
  'Laya Arena': stadium(COUNTRIES.ireland, [53.3268, -6.2287], 'laya-arena', 'leinster-rugby'),
  'Loftus Versfeld': stadium(
    COUNTRIES.southAfrica,
    [-25.7533, 28.2225],
    'loftus-versfeld',
    'vodacom-bulls',
  ),
  'Parc y Scarlets': stadium(COUNTRIES.wales, [51.6806, -4.1272], 'parc-y-scarlets', 'scarlets'),
  'Rodney Parade': stadium(COUNTRIES.wales, [51.5883, -2.9878], 'rodney-parade', 'dragons-rfc'),
  'Scotstoun Stadium': stadium(
    COUNTRIES.scotland,
    [55.8836, -4.3395],
    'scotstoun-stadium',
    'glasgow-warriors',
  ),
  'Scottish Gas Murrayfield': stadium(COUNTRIES.scotland, [55.9422, -3.2409], 'murrayfield'),
  'Stadio Monigo': stadium(COUNTRIES.italy, [45.6864, 12.2126], 'stadio-monigo', 'benetton-rugby'),
  'Stadio Sergio Lanfranchi': stadium(
    COUNTRIES.italy,
    [44.8228, 10.3116],
    'stadio-lanfranchi',
    'zebre-parma',
  ),
  "St Helen's": stadium(COUNTRIES.wales, [51.6104, -3.9633], 'st-helens', 'ospreys'),
  'Thomond Park': stadium(COUNTRIES.ireland, [52.6742, -8.6428], 'thomond-park', 'munster-rugby'),
  'Virgin Media Park': stadium(COUNTRIES.ireland, [51.8836, -8.4877], 'virgin-media-park'),
};

export const URC_STADIUMS = stadiumCatalogue(URC_VENUES);

function country(name: string, code: string): Country {
  return { name, flag: `assets/images/flags/${code}.svg` };
}

function stadium(
  country: Country,
  [latitude, longitude]: readonly [number, number],
  icon: string,
  teamId?: string,
): Stadium {
  const team = URC_TEAMS.find((t) => t.id === teamId);
  return {
    country,
    latitude,
    longitude,
    icon: `assets/images/stadiums/${icon}.webp`,
    background: team?.stadiumBackground,
    backgrounds: team?.stadiumBackgrounds,
  };
}
