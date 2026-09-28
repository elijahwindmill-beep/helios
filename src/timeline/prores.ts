import type { FFmpeg } from '@ffmpeg/ffmpeg';

/**
 * ProRes 4444 with alpha (a .mov that Resolve, Premiere and Final Cut take directly). Browsers
 * can't encode ProRes, so this runs FFmpeg compiled to WebAssembly (ffmpeg.wasm). Its core,
 * about 32 MB, is FFmpeg's own GPL build, fetched from jsDelivr only when this export is used
 * (and cached by the browser after that).
 *
 * Frames arrive as PNGs and are encoded a few dozen at a time, so the PNGs never pile up in
 * memory; the pieces are joined into one file at the end (ProRes frames stand alone, so
 * joining needs no re-encoding).
 */

const CORE = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm';
/** Frames per encoded piece. */
const SEGMENT = 36;

export class ProResWriter {
  private pending: number[] = [];
  private segments: string[] = [];
  private frame = 0;

  private constructor(
    private ff: FFmpeg,
    private fps: number,
  ) {}

  static async open(fps: number): Promise<ProResWriter> {
    const [{ FFmpeg }, { toBlobURL }] = await Promise.all([import('@ffmpeg/ffmpeg'), import('@ffmpeg/util')]);
    const ff = new FFmpeg();
    await ff.load({
      coreURL: await toBlobURL(`${CORE}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${CORE}/ffmpeg-core.wasm`, 'application/wasm'),
    });
    return new ProResWriter(ff, fps);
  }

  async add(canvas: HTMLCanvasElement) {
    const png = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not read the frame'))), 'image/png'));
    const n = this.frame++;
    await this.ff.writeFile(`f${String(n).padStart(6, '0')}.png`, new Uint8Array(await png.arrayBuffer()));
    this.pending.push(n);
    if (this.pending.length >= SEGMENT) await this.flush();
  }

  /** Encodes the waiting PNGs into one piece and deletes them. */
  private async flush() {
    if (!this.pending.length) return;
    const first = this.pending[0];
    const name = `seg${this.segments.length}.mov`;
    const code = await this.ff.exec([
      '-framerate', String(this.fps),
      '-start_number', String(first),
      '-i', 'f%06d.png',
      '-frames:v', String(this.pending.length),
      // Premultiplied colour, the ProRes 4444 convention editors assume (Resolve's clip alpha
      // mode "Premultiplied"): read as straight, a faint glow's full-strength colour would show
      // as a solid blob. Then sRGB to Rec. 709 video levels, tagged so editors read colours right.
      '-vf', 'premultiply=inplace=1,scale=out_color_matrix=bt709:out_range=tv,format=yuva444p10le',
      '-c:v', 'prores_ks',
      '-profile:v', '4444',
      '-vendor', 'apl0',
      '-color_primaries', 'bt709',
      '-color_trc', 'bt709',
      '-colorspace', 'bt709',
      name,
    ]);
    for (const n of this.pending) await this.ff.deleteFile(`f${String(n).padStart(6, '0')}.png`);
    this.pending = [];
    if (code !== 0) throw new Error('The ProRes encoder failed');
    this.segments.push(name);
  }

  async finish(): Promise<Blob> {
    await this.flush();
    let data: Uint8Array;
    if (this.segments.length === 1) {
      data = (await this.ff.readFile(this.segments[0])) as Uint8Array;
    } else {
      await this.ff.writeFile('list.txt', this.segments.map((s) => `file '${s}'`).join('\n'));
      const code = await this.ff.exec(['-f', 'concat', '-safe', '0', '-i', 'list.txt', '-c', 'copy', 'out.mov']);
      if (code !== 0) throw new Error('Joining the ProRes pieces failed');
      for (const s of this.segments) await this.ff.deleteFile(s);
      data = (await this.ff.readFile('out.mov')) as Uint8Array;
    }
    this.ff.terminate();
    return new Blob([data.slice().buffer as ArrayBuffer], { type: 'video/quicktime' });
  }

  cancel() {
    this.ff.terminate();
  }
}
