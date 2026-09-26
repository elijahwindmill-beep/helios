import { describe, expect, it } from 'vitest';
import { exifTimeToUtc } from '../../src/layers/photoTime';

describe('photo capture time', () => {
  it('uses the offset tag when there is one', () => {
    expect(exifTimeToUtc('2026:09:26 10:06:00', '+02:00', 'UTC')).toBe(Date.parse('2026-09-26T08:06:00Z'));
    expect(exifTimeToUtc('2026:01:10 07:30:15', '-0500', 'UTC')).toBe(Date.parse('2026-01-10T12:30:15Z'));
  });
  it("falls back to the photo location's timezone", () => {
    expect(exifTimeToUtc('2026:09:26 10:06:00', undefined, 'Europe/Rome')).toBe(Date.parse('2026-09-26T08:06:00Z'));
    expect(exifTimeToUtc('2026:12:26 10:06:00', null, 'Europe/Rome')).toBe(Date.parse('2026-12-26T09:06:00Z'));
  });
  it('ignores missing or broken values', () => {
    expect(exifTimeToUtc(undefined, '+02:00', 'UTC')).toBeNull();
    expect(exifTimeToUtc('0000:00:00 00:00:00', null, 'UTC')).toBeNull();
    expect(exifTimeToUtc('yesterday', null, 'UTC')).toBeNull();
  });
});
