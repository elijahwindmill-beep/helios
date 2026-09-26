/**
 * Photo spots: geotagged photos on Wikimedia Commons, placed where the camera stood.
 * Every Commons file carries a free licence (most allow paid use with credit); the author and
 * licence are shown with each photo. https://commons.wikimedia.org/w/api.php
 */

const API = 'https://commons.wikimedia.org/w/api.php';

export interface Taken {
  year: number;
  month: number;
  day: number | null;
  hour: number | null;
  minute: number | null;
}

export interface PhotoSpot {
  id: number;
  title: string;
  lat: number;
  lng: number;
  /** Small thumbnail for the map marker. */
  thumb: string;
  /** Up to 1280 px wide, for the viewer. */
  large: string;
  /** The file's page on Commons (licence, full size, description). */
  page: string;
  artist: string;
  license: string;
  licenseUrl: string | null;
  taken: Taken | null;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', '#039': "'", '#39': "'", nbsp: ' ' };

/** Plain text from Commons' HTML fields. */
export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(amp|lt|gt|quot|#0?39|nbsp);/g, (_, e) => ENTITIES[e])
    .replace(/\s+/g, ' ')
    .trim();
}

/** The author's name from Commons' Artist field, which is sometimes a whole credit box. */
export function artistName(html: string): string {
  const text = stripHtml(html);
  const by = /(?:taken|made|created|photographed) by\s+([^.]+?)\s*\./i.exec(text);
  const name = by ? by[1] : text;
  return name.length > 60 ? name.slice(0, 57).trimEnd() + '…' : name;
}

/** "2013-12-21 13:45:02", "2012-08-24", "2010-08" (may be wrapped in HTML), or null. */
export function parseTaken(value: string | undefined): Taken | null {
  if (!value) return null;
  const m = /(\d{4})-(\d{2})(?:-(\d{2}))?(?:[ T](\d{2}):(\d{2}))?/.exec(stripHtml(value));
  if (!m) return null;
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  return {
    year: Number(m[1]),
    month,
    day: m[3] ? Number(m[3]) : null,
    hour: m[4] ? Number(m[4]) : null,
    minute: m[5] ? Number(m[5]) : null,
  };
}

const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];

/** Which way the camera faced, from a file page's {{Location|…|heading:NE}} template. */
export function headingFromWikitext(text: string): number | null {
  const m = /heading:\s*([A-Za-z]{1,3}|\d+(?:\.\d+)?)/.exec(text);
  if (!m) return null;
  const v = m[1].toUpperCase();
  const i = COMPASS.indexOf(v);
  if (i >= 0) return i * 22.5;
  const deg = Number(v);
  return Number.isFinite(deg) ? ((deg % 360) + 360) % 360 : null;
}

interface ApiPage {
  pageid: number;
  title: string;
  coordinates?: Array<{ lat: number; lon: number; type?: string }>;
  imageinfo?: Array<{
    url: string;
    thumburl?: string;
    width?: number;
    descriptionurl: string;
    mime?: string;
    extmetadata?: Record<string, { value: string }>;
  }>;
}

export function parseSpots(json: { query?: { pages?: ApiPage[] } }): PhotoSpot[] {
  const out: PhotoSpot[] = [];
  for (const p of json.query?.pages ?? []) {
    const info = p.imageinfo?.[0];
    // Where the camera stood, not where the subject is.
    const at = p.coordinates?.find((c) => c.type !== 'object');
    if (!info || !at || !info.thumburl || !/^image\/(jpeg|png|webp)$/.test(info.mime ?? '')) continue;
    const meta = info.extmetadata ?? {};
    const large = (info.width ?? 0) > 1280 ? info.thumburl.replace(/\/\d+px-/, '/1280px-') : info.url;
    out.push({
      id: p.pageid,
      title: p.title.replace(/^File:/, '').replace(/\.[a-z0-9]+$/i, '').replace(/_/g, ' '),
      lat: at.lat,
      lng: at.lon,
      thumb: info.thumburl,
      large,
      page: info.descriptionurl,
      artist: artistName(meta.Artist?.value ?? ''),
      license: stripHtml(meta.LicenseShortName?.value ?? 'See file page'),
      licenseUrl: meta.LicenseUrl?.value ?? null,
      taken: parseTaken(meta.DateTimeOriginal?.value),
    });
  }
  return out;
}

/** Commons' search is sometimes briefly overloaded; the caller tries again later. */
export class CommonsBusy extends Error {}

/** Up to 50 geotagged photos within `radius` metres (at most 10 km), nearest first. */
export async function fetchSpots(lat: number, lng: number, radius = 10000, signal?: AbortSignal): Promise<PhotoSpot[]> {
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    formatversion: '2',
    origin: '*',
    generator: 'geosearch',
    ggscoord: `${lat.toFixed(5)}|${lng.toFixed(5)}`,
    ggsradius: String(Math.min(10000, Math.round(radius))),
    ggslimit: '50',
    ggsnamespace: '6',
    prop: 'imageinfo|coordinates',
    iiprop: 'url|size|mime|extmetadata',
    iiurlwidth: '160',
    iiextmetadatafilter: 'Artist|LicenseShortName|LicenseUrl|DateTimeOriginal',
    coprop: 'type',
    colimit: 'max',
  });
  const res = await fetch(`${API}?${params}`, { signal });
  if (!res.ok) throw new Error(`Wikimedia Commons ${res.status}`);
  const json = await res.json();
  if (json.error) {
    if (/busy|ratelimit|maxlag/i.test(json.error.code ?? '')) throw new CommonsBusy(json.error.info);
    throw new Error(json.error.info ?? 'Wikimedia Commons error');
  }
  return parseSpots(json);
}

/** The camera direction for one file, when its page records it (few do). */
export async function fetchHeading(pageId: number): Promise<number | null> {
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    formatversion: '2',
    origin: '*',
    pageids: String(pageId),
    prop: 'revisions',
    rvprop: 'content',
    rvslots: 'main',
  });
  const res = await fetch(`${API}?${params}`);
  if (!res.ok) return null;
  const json = await res.json();
  const text: string = json.query?.pages?.[0]?.revisions?.[0]?.slots?.main?.content ?? '';
  return headingFromWikitext(text);
}
