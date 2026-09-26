import { describe, expect, it } from 'vitest';
import { artistName, headingFromWikitext, parseSpots, parseTaken, stripHtml } from '../../src/layers/commons';

// Shaped like a real reply for "File:Odles as seen from Seceda.JPG".
const reply = {
  query: {
    pages: [
      {
        pageid: 20835263,
        title: 'File:Odles as seen from Seceda.JPG',
        coordinates: [{ lat: 46.6007, lon: 11.72578, type: 'camera' }],
        imageinfo: [
          {
            url: 'https://upload.wikimedia.org/wikipedia/commons/8/8d/Odles_as_seen_from_Seceda.JPG',
            thumburl: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/8/8d/Odles_as_seen_from_Seceda.JPG/250px-Odles_as_seen_from_Seceda.JPG',
            width: 7360,
            descriptionurl: 'https://commons.wikimedia.org/wiki/File:Odles_as_seen_from_Seceda.JPG',
            mime: 'image/jpeg',
            extmetadata: {
              Artist: {
                value:
                  '<table class="toccolours"><tr><td><a href="x" class="internal">This Photo</a> was taken by <i><b><a href="//commons.wikimedia.org/wiki/User:Moroder">Wolfgang Moroder</a></b></i>.  Feel free to use my photos &amp; more</td></tr></table>',
              },
              LicenseShortName: { value: 'CC BY-SA 3.0' },
              LicenseUrl: { value: 'https://creativecommons.org/licenses/by-sa/3.0' },
              DateTimeOriginal: { value: '2012-08-24' },
            },
          },
        ],
      },
      // Object location only (where the subject is): left out.
      { pageid: 2, title: 'File:Peak.jpg', coordinates: [{ lat: 46.6, lon: 11.7, type: 'object' }], imageinfo: [{ url: 'u', thumburl: 't', descriptionurl: 'd', mime: 'image/jpeg' }] },
      // Not a photo: left out.
      { pageid: 3, title: 'File:Map.svg', coordinates: [{ lat: 46.6, lon: 11.7 }], imageinfo: [{ url: 'u', thumburl: 't', descriptionurl: 'd', mime: 'image/svg+xml' }] },
    ],
  },
};

describe('Wikimedia Commons photo spots', () => {
  it('reads camera positions, credit and licence', () => {
    const spots = parseSpots(reply);
    expect(spots).toHaveLength(1);
    expect(spots[0]).toMatchObject({
      id: 20835263,
      title: 'Odles as seen from Seceda',
      lat: 46.6007,
      lng: 11.72578,
      artist: 'Wolfgang Moroder',
      license: 'CC BY-SA 3.0',
      taken: { year: 2012, month: 8, day: 24, hour: null, minute: null },
    });
    expect(spots[0].large).toContain('/1280px-Odles');
  });

  it('parses dates in the forms Commons uses', () => {
    expect(parseTaken('2013-12-21 13:45:02')).toEqual({ year: 2013, month: 12, day: 21, hour: 13, minute: 45 });
    expect(parseTaken('2010-08')).toEqual({ year: 2010, month: 8, day: null, hour: null, minute: null });
    expect(parseTaken('<time>2017-09-15</time>')).toMatchObject({ day: 15 });
    expect(parseTaken('')).toBeNull();
    expect(parseTaken('unknown')).toBeNull();
  });

  it('reads the camera heading when the page has one', () => {
    expect(headingFromWikitext('{{Location|46.6|11.7|heading:NE}}')).toBe(45);
    expect(headingFromWikitext('{{Location dec|46.6|11.7|heading:292.5}}')).toBe(292.5);
    expect(headingFromWikitext('{{Location dec|46.60070|11.72578}}')).toBeNull();
  });

  it('turns HTML fields into plain text', () => {
    expect(stripHtml('<b>A</b> &amp; <i>B</i>')).toBe('A & B');
    expect(artistName('Jane Doe')).toBe('Jane Doe');
  });
});
