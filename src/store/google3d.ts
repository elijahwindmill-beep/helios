import { create } from 'zustand';

/** State of the optional Google Photorealistic 3D Tiles layer, for the settings panel. */
export interface Google3dState {
  status: 'off' | 'loading' | 'ok' | 'error';
  message: string;
  /** Data credits for the tiles in view, as Google asks them shown. */
  credits: string;
}

export const useGoogle3d = create<Google3dState>()(() => ({ status: 'off', message: '', credits: '' }));
