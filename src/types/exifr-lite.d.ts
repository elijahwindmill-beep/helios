// exifr's lite build (JPEG and HEIC, EXIF/GPS/XMP) has no typings of its own; it has the same API.
declare module 'exifr/dist/lite.esm.mjs' {
  import exifr from 'exifr';
  export default exifr;
}
