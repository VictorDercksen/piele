/** One choosable IANA time zone: `Africa/Johannesburg` shown as `Johannesburg (GMT+2)`. */
export interface ZoneOption {
  readonly id: string;
  readonly label: string;
}

/** The zones of one region (`Africa`, `America`, …), for an `<optgroup>`. */
export interface ZoneGroup {
  readonly region: string;
  readonly zones: readonly ZoneOption[];
}

/** Used when the browser cannot list its zones (`Intl.supportedValuesOf`). */
const FALLBACK_ZONES = [
  'Africa/Johannesburg',
  'America/New_York',
  'Asia/Tokyo',
  'Australia/Sydney',
  'Europe/Dublin',
  'Europe/London',
  'Europe/Rome',
  'Pacific/Auckland',
];

let groups: readonly ZoneGroup[] | null = null;

/**
 * Every IANA time zone this browser knows, grouped by region and sorted, plus UTC. A zone
 * outside the list (a league saved with an older alias) is added so the select can show it.
 */
export function timeZoneGroups(current = ''): readonly ZoneGroup[] {
  groups ??= buildGroups(allZones());
  const zone = current.trim();
  if (!zone || groups.some((g) => g.zones.some((z) => z.id === zone))) return groups;
  return [...groups, { region: 'Current', zones: [option(zone)] }];
}

function allZones(): string[] {
  let zones: string[];
  try {
    zones = Intl.supportedValuesOf('timeZone');
  } catch {
    zones = FALLBACK_ZONES;
  }
  return zones.includes('UTC') ? zones : [...zones, 'UTC'];
}

function buildGroups(zones: readonly string[]): readonly ZoneGroup[] {
  const byRegion = new Map<string, ZoneOption[]>();
  for (const id of zones) {
    const region = id.includes('/') ? id.slice(0, id.indexOf('/')) : 'Other';
    const list = byRegion.get(region) ?? [];
    list.push(option(id));
    byRegion.set(region, list);
  }
  return [...byRegion.entries()]
    .sort(([a], [b]) => (a === 'Other' ? 1 : b === 'Other' ? -1 : a.localeCompare(b)))
    .map(([region, list]) => ({
      region,
      zones: list.sort((a, b) => a.label.localeCompare(b.label)),
    }));
}

/** `America/Argentina/Buenos_Aires` → `Argentina / Buenos Aires (GMT-3)`. */
function option(id: string): ZoneOption {
  const place = id.includes('/') ? id.slice(id.indexOf('/') + 1) : id;
  const name = place.replaceAll('_', ' ').replaceAll('/', ' / ');
  const offset = gmtOffset(id);
  return { id, label: offset ? `${name} (${offset})` : name };
}

function gmtOffset(id: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: id,
      timeZoneName: 'shortOffset',
    }).formatToParts(new Date());
    return parts.find((p) => p.type === 'timeZoneName')?.value ?? '';
  } catch {
    return '';
  }
}

/** Options for the shared searchable Spartan select, retaining saved IANA aliases. */
export function timeZoneSelectGroups(current = '') {
  return timeZoneGroups(current).map((group) => ({
    label: group.region,
    options: group.zones.map((zone) => ({ value: zone.id, label: zone.label })),
  }));
}
