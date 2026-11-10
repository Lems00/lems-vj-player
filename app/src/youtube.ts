// Lecteur YouTube officiel (IFrame Player API), tel quel : on ne modifie ni le
// son ni l'image (règles 6 et 7 des conditions YouTube). Un lecteur par platine.

declare global {
  interface Window { YT?: YTNamespace; onYouTubeIframeAPIReady?: () => void }
}
interface YTNamespace { Player: new (el: HTMLElement | string, opts: Record<string, unknown>) => YTRaw; PlayerState: Record<string, number> }
interface YTRaw {
  loadVideoById(o: { videoId: string; startSeconds?: number }): void;
  cueVideoById(o: { videoId: string; startSeconds?: number }): void;
  playVideo(): void; pauseVideo(): void; stopVideo(): void;
  seekTo(s: number, allowSeekAhead: boolean): void;
  setVolume(v: number): void; getVolume(): number; mute(): void; unMute(): void; isMuted(): boolean;
  getCurrentTime(): number; getDuration(): number; getPlayerState(): number;
  setPlaybackRate(r: number): void; getPlaybackRate(): number;
  getVideoData(): { video_id?: string; title?: string; author?: string };
  getIframe(): HTMLIFrameElement; setSize(w: number, h: number): void; destroy(): void;
}

export const YT_STATE = { UNSTARTED: -1, ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 } as const;
export const YT_ERRORS: Record<number, string> = {
  2: 'identifiant de vidéo invalide', 5: 'lecteur HTML5 en erreur', 100: 'vidéo introuvable ou privée',
  101: 'lecture intégrée refusée par l’auteur', 150: 'lecture intégrée refusée par l’auteur', 153: 'adresse de la page refusée par YouTube',
};

let apiPromise: Promise<void> | null = null;
export function loadYouTubeApi(): Promise<void> {
  if (window.YT?.Player) return Promise.resolve();
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve, reject) => {
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { previous?.(); resolve(); };
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.onerror = () => { apiPromise = null; reject(new Error('API YouTube indisponible : vérifiez la connexion Internet.')); };
    document.head.append(s);
  });
  return apiPromise;
}

export interface YtEvents { onReady?: () => void; onState?: (state: number) => void; onError?: (code: number, text: string) => void }

/** Un lecteur YouTube posé dans `host` (le lecteur remplace un enfant de `host`, jamais `host` lui-même). */
export class YtPlayer {
  private raw: YTRaw | null = null;
  private ready = false;
  private pending: Array<(p: YTRaw) => void> = [];
  constructor(host: HTMLElement, width: number, height: number, events: YtEvents = {}) {
    const target = document.createElement('div');
    host.replaceChildren(target);
    loadYouTubeApi().then(() => {
      this.raw = new window.YT!.Player(target, {
        width, height,
        playerVars: { playsinline: 1, rel: 0, enablejsapi: 1, origin: location.origin },
        events: {
          onReady: () => { this.ready = true; const p = this.raw!; try { p.getIframe().style.width = '100%'; p.getIframe().style.height = '100%'; } catch { /* taille fixe */ } this.pending.splice(0).forEach((f) => f(p)); events.onReady?.(); },
          onStateChange: (e: { data: number }) => events.onState?.(e.data),
          onError: (e: { data: number }) => events.onError?.(e.data, YT_ERRORS[e.data] ?? 'erreur ' + e.data),
        },
      });
    }).catch((e: Error) => events.onError?.(0, e.message));
  }
  private when(f: (p: YTRaw) => void) { if (this.ready && this.raw) f(this.raw); else this.pending.push(f); }
  load(videoId: string, start = 0) { this.when((p) => p.loadVideoById({ videoId, startSeconds: start })); }
  cue(videoId: string, start = 0) { this.when((p) => p.cueVideoById({ videoId, startSeconds: start })); }
  play() { this.when((p) => p.playVideo()); }
  pause() { this.when((p) => p.pauseVideo()); }
  stop() { this.when((p) => p.stopVideo()); }
  seek(s: number) { this.when((p) => p.seekTo(Math.max(0, s), true)); }
  setVolume(v: number) { this.when((p) => p.setVolume(Math.round(Math.min(100, Math.max(0, v))))); }
  mute() { this.when((p) => p.mute()); }
  unMute() { this.when((p) => p.unMute()); }
  setRate(r: number) { this.when((p) => p.setPlaybackRate(r)); }
  get isReady() { return this.ready; }
  time(): number { try { return this.raw?.getCurrentTime() ?? 0; } catch { return 0; } }
  duration(): number { try { return this.raw?.getDuration() ?? 0; } catch { return 0; } }
  state(): number { try { return this.raw?.getPlayerState() ?? YT_STATE.UNSTARTED; } catch { return YT_STATE.UNSTARTED; } }
  rate(): number { try { return this.raw?.getPlaybackRate() ?? 1; } catch { return 1; } }
  videoData(): { id?: string; title?: string; author?: string } { try { const d = this.raw?.getVideoData() ?? {}; return { id: d.video_id, title: d.title, author: d.author }; } catch { return {}; } }
  destroy() { try { this.raw?.destroy(); } catch { /* déjà détruit */ } this.raw = null; this.ready = false; }
}

/** Identifiant YouTube d'un lien collé (watch, youtu.be, shorts, embed, live) ou d'un identifiant nu. */
export function parseVideoId(input: string): string | null {
  const s = input.trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
  try {
    const u = new URL(s.includes('://') ? s : 'https://' + s);
    if (!/(^|\.)youtube\.com$|(^|\.)youtu\.be$|(^|\.)youtube-nocookie\.com$/.test(u.hostname)) return null;
    const v = u.searchParams.get('v');
    if (v && /^[A-Za-z0-9_-]{11}$/.test(v)) return v;
    const m = u.pathname.match(/^\/(?:shorts|embed|live|v)?\/?([A-Za-z0-9_-]{11})(?:[/?]|$)/);
    return m ? m[1] : null;
  } catch { return null; }
}
