import type { Photo, Place, Route } from '../layers/model';
import type { Project } from './model';

/** A saved project: clips and keyframes, your layers (photos without their full files), and settings. */
export interface ProjectFile {
  helios: 1;
  savedAt: string;
  project: Project;
  layers: { routes: Route[]; places: Place[]; photos: Photo[] };
  settings: {
    base: string;
    overlays: Record<string, boolean>;
    imagery: string;
    lensStrength: number;
    pin: { lat: number; lng: number; name: string };
  };
}

/** Reads a saved project, or throws a plain message saying what's wrong with it. */
export function parseProjectFile(text: string): ProjectFile {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("That file isn't valid JSON.");
  }
  const f = data as Partial<ProjectFile>;
  if (!f || f.helios !== 1) throw new Error("That file isn't a Helios project.");
  const clips = f.project?.clips;
  if (!Array.isArray(clips) || !clips.length) throw new Error('The project has no clips.');
  for (const c of clips) {
    if (typeof c.id !== 'string' || !Array.isArray(c.keyframes)) throw new Error('A clip in the project is damaged.');
    for (const k of c.keyframes) {
      const cam = k.camera;
      if (![k.t, k.sun, cam?.lng, cam?.lat, cam?.zoom, cam?.bearing, cam?.pitch].every((v) => typeof v === 'number' && Number.isFinite(v)))
        throw new Error(`A keyframe in "${c.name}" is damaged.`);
    }
  }
  const project: Project = {
    version: 1,
    clips: clips.map((c) => ({
      id: c.id,
      name: String(c.name ?? 'Clip'),
      smoothCamera: c.smoothCamera !== false,
      keyframes: [...c.keyframes]
        .map((k) => ({
          ...k,
          easing: (['linear', 'ease', 'hold'] as const).includes(k.easing) ? k.easing : 'ease',
          sunMode: k.sunMode === 'daylapse' ? ('daylapse' as const) : ('continuous' as const),
          loops: Math.max(0, Math.round(Number(k.loops) || 0)),
        }))
        .sort((a, b) => a.t - b.t),
    })),
    activeClip: clips.some((c) => c.id === f.project!.activeClip) ? f.project!.activeClip : clips[0].id,
  };
  return {
    helios: 1,
    savedAt: String(f.savedAt ?? ''),
    project,
    layers: {
      routes: Array.isArray(f.layers?.routes) ? f.layers!.routes : [],
      places: Array.isArray(f.layers?.places) ? f.layers!.places : [],
      photos: Array.isArray(f.layers?.photos) ? f.layers!.photos : [],
    },
    settings: f.settings as ProjectFile['settings'],
  };
}
