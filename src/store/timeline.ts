import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { clipDuration, newId, sortKeys, type Clip, type Easing, type Keyframe, type Project } from '../timeline/model';
import { readEasing } from '../timeline/eases';

const firstClip = (): Clip => ({ id: newId(), name: 'Clip 1', keyframes: [], smoothCamera: true });

interface TimelineState {
  project: Project;
  /** The timeline panel is showing. */
  open: boolean;
  /** Playback position in the active clip, seconds. */
  playhead: number;
  playing: boolean;
  loop: boolean;
  /** Keyframe shown in the inspector. */
  selected: string | null;
  /** An ease copied with Copy ease, for Paste ease. */
  easeClipboard: Easing | null;
  /** The keyframes a Clear removed, until Undo or the next edit. */
  cleared: { clipId: string; keyframes: Keyframe[] } | null;

  setOpen(open: boolean): void;
  setPlayhead(t: number): void;
  setPlaying(playing: boolean): void;
  setLoop(loop: boolean): void;
  select(id: string | null): void;

  activeClip(): Clip;
  selectClip(id: string): void;
  addClip(): void;
  renameClip(id: string, name: string): void;
  deleteClip(id: string): void;
  /** Cuts the active clip at the playhead: keyframes after it start a new clip. */
  splitClip(boundary: Keyframe): void;
  setSmooth(on: boolean): void;

  /** Adds a keyframe (or replaces the one within a tenth of a second of `k.t`). */
  addKeyframe(k: Omit<Keyframe, 'id'>): string;
  updateKeyframe(id: string, patch: Partial<Omit<Keyframe, 'id'>>): void;
  deleteKeyframe(id: string): void;
  /** Removes every keyframe of the active clip (Undo brings them back). */
  clearKeyframes(): void;
  undoClear(): void;
  copyEase(e: Easing): void;
  /** Sets the camera ease (or the sun's) on every keyframe of the active clip. */
  easeAll(e: Easing, which: 'camera' | 'sun'): void;

  replaceProject(p: Project): void;
}

const updateClip = (p: Project, id: string, fn: (c: Clip) => Clip): Project => ({ ...p, clips: p.clips.map((c) => (c.id === id ? fn(c) : c)) });

export const useTimeline = create<TimelineState>()(
  persist(
    (set, get) => {
      const first = firstClip();
      const editActive = (fn: (c: Clip) => Clip) => set((s) => ({ project: updateClip(s.project, s.project.activeClip, fn) }));
      return {
        project: { version: 1, clips: [first], activeClip: first.id },
        open: false,
        playhead: 0,
        playing: false,
        loop: false,
        selected: null,
        easeClipboard: null,
        cleared: null,

        setOpen: (open) => set({ open, playing: open ? get().playing : false }),
        setPlayhead: (t) => set({ playhead: Math.max(0, t) }),
        setPlaying: (playing) => set({ playing }),
        setLoop: (loop) => set({ loop }),
        select: (selected) => set({ selected }),

        activeClip: () => {
          const p = get().project;
          return p.clips.find((c) => c.id === p.activeClip) ?? p.clips[0];
        },
        selectClip: (id) => set((s) => ({ project: { ...s.project, activeClip: id }, playhead: 0, selected: null, playing: false })),
        addClip: () =>
          set((s) => {
            const c: Clip = { id: newId(), name: `Clip ${s.project.clips.length + 1}`, keyframes: [], smoothCamera: true };
            return { project: { ...s.project, clips: [...s.project.clips, c], activeClip: c.id }, playhead: 0, selected: null, playing: false };
          }),
        renameClip: (id, name) => set((s) => ({ project: updateClip(s.project, id, (c) => ({ ...c, name })) })),
        deleteClip: (id) =>
          set((s) => {
            const clips = s.project.clips.filter((c) => c.id !== id);
            const rest = clips.length ? clips : [firstClip()];
            const activeClip = s.project.activeClip === id ? rest[0].id : s.project.activeClip;
            return { project: { ...s.project, clips: rest, activeClip }, selected: null, playhead: 0, playing: false };
          }),
        splitClip: (boundary) =>
          set((s) => {
            const clip = get().activeClip();
            const at = boundary.t;
            const before = clip.keyframes.filter((k) => k.t < at - 0.05);
            const after = clip.keyframes.filter((k) => k.t > at + 0.05);
            if (!before.length || !after.length) return {};
            const a: Clip = { ...clip, keyframes: [...before, { ...boundary, id: newId() }] };
            const b: Clip = {
              ...clip,
              id: newId(),
              name: `${clip.name} (2)`,
              keyframes: [{ ...boundary, id: newId(), t: 0 }, ...after.map((k) => ({ ...k, t: Math.round((k.t - at) * 10) / 10 }))],
            };
            const clips = s.project.clips.flatMap((c) => (c.id === clip.id ? [a, b] : [c]));
            return { project: { ...s.project, clips, activeClip: b.id }, playhead: 0, selected: null, playing: false };
          }),
        setSmooth: (on) => editActive((c) => ({ ...c, smoothCamera: on })),

        addKeyframe: (k) => {
          const id = newId();
          editActive((c) => ({ ...c, keyframes: sortKeys([...c.keyframes.filter((x) => Math.abs(x.t - k.t) >= 0.1), { ...k, id }]) }));
          set({ selected: id, cleared: null });
          return id;
        },
        updateKeyframe: (id, patch) => editActive((c) => ({ ...c, keyframes: sortKeys(c.keyframes.map((k) => (k.id === id ? { ...k, ...patch } : k))) })),
        deleteKeyframe: (id) => {
          editActive((c) => ({ ...c, keyframes: c.keyframes.filter((k) => k.id !== id) }));
          if (get().selected === id) set({ selected: null });
        },
        clearKeyframes: () => {
          const clip = get().activeClip();
          if (!clip.keyframes.length) return;
          set({ cleared: { clipId: clip.id, keyframes: clip.keyframes }, selected: null, playing: false, playhead: 0 });
          editActive((c) => ({ ...c, keyframes: [] }));
        },
        undoClear: () => {
          const c = get().cleared;
          if (!c) return;
          set((s) => ({ project: updateClip(s.project, c.clipId, (clip) => ({ ...clip, keyframes: c.keyframes })), cleared: null }));
        },
        copyEase: (easeClipboard) => set({ easeClipboard }),
        easeAll: (e, which) =>
          editActive((c) => ({
            ...c,
            keyframes: c.keyframes.map((k) => (which === 'camera' ? { ...k, easing: e } : { ...k, sunEasing: e })),
          })),

        replaceProject: (project) => set({ project, playhead: 0, selected: null, playing: false }),
      };
    },
    {
      name: 'helios.project',
      version: 2,
      partialize: (s) => ({ project: s.project, loop: s.loop }),
      // v2: eases became Bézier curves ('linear' and 'ease' before).
      migrate: (state) => {
        const s = state as { project?: Project };
        for (const c of s.project?.clips ?? []) {
          c.keyframes = c.keyframes.map((k) => ({ ...k, easing: readEasing(k.easing), sunEasing: k.sunEasing === undefined ? undefined : readEasing(k.sunEasing) }));
        }
        return s as TimelineState;
      },
    },
  ),
);

export const activeDuration = () => clipDuration(useTimeline.getState().activeClip());

// Handy for driving the timeline from the browser console during development.
if (import.meta.env.DEV) (window as unknown as { __timeline: typeof useTimeline }).__timeline = useTimeline;
