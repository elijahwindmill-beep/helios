import { zonedToUtc } from '../sun/timezone';

/**
 * EXIF capture time to UTC ms. EXIF stores local wall-clock time ("2026:09:26 10:06:00"),
 * with the UTC offset in a separate tag on newer cameras and phones ("+02:00"). Without
 * the offset, the time is taken as local time where the photo was shot.
 */
export function exifTimeToUtc(raw: unknown, offset: unknown, timeZone: string): number | null {
  if (typeof raw !== 'string') return null;
  const m = /^(\d{4})[:-](\d{2})[:-](\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(raw.trim());
  if (!m) return null;
  const [year, month, day, hour, minute, second] = m.slice(1).map((v) => Number(v ?? 0));
  if (!year || month < 1 || month > 12) return null;
  const o = typeof offset === 'string' ? /^([+-])(\d{2}):?(\d{2})$/.exec(offset.trim()) : null;
  if (o) {
    const mins = (o[1] === '-' ? -1 : 1) * (Number(o[2]) * 60 + Number(o[3]));
    return Date.UTC(year, month - 1, day, hour, minute, second) - mins * 60000;
  }
  return zonedToUtc({ year, month, day, hour, minute, second }, timeZone);
}
