/** League time formatting. Instants are UTC; the display zone is explicit. */
const ZONE = 'Africa/Johannesburg';

const dateTime = new Intl.DateTimeFormat('en-GB', {
  timeZone: ZONE,
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

const dateOnly = new Intl.DateTimeFormat('en-GB', {
  timeZone: ZONE,
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

/** `11 Oct 2026 · 20:00 SAST`, or the fallback when the instant is unknown. */
export function formatLeagueTime(iso: string | null | undefined, fallback = 'To be confirmed'): string {
  if (!iso) return fallback;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return fallback;
  const [day, time] = dateTime.format(date).split(', ');
  return `${day} · ${time} SAST`;
}

export function formatLeagueDate(iso: string | null | undefined, fallback = 'To be confirmed'): string {
  if (!iso) return fallback;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? fallback : dateOnly.format(date);
}

/** `3 h ago`, `2 d ago`, or the date for anything older than a week. */
export function formatRelative(iso: string, now = new Date()): string {
  const then = new Date(iso).getTime();
  const minutes = Math.round((now.getTime() - then) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} d ago`;
  return formatLeagueDate(iso);
}

/** Value for a `datetime-local` input, in league time. */
export function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}

/** Reads a `datetime-local` value entered in league time back to a UTC instant. SAST has no DST. */
export function fromLocalInput(value: string): string | null {
  if (!value) return null;
  const date = new Date(`${value}:00+02:00`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
