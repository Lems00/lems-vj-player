// Le moteur de la console : quatre platines YouTube, le mixeur (volumes,
// crossfaders, master) et ce qui part en sortie. Un seul état, observé par React.
//
// Règles tirées des essais : on ne change jamais la vitesse d'une platine
// YouTube (pas de SYNC, pas de tempo) ; seul le volume, la lecture, la pause,
// le repère et la position sont commandés. La sortie suit la lecture réelle
// de la platine à l'antenne (position diffusée deux fois par seconde).
import { useSyncExternalStore } from 'react';
import { DECKS, type DeckId, type StripValue } from './design';
import { type Track, type CrossfaderCurve } from './store';
import { YtPlayer, YT_STATE } from './youtube';
import { emit } from './tauri';

export interface DeckState {
  track: Track | null;
  playing: boolean;
  position: number;
  duration: number;
  cuePoint: number;        // fraction de la durée (0..1), comme le design system
  state: number;           // état du lecteur YouTube
  error: string | null;
}
export interface MixState {
  strips: Record<DeckId, StripValue>;
  ab: number; cd: number;  // crossfaders, −1 (gauche) … 1 (droite)
  master: number; phones: number; cueMix: number;
  preview: { left: DeckId; right: DeckId };
}
export interface EngineState { decks: Record<DeckId, DeckState>; mix: MixState; curve: CrossfaderCurve; showTitleOnOutput: boolean }

export interface ProgramMessage {
  deck: DeckId | null; video: string | null; title: string; channel: string;
  position: number; at: number; playing: boolean; showTitle: boolean;
  next: { video: string; position: number } | null;
}

const emptyDeck = (): DeckState => ({ track: null, playing: false, position: 0, duration: 0, cuePoint: 0, state: YT_STATE.UNSTARTED, error: null });
const defaultStrip = (): StripValue => ({ gain: 0.5, hi: 0.5, mid: 0.5, lo: 0.5, volume: 0.75, prelisten: false });
const LEFT: Record<DeckId, boolean> = { a: true, b: false, c: true, d: false };
const PAIR: Record<DeckId, 'ab' | 'cd'> = { a: 'ab', b: 'ab', c: 'cd', d: 'cd' };

/** Gain d'un côté du crossfader selon la courbe choisie. */
export function crossfaderGain(value: number, isLeft: boolean, curve: CrossfaderCurve): number {
  const t = (value + 1) / 2; // 0 = tout à gauche, 1 = tout à droite
  const x = isLeft ? 1 - t : t;
  if (curve === 'cut') return x > 0.03 ? 1 : 0;
  if (curve === 'constant-power') return Math.sin((x * Math.PI) / 2);
  return Math.min(1, 2 * x); // progressive : pleine puissance jusqu'au centre
}

type Listener = () => void;

export class Engine {
  private state: EngineState = {
    decks: { a: emptyDeck(), b: emptyDeck(), c: emptyDeck(), d: emptyDeck() },
    mix: { strips: { a: defaultStrip(), b: defaultStrip(), c: defaultStrip(), d: defaultStrip() }, ab: 0, cd: 0, master: 0.85, phones: 0.7, cueMix: 0.5, preview: { left: 'c', right: 'b' } },
    curve: 'linear',
    showTitleOnOutput: false,
  };
  private listeners = new Set<Listener>();
  private players: Partial<Record<DeckId, YtPlayer>> = {};
  private appliedVolume: Partial<Record<DeckId, number>> = {};
  private lastProgram = '';
  private timer: ReturnType<typeof setInterval> | null = null;
  private broadcastTimer: ReturnType<typeof setInterval> | null = null;
  /** Historique : prévenu à chaque morceau chargé (la bibliothèque le garde). */
  onTrackLoaded: ((t: Track) => void) | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      this.timer = setInterval(() => this.tick(), 100);
      this.broadcastTimer = setInterval(() => this.broadcast(false), 500);
    }
  }

  // ----- observation -----
  subscribe = (l: Listener) => { this.listeners.add(l); return () => { this.listeners.delete(l); }; };
  getState = () => this.state;
  private set(next: EngineState) { this.state = next; this.listeners.forEach((l) => l()); }
  private patchDeck(d: DeckId, patch: Partial<DeckState>) {
    this.set({ ...this.state, decks: { ...this.state.decks, [d]: { ...this.state.decks[d], ...patch } } });
  }
  private patchMix(patch: Partial<MixState>) { this.set({ ...this.state, mix: { ...this.state.mix, ...patch } }); }

  // ----- lecteurs -----
  /** Le composant Stage appelle ceci une fois par platine, avec l'élément qui accueille le lecteur. */
  attachPlayer(d: DeckId, host: HTMLElement, width: number, height: number) {
    if (this.players[d]) return;
    const player = new YtPlayer(host, width, height, {
      onState: (s) => {
        const deck = this.state.decks[d];
        const patch: Partial<DeckState> = { state: s };
        if (s === YT_STATE.PLAYING) patch.playing = true;
        if (s === YT_STATE.PAUSED || s === YT_STATE.ENDED) patch.playing = false;
        if (s === YT_STATE.CUED || s === YT_STATE.PLAYING) {
          const dur = player.duration(); if (dur > 0) patch.duration = dur;
          const vd = player.videoData();
          if (deck.track && vd.title && (deck.track.title !== vd.title || !deck.track.channel)) {
            const track = { ...deck.track, title: vd.title, channel: vd.author ?? deck.track.channel, duration: dur || deck.track.duration };
            patch.track = track; this.onTrackLoaded?.(track);
          }
        }
        this.patchDeck(d, patch);
      },
      onError: (_code, text) => this.patchDeck(d, { error: text, playing: false }),
    });
    this.players[d] = player;
    // Lecteur recréé (retour du mode appareil) : la platine retrouve son morceau, arrêté où il était.
    const deck = this.state.decks[d];
    if (deck.track) { player.cue(deck.track.id, deck.position); this.patchDeck(d, { playing: false }); }
  }
  hasPlayer(d: DeckId) { return !!this.players[d]; }
  /** Détruit les lecteurs (leur hôte quitte la page) ; la Scène les recréera au retour. */
  detachPlayers() { for (const d of DECKS) { this.players[d]?.destroy(); delete this.players[d]; delete this.appliedVolume[d]; } }

  // ----- commandes de platine -----
  load(d: DeckId, track: Track) {
    this.patchDeck(d, { track, playing: false, position: 0, duration: track.duration ?? 0, cuePoint: 0, error: null, state: YT_STATE.UNSTARTED });
    this.players[d]?.cue(track.id, 0);
    this.onTrackLoaded?.(track);
    // Une platine qui vient d'être chargée s'affiche dans la prévisualisation de son côté.
    this.showPreview(d);
  }
  eject(d: DeckId) { this.players[d]?.stop(); this.patchDeck(d, emptyDeck()); }
  play(d: DeckId) { if (!this.state.decks[d].track) return; this.focus(d); this.patchDeck(d, { playing: true }); this.players[d]?.play(); }
  pause(d: DeckId) { this.patchDeck(d, { playing: false }); this.players[d]?.pause(); }
  toggle(d: DeckId) { this.state.decks[d].playing ? this.pause(d) : this.play(d); }
  /** CUE : en lecture, revient au repère et s'arrête ; à l'arrêt, pose le repère ici. */
  cue(d: DeckId) {
    const deck = this.state.decks[d];
    if (!deck.track) return;
    if (deck.playing) {
      const pos = deck.cuePoint * (deck.duration || 0);
      this.players[d]?.pause(); this.players[d]?.seek(pos);
      this.patchDeck(d, { playing: false, position: pos });
    } else {
      this.patchDeck(d, { cuePoint: deck.duration ? deck.position / deck.duration : 0 });
    }
  }
  seek(d: DeckId, seconds: number) { this.players[d]?.seek(seconds); this.patchDeck(d, { position: seconds }); }
  setBpm(d: DeckId, bpm: number | undefined) {
    const t = this.state.decks[d].track; if (!t) return;
    const track = { ...t, bpm }; this.patchDeck(d, { track }); this.onTrackLoaded?.(track);
  }
  /** La platine que le clavier commande : la dernière touchée, sinon celle à l'antenne. */
  focused: DeckId | null = null;
  focus(d: DeckId) { if (this.focused !== d) { this.focused = d; this.set({ ...this.state }); } }

  // ----- mixeur -----
  setStrip(d: DeckId, v: StripValue) {
    if (v.prelisten && !this.state.mix.strips[d].prelisten) this.showPreview(d);
    this.patchMix({ strips: { ...this.state.mix.strips, [d]: v } });
  }
  setCrossfader(pair: 'ab' | 'cd', v: number) { this.patchMix({ [pair]: Math.max(-1, Math.min(1, v)) } as Partial<MixState>); }
  setMaster(v: number) { this.patchMix({ master: v }); }
  setPhones(v: number) { this.patchMix({ phones: v }); }
  setCueMix(v: number) { this.patchMix({ cueMix: v }); }
  setCurve(c: CrossfaderCurve) { this.set({ ...this.state, curve: c }); }
  setShowTitle(v: boolean) { this.set({ ...this.state, showTitleOnOutput: v }); }
  showPreview(d: DeckId) { const side = LEFT[d] ? 'left' : 'right'; this.patchMix({ preview: { ...this.state.mix.preview, [side]: d } }); }

  /** Gain effectif de chaque platine (0..1) : volume × crossfader × master, si elle joue. */
  gains(): Record<DeckId, number> {
    const { mix, curve, decks } = this.state;
    const out = {} as Record<DeckId, number>;
    for (const d of DECKS) {
      const xf = crossfaderGain(mix[PAIR[d]], LEFT[d], curve);
      out[d] = decks[d].track && decks[d].playing ? mix.strips[d].volume * xf * mix.master : 0;
    }
    return out;
  }
  /** La platine à l'antenne : la plus forte, si elle dépasse le seuil d'audibilité. */
  program(): DeckId | null {
    const g = this.gains();
    let best: DeckId | null = null, max = 0.02;
    for (const d of DECKS) if (g[d] > max) { max = g[d]; best = d; }
    return best;
  }
  /** Les platines audibles, de la plus forte à la plus faible. */
  onAir(): DeckId[] { const g = this.gains(); return DECKS.filter((d) => g[d] > 0.05).sort((x, y) => g[y] - g[x]); }

  // ----- boucle -----
  private tick() {
    const g = this.gains();
    let decks = this.state.decks, changed = false;
    for (const d of DECKS) {
      const p = this.players[d];
      if (!p) continue;
      // Volume : la seule commande sonore permise sur une platine YouTube.
      const vol = decks[d].track ? Math.round(g[d] * 100) : 0;
      if (this.appliedVolume[d] !== vol) { p.setVolume(vol); this.appliedVolume[d] = vol; }
      if (decks[d].track && p.isReady) {
        const position = p.time(), duration = p.duration() || decks[d].duration;
        if (Math.abs(position - decks[d].position) > 0.05 || duration !== decks[d].duration) {
          if (!changed) { decks = { ...decks }; changed = true; }
          decks[d] = { ...decks[d], position, duration };
        }
      }
    }
    if (changed) this.set({ ...this.state, decks });
    const prog = this.program() ?? '';
    if (prog !== this.lastProgram) { this.lastProgram = prog; this.broadcast(true); }
  }

  /** Ce qui part en sortie, pour la fenêtre de sortie et les écrans distants. */
  programMessage(): ProgramMessage {
    const d = this.program();
    const deck = d ? this.state.decks[d] : null;
    const others = DECKS.filter((x) => x !== d && this.state.decks[x].track);
    const g = this.gains();
    others.sort((x, y) => g[y] - g[x]);
    const n = others[0] ? this.state.decks[others[0]] : null;
    return {
      deck: d, video: deck?.track?.id ?? null, title: deck?.track?.title ?? '', channel: deck?.track?.channel ?? '',
      position: deck?.position ?? 0, at: Date.now(), playing: !!deck?.playing, showTitle: this.state.showTitleOnOutput,
      next: n?.track ? { video: n.track.id, position: n.position } : null,
    };
  }
  private broadcast(_force: boolean) { void emit('program', this.programMessage()); }

  destroy() { if (this.timer) clearInterval(this.timer); if (this.broadcastTimer) clearInterval(this.broadcastTimer); DECKS.forEach((d) => this.players[d]?.destroy()); }
}

export const engine = new Engine();
export function useEngine(): EngineState { return useSyncExternalStore(engine.subscribe, engine.getState, engine.getState); }
