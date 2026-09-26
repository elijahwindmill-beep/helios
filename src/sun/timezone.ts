import tzlookup from '@photostructure/tz-lookup';

/** IANA timezone for a place, e.g. "Europe/Rome" for Seceda. */
export function timeZoneAt(lat: number, lng: number): string {
  try {
    return tzlookup(lat, lng);
  } catch {
    return 'UTC';
  }
}

export interface ZonedParts {
  year: number;
  /** 1-12 */
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(timeZone: string) {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    });
    formatters.set(timeZone, f);
  }
  return f;
}

/** Wall-clock date and time of an instant in a timezone. */
export function zonedParts(ms: number, timeZone: string): ZonedParts {
  const out: Record<string, number> = {};
  for (const p of formatter(timeZone).formatToParts(new Date(ms))) {
    if (p.type !== 'literal') out[p.type] = Number(p.value);
  }
  return { year: out.year, month: out.month, day: out.day, hour: out.hour, minute: out.minute, second: out.second };
}

/** Minutes the zone is ahead of UTC at an instant (e.g. 120 for CEST). */
export function utcOffsetMinutes(ms: number, timeZone: string): number {
  const p = zonedParts(ms, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(ms / 1000) * 1000) / 60000);
}

/** The instant a wall-clock time happens in a timezone. */
export function zonedToUtc(p: Omit<ZonedParts, 'second'> & { second?: number }, timeZone: string): number {
  const wall = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second ?? 0);
  // The offset depends on the instant itself (DST), so refine once.
  let ms = wall - utcOffsetMinutes(wall, timeZone) * 60000;
  ms = wall - utcOffsetMinutes(ms, timeZone) * 60000;
  return ms;
}

/** Local midnight at the start of the day containing `ms`. */
export function startOfZonedDay(ms: number, timeZone: string): number {
  const p = zonedParts(ms, timeZone);
  return zonedToUtc({ year: p.year, month: p.month, day: p.day, hour: 0, minute: 0 }, timeZone);
}

export function formatOffset(minutes: number): string {
  const sign = minutes < 0 ? '−' : '+';
  const a = Math.abs(minutes);
  const h = Math.floor(a / 60);
  const m = a % 60;
  return `UTC${sign}${h}${m ? `:${String(m).padStart(2, '0')}` : ''}`;
}

export function formatClock(ms: number, timeZone: string): string {
  const p = zonedParts(ms, timeZone);
  return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatDate(ms: number, timeZone: string): string {
  const p = zonedParts(ms, timeZone);
  return `${p.day} ${MONTHS[p.month - 1]} ${p.year}`;
}
