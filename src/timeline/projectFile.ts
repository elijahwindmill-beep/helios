import { useApp } from '../store/app';
import { useLayers } from '../store/layers';
import { useTimeline } from '../store/timeline';
import type { BaseLayer, Overlays } from '../map/style';
import type { ImageryId } from '../map/sources';
import { parseProjectFile, type ProjectFile } from './projectFormat';

/** Downloads the whole project as a .json file. */
export function saveProjectFile() {
  const app = useApp.getState();
  const layers = useLayers.getState();
  const tl = useTimeline.getState();
  const file: ProjectFile = {
    helios: 1,
    savedAt: new Date().toISOString(),
    project: tl.project,
    layers: { routes: layers.routes, places: layers.places, photos: layers.photos },
    settings: { base: app.base, overlays: { ...app.overlays }, imagery: app.imagery, lensStrength: app.lensStrength, sunSceneSize: app.sunSceneSize, pin: app.pin },
  };
  const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  const name = (tl.activeClip().name || 'project').replace(/[^\w\- ]+/g, '').trim() || 'project';
  a.href = URL.createObjectURL(blob);
  a.download = `zenit-${name}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** Asks for a saved project and loads it in place of the current one. */
export function openProjectFile(): Promise<void> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return resolve();
      try {
        const p = parseProjectFile(await file.text());
        if (!window.confirm('Replace your current clips, routes, places and photos with this project?')) return resolve();
        useTimeline.getState().replaceProject(p.project);
        useLayers.setState({ routes: p.layers.routes, places: p.layers.places, photos: p.layers.photos });
        if (p.settings) {
          const app = useApp.getState();
          if (p.settings.base) app.setBase(p.settings.base as BaseLayer);
          if (p.settings.imagery) app.setImagery(p.settings.imagery as ImageryId);
          if (p.settings.overlays) app.setOverlays(p.settings.overlays as Partial<Overlays>);
          if (typeof p.settings.lensStrength === 'number') app.setLensStrength(p.settings.lensStrength);
          if (p.settings.sunSceneSize === null || typeof p.settings.sunSceneSize === 'number') app.setSunSceneSize(p.settings.sunSceneSize);
          if (p.settings.pin) app.setPin(p.settings.pin);
        }
        useLayers.getState().setNotice(`Opened ${file.name}${p.layers.photos.length ? ' (photos show as thumbnails: their full files stay on the computer that added them)' : ''}`);
      } catch (err) {
        useLayers.getState().setNotice(err instanceof Error ? err.message : "That project couldn't be opened.");
      }
      resolve();
    };
    input.click();
  });
}
