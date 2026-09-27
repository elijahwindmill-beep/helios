import { describe, expect, it } from 'vitest';
import { parseDate, parseTime, shortPlace } from '../../src/ui/parseInput';

describe('parseTime', () => {
  it.each([
    ['06:47', 6, 47],
    ['6:47', 6, 47],
    ['0647', 6, 47],
    ['647', 6, 47],
    ['6.47', 6, 47],
    ['6h47', 6, 47],
    ['6', 6, 0],
    ['18', 18, 0],
    ['6:5', 6, 5],
    ['6:47 pm', 18, 47],
    ['12am', 0, 0],
    ['12 pm', 12, 0],
    ['24:00', 0, 0],
  ])('%s', (text, hour, minute) => {
    expect(parseTime(text)).toEqual({ hour, minute });
  });
  it.each(['', 'abc', '25:00', '6:60', '13pm', '12345'])('rejects %s', (text) => {
    expect(parseTime(text)).toBeNull();
  });
});

describe('parseDate', () => {
  it.each([
    ['12 Oct 2026', 2026, 10, 12],
    ['12 october', 2027, 10, 12],
    ['12th Oct', 2027, 10, 12],
    ['Oct 12, 2026', 2026, 10, 12],
    ['2026-10-12', 2026, 10, 12],
    ['12/10/2026', 2026, 10, 12],
    ['12.10.26', 2026, 10, 12],
    ['12/10', 2027, 10, 12],
    ['29 Feb 2028', 2028, 2, 29],
  ])('%s', (text, year, month, day) => {
    expect(parseDate(text, 2027)).toEqual({ year, month, day });
  });
  it.each(['', '31 Feb 2026', '29 Feb 2026', '12 Oc 2026', '13/13/2026', 'tomorrow'])('rejects %s', (text) => {
    expect(parseDate(text, 2026)).toBeNull();
  });
});

describe('search result places', () => {
  it('keeps the nearest places and the country', () => {
    expect(shortPlace('Matterhorn, Zermatt, Visp, Oberwallis, Valais/Wallis, 3920, Switzerland', 'Matterhorn')).toBe('Zermatt, Visp, Switzerland');
    expect(shortPlace('Matterhorn', 'Matterhorn')).toBe('');
    expect(shortPlace('Seceda, Ortisei, Italia', 'Seceda')).toBe('Ortisei, Italia');
  });
});
