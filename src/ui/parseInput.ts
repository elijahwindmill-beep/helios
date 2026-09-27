/** Parsers for the typed time and date fields. Both return null for anything they can't read. */

const MONTH_NAMES = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** "6:47", "06:47", "0647", "647", "6.47", "6h47", "6", "6:47 pm", "6pm", "18". */
export function parseTime(text: string): { hour: number; minute: number } | null {
  const s = text.trim().toLowerCase().replace(/\s+/g, '');
  const m = /^(\d{1,2})(?:[:.h]?(\d{2}))?(am|pm|a|p)?$/.exec(s) ?? /^(\d{1,2})[:.h](\d{1,2})(am|pm|a|p)?$/.exec(s);
  if (!m) return null;
  let hour = Number(m[1]);
  const minute = m[2] ? Number(m[2]) : 0;
  const suffix = m[3]?.[0];
  if (suffix) {
    if (hour < 1 || hour > 12) return null;
    hour = (hour % 12) + (suffix === 'p' ? 12 : 0);
  }
  if (hour === 24 && minute === 0) hour = 0;
  if (hour > 23 || minute > 59) return null;
  return { hour, minute };
}

function monthIndex(word: string): number | null {
  const i = MONTH_NAMES.indexOf(word.slice(0, 3));
  return word.length >= 3 && i >= 0 ? i + 1 : null;
}

function valid(year: number, month: number, day: number) {
  if (month < 1 || month > 12 || day < 1) return null;
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day <= last ? { year, month, day } : null;
}

function fullYear(y: string | undefined, fallback: number): number {
  if (!y) return fallback;
  const n = Number(y);
  return y.length <= 2 ? 2000 + n : n;
}

/**
 * "12 Oct 2026", "12 october", "Oct 12, 2026", "2026-10-12", "12/10/2026", "12.10.26", "12/10".
 * Numeric day/month order is day first. A missing year takes `fallbackYear`.
 */
export function parseDate(text: string, fallbackYear: number): { year: number; month: number; day: number } | null {
  const s = text.trim().toLowerCase().replace(/,/g, ' ').replace(/\s+/g, ' ');
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (m) return valid(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2}|\d{4}))?$/.exec(s);
  if (m) return valid(fullYear(m[3], fallbackYear), Number(m[2]), Number(m[1]));
  m = /^(\d{1,2})(?:st|nd|rd|th)? ?([a-z]+)\.?(?: (\d{2}|\d{4}))?$/.exec(s);
  if (m) {
    const month = monthIndex(m[2]);
    return month ? valid(fullYear(m[3], fallbackYear), month, Number(m[1])) : null;
  }
  m = /^([a-z]+)\.? (\d{1,2})(?:st|nd|rd|th)?(?: (\d{2}|\d{4}))?$/.exec(s);
  if (m) {
    const month = monthIndex(m[1]);
    return month ? valid(fullYear(m[3], fallbackYear), month, Number(m[2])) : null;
  }
  return null;
}

/**
 * "Matterhorn, Zermatt, Visp, Oberwallis, Valais/Wallis, 3920, Switzerland" → "Zermatt, Visp,
 * Switzerland": the nearest two places and the country, so the country fits on a phone.
 */
export function shortPlace(displayName: string, name: string): string {
  const parts = displayName.split(',').map((p) => p.trim()).filter((p) => p && p !== name && !/^[\d\s-]+$/.test(p));
  if (parts.length <= 3) return parts.join(', ');
  return [...parts.slice(0, 2), parts[parts.length - 1]].join(', ');
}
