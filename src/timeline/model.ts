/**
 * Keyframed clips. A clip is an ordered list of keyframes on a playback timeline in seconds;
 * a project holds several clips. Each keyframe pins the sun moment, the camera and
 * (optionally) which layers are on, plus how to get to the next keyframe.
 */

/**
 * A cubic Bézier ease, like CSS cubic-bezier() or a curve from After Effects' graph editor:
 * (x1, y1) is the handle leaving this keyframe, (x2, y2) the one arriving at the next.
 * x is a share of the time (0–1); y a share of the way, and may overshoot (Back).
 */
export type Bezier = [number, number, number, number];

/** How to get to the next keyframe: along a curve, or hold until it (a cut). */
export type Easing = Bezier | 'hold';

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
  /** Ease to the next keyframe (the camera's, and the sun's unless it has its own). */
  easing: Easing;
  /** The sun's own ease to the next keyframe, e.g. a steady time-lapse under an eased camera move. */
  sunEasing?: Easing;
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
