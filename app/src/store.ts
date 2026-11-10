// Réglages et bibliothèque : enregistrés en JSON dans le dossier de données de
// l'application (commande Rust `store_get` / `store_set`). Hors de l'application,
// localStorage prend le relais, pour les tests et l'aperçu.
import { inApp, call } from './tauri';

export async function loadJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = inApp() ? await call<string | null>('store_get', { key }) : localStorage.getItem('lems.' + key);
    if (!raw) return fallback;
    return { ...fallback, ...(JSON.parse(raw) as Partial<T>) };
  } catch { return fallback; }
}

export async function saveJson<T>(key: string, value: T): Promise<void> {
  const raw = JSON.stringify(value);
  try {
    if (inApp()) await call('store_set', { key, value: raw });
    else localStorage.setItem('lems.' + key, raw);
  } catch (e) { console.warn('Enregistrement impossible :', key, e); }
}

export type CrossfaderCurve = 'linear' | 'constant-power' | 'cut';
export type Transition = 'cut' | 'fade';

export interface Settings {
  youtubeApiKey: string;
  mainOutput: string;
  headphonesOutput: string;
  bufferSize: 128 | 256 | 512 | 1024;
  crossfaderCurve: CrossfaderCurve;
  outputMonitor: number | null;
  outputFullscreen: boolean;
  transition: Transition;
  showTitleOnOutput: boolean;
  deviceName: string;
  /** Rôle de cet ordinateur : console (défaut) ou appareil (écran, contrôleur). Android est toujours appareil. */
  mode: 'console' | 'device';
}

export const DEFAULT_SETTINGS: Settings = {
  youtubeApiKey: '',
  mainOutput: '',
  headphonesOutput: '',
  bufferSize: 256,
  crossfaderCurve: 'linear',
  outputMonitor: null,
  outputFullscreen: true,
  transition: 'cut',
  showTitleOnOutput: false,
  deviceName: '',
  mode: 'console',
};

export interface Track {
  id: string;            // identifiant YouTube
  title: string;
  channel: string;
  duration?: number;     // secondes, connue une fois le lecteur chargé
  thumbnail?: string;
  bpm?: number;          // saisi au tap
  addedAt: number;
}

export interface Playlist { id: string; name: string; trackIds: string[] }

export interface Library { tracks: Track[]; favorites: string[]; playlists: Playlist[]; quota: { day: string; searches: number } }

export const EMPTY_LIBRARY: Library = { tracks: [], favorites: [], playlists: [], quota: { day: '', searches: 0 } };
