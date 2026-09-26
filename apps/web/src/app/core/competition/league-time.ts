import { Injectable, computed, signal } from '@angular/core';

/**
 * League time. Instants are UTC; every display goes through an explicit IANA zone, which
 * `LeagueTime.zone` holds for the current league. The pure functions take the zone as their
 * last argument so they stay testable; components use the `LeagueTime` service instead.
 */
export const DEFAULT_ZONE = 'Africa/Johannesburg';

/**
 * Abbreviations for zones whose Intl short name reads as a bare offset ("GMT+2") in en-GB.
 * Zones not listed use Intl's short name (BST, GMT, CEST, GMT+13).
 */
const ABBREVIATIONS: Readonly<Record<string, string>> = {
  'Africa/Johannesburg': 'SAST',
};

type Instant = string | number | Date | null | undefined;

const formatters = new Map<string, Intl.DateTimeFormat>();

/** One cached formatter per zone and option set; building them is costly. */
function formatter(
  zone: string,
  options: Intl.DateTimeFormatOptions,
  locale = 'en-GB',
): Intl.DateTimeFormat {
  const key = `${locale}|${zone}|${JSON.stringify(options)}`;
  let format = formatters.get(key);
  if (!format) {
    format = new Intl.DateTimeFormat(locale, { ...options, timeZone: zone });
    formatters.set(key, format);
  }
  return format;
}

function toDate(value: Instant): Date | null {
  if (value === null || value === undefined || value === '') return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

const WALL_CLOCK: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
};

/** The wall-clock fields of an instant in the zone. */
function wallClock(date: Date, zone: string): Record<string, number> {
  const fields: Record<string, number> = {};
  for (const part of formatter(zone, WALL_CLOCK).formatToParts(date)) {
    if (part.type !== 'literal') fields[part.type] = Number(part.value);
  }
  return fields;
}

/** Minutes the zone is ahead of UTC at the instant (120 for SAST, 60 for BST). */
export function zoneOffsetMinutes(instant: number, zone = DEFAULT_ZONE): number {
  const f = wallClock(new Date(instant), zone);
  const asUtc = Date.UTC(f['year'], f['month'] - 1, f['day'], f['hour'], f['minute'], f['second']);
  return Math.round((asUtc - Math.floor(instant / 1000) * 1000) / 60_000);
}

/** The hour (0 to 23) on the zone's clock at the instant. */
export function hourIn(instant: number, zone = DEFAULT_ZONE): number {
  return wallClock(new Date(instant), zone)['hour'];
}

/** The zone's abbreviation at the instant ("SAST", "BST"), defaulting to now. */
export function zoneAbbreviation(zone = DEFAULT_ZONE, at: Instant = Date.now()): string {
  const known = ABBREVIATIONS[zone];
  if (known) return known;
  const date = toDate(at) ?? new Date();
  return (
    formatter(zone, { timeZoneName: 'short' })
      .formatToParts(date)
      .find((part) => part.type === 'timeZoneName')?.value ?? zone
  );
}

const DATE_ONLY: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short', year: 'numeric' };

/** `11 Oct 2026 · 20:00 SAST`, or the fallback when the instant is unknown. */
export function formatLeagueTime(
  iso: string | null | undefined,
  fallback = 'To be confirmed',
  zone = DEFAULT_ZONE,
): string {
  const date = toDate(iso);
  if (!date) return fallback;
  const [day, time] = formatter(zone, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
    .format(date)
    .split(', ');
  return `${day} · ${time} ${zoneAbbreviation(zone, date)}`;
}

/** `11 Oct 2026`, or the fallback when the instant is unknown. */
export function formatLeagueDate(
  iso: string | null | undefined,
  fallback = 'To be confirmed',
  zone = DEFAULT_ZONE,
): string {
  const date = toDate(iso);
  return date ? formatter(zone, DATE_ONLY).format(date) : fallback;
}

/** A round's date span, `25 Sept – 04 Oct 2026` (Intl collapses shared parts). */
export function formatLeagueDateRange(
  startIso: string,
  endIso: string,
  zone = DEFAULT_ZONE,
): string {
  return formatter(zone, DATE_ONLY).formatRange(new Date(startIso), new Date(endIso));
}

/** A fixture's day and kickoff time on the zone's clock: `FRI 25 SEPT` and `20:45`. */
export function fixtureDayAndTime(iso: string, zone = DEFAULT_ZONE): { day: string; time: string } {
  const date = new Date(iso);
  return {
    day: formatter(zone, { weekday: 'short', day: '2-digit', month: 'short' })
      .format(date)
      .toUpperCase(),
    time: formatter(zone, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(date),
  };
}

/** `3 h ago`, `2 d ago`, or the date for anything older than a week. */
export function formatRelative(iso: string, now = new Date(), zone = DEFAULT_ZONE): string {
  const then = new Date(iso).getTime();
  const minutes = Math.round((now.getTime() - then) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} d ago`;
  return formatLeagueDate(iso, undefined, zone);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Formats an instant with a small DatePipe-style pattern on the zone's clock. Tokens: `d`
 * (day), `dd`, `MMM` (`Sep`), `HH`, `mm`, `ss` and `z` (the zone's abbreviation).
 */
export function formatInZone(
  value: Instant,
  pattern: string,
  zone = DEFAULT_ZONE,
  fallback = '',
): string {
  const date = toDate(value);
  if (!date) return fallback;
  const f = wallClock(date, zone);
  const pad = (n: number) => String(n).padStart(2, '0');
  const tokens: Record<string, () => string> = {
    dd: () => pad(f['day']),
    d: () => String(f['day']),
    MMM: () => MONTHS[f['month'] - 1],
    HH: () => pad(f['hour']),
    mm: () => pad(f['minute']),
    ss: () => pad(f['second']),
    z: () => zoneAbbreviation(zone, date),
  };
  return pattern.replace(/dd|d|MMM|HH|mm|ss|z/g, (token) => tokens[token]());
}

/** Value for a `datetime-local` input, on the zone's clock. */
export function toLocalInput(iso: string | null, zone = DEFAULT_ZONE): string {
  const date = toDate(iso);
  if (!date) return '';
  const f = wallClock(date, zone);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${f['year']}-${pad(f['month'])}-${pad(f['day'])}T${pad(f['hour'])}:${pad(f['minute'])}`;
}

/**
 * Reads a `datetime-local` value entered on the zone's clock back to a UTC instant. The
 * offset is the zone's at that moment, so daylight saving is honoured: the first guess
 * uses the offset at the wall-clock time read as UTC, then one correction uses the offset
 * at the resulting instant. A time skipped by a spring-forward lands an hour later; a time
 * in the autumn overlap takes one of its two readings.
 */
export function fromLocalInput(value: string, zone = DEFAULT_ZONE): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value ?? '');
  if (!match) return null;
  const [, y, mo, d, h, mi, s] = match.map(Number);
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || s > 59) return null;
  const wall = Date.UTC(y, mo - 1, d, h, mi, Number.isNaN(s) ? 0 : s);
  const first = wall - zoneOffsetMinutes(wall, zone) * 60_000;
  const corrected = wall - zoneOffsetMinutes(first, zone) * 60_000;
  return new Date(corrected).toISOString();
}

/**
 * The display time zone, `Africa/Johannesburg` until a league sets its own. Its methods
 * read `zone`, so calling them inside a computed or template follows zone changes.
 */
@Injectable({ providedIn: 'root' })
export class LeagueTime {
  readonly zone = signal(DEFAULT_ZONE);
  /** The zone's abbreviation now, for labels such as "Deadline (SAST)". */
  readonly abbreviation = computed(() => zoneAbbreviation(this.zone()));

  /** The zone's abbreviation at the instant, which differs across daylight saving. */
  abbreviationAt(at: Instant): string {
    return zoneAbbreviation(this.zone(), at);
  }

  format(iso: string | null | undefined, fallback?: string): string {
    return formatLeagueTime(iso, fallback, this.zone());
  }

  formatDate(iso: string | null | undefined, fallback?: string): string {
    return formatLeagueDate(iso, fallback, this.zone());
  }

  relative(iso: string, now = new Date()): string {
    return formatRelative(iso, now, this.zone());
  }

  pattern(value: Instant, pattern: string, fallback = ''): string {
    return formatInZone(value, pattern, this.zone(), fallback);
  }

  toLocalInput(iso: string | null): string {
    return toLocalInput(iso, this.zone());
  }

  fromLocalInput(value: string): string | null {
    return fromLocalInput(value, this.zone());
  }
}
