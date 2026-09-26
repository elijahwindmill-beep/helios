import exifr from 'exifr/dist/lite.esm.mjs';
import { timeZoneAt } from '../sun/timezone';
import { exifTimeToUtc } from './photoTime';

export interface PhotoInfo {
  gps: { lat: number; lng: number } | null;
  takenAt: number | null;
  thumb: string | null;
}

const THUMB = 96;

/** Square, centre-cropped JPEG thumbnail, or null when the browser can't decode the file (HEIC outside Safari). */
async function thumbnail(file: Blob): Promise<string | null> {
  try {
    const bmp = await createImageBitmap(file);
    const side = Math.min(bmp.width, bmp.height);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = THUMB;
    canvas.getContext('2d')!.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, THUMB, THUMB);
    bmp.close();
    return canvas.toDataURL('image/jpeg', 0.8);
  } catch {
    return null;
  }
}

/** `fallbackTimeZone` reads the capture time when the file has neither GPS nor a UTC offset. */
export async function readPhoto(file: File, fallbackTimeZone: string): Promise<PhotoInfo> {
  // One read for GPS and time. Raw values keep the capture time as written ("2026:09:26 10:06:00")
  // instead of a Date in the browser's timezone. (exifr's `pick` option fails in the lite build.)
  const [tags, thumb] = await Promise.all([
    exifr.parse(file, { gps: true, exif: true, xmp: false, reviveValues: false }).catch(() => undefined),
    thumbnail(file),
  ]);
  const lat = tags?.latitude;
  const lng = tags?.longitude;
  const ok = Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0);
  const where = ok ? { lat: lat as number, lng: lng as number } : null;
  const takenAt = tags
    ? exifTimeToUtc(tags.DateTimeOriginal, tags.OffsetTimeOriginal ?? tags.OffsetTime, where ? timeZoneAt(where.lat, where.lng) : fallbackTimeZone)
    : null;
  return { gps: where, takenAt, thumb };
}

export function isPhoto(file: File): boolean {
  return file.type.startsWith('image/') || /\.(jpe?g|heic|heif)$/i.test(file.name);
}
