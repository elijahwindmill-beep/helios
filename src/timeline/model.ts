/**
 * Keyframed clips. A clip is an ordered list of keyframes on a playback timeline in seconds;
 * a project holds several clips. Each keyframe pins the sun moment, the camera and
 * (optionally) which layers are on, plus how to get to the next keyframe.
 */

export type Easing = 'linear' | 'ease' | 'hold';

/**
 * How the sun moves from this keyframe to the next:
 * - continuous: the absolute moment is interpolated (a day sweep, or a year lapse a year apart);
 * - daylapse: the date steps day by day while the time of day holds (or sweeps `loops` times).
 */
export type SunMode = 'continuous' | 'daylapse';

export interface CameraKey {
  lng: number;
  lat: number;
  zoom: number;
  bearing: number;
  pitch: number;
}

export interface Keyframe {
  id: string;
  /** Playback time, seconds from the clip start. */
  t: number;
  /** Sun moment, UTC ms. */
  sun: number;
  camera: CameraKey;
  /** Easing to the next keyframe. */
  easing: Easing;
  sunMode: SunMode;
  /** Day lapse only: how many times the time of day sweeps from this keyframe's to the next's; 0 holds or glides once. */
  loops: number;
  /** Layer switches from this keyframe on (overlay name → on), when set. */
  layers?: Record<string, boolean>;
}

export interface Clip {
  id: string;
  name: string;
  keyframes: Keyframe[];
  /** Curve the camera smoothly through three or more keyframes (Catmull-Rom). */
  smoothCamera: boolean;
}

export interface Project {
  version: 1;
  clips: Clip[];
  activeClip: string;
}

export function newId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function sortKeys(keys: Keyframe[]): Keyframe[] {
  return [...keys].sort((a, b) => a.t - b.t);
}

/** Length of a clip: its last keyframe, at least a second. */
export function clipDuration(c: Clip): number {
  return Math.max(1, ...c.keyframes.map((k) => k.t));
}
