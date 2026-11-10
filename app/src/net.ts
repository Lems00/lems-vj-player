// Réseau local : la console (serveur) et les appareils (contrôleur, écran).
// Le cœur Rust (lems-core) fait l'appairage par code, le chiffrement et la
// mesure d'horloge ; ici, on relie ses messages au moteur de la console et aux
// vues des appareils. Protocole : prototypes/core/src/protocol.rs.
import { useSyncExternalStore } from 'react';
import type { DeckId } from './design';
import type { Engine, ProgramMessage } from './engine';
import { call, inApp, tryCall } from './tauri';

export type Role = 'controller' | 'screen' | 'library';
export type TransportAction = 'play' | 'pause' | 'toggle' | 'cue';

export interface DeckSnapshot { deck: DeckId; title: string | null; channel: string | null; video_id: string | null; duration: number; position: number; playing: boolean; bpm: number | null; volume: number; on_air: boolean }
export interface ConsoleSnapshot { decks: DeckSnapshot[]; ab: number; cd: number; master: number; program: DeckId | null; at: number }

export type NetMessage =
  | { type: 'load'; deck: DeckId; source: { kind: 'youtube'; video_id: string } | { kind: 'file'; name: string; sha256: string } }
  | { type: 'play'; deck: DeckId; position: number; at: number }
  | { type: 'pause'; deck: DeckId; position: number }
  | { type: 'position'; deck: DeckId; position: number; at: number }
  | { type: 'cue'; deck: DeckId; source: { kind: 'youtube'; video_id: string }; position: number }
  | { type: 'ready'; deck: DeckId; video_id: string; load_ms: number }
  | { type: 'volume'; deck: DeckId; value: number }
  | { type: 'crossfader'; left: DeckId; right: DeckId; value: number }
  | { type: 'transport'; deck: DeckId; action: TransportAction }
  | { type: 'status'; text: string }
  | ({ type: 'state' } & ConsoleSnapshot);

export interface Peer { id: number; name: string; role: Role; addr: string; connected: boolean; rtt_ms: number | null; offset_ms: number | null }
export interface ConsoleInfo { port: number; code: string; peers: Peer[]; advertised: boolean; advertise_error: string | null; urls: string[] }
export interface FoundConsole { name: string; addresses?: string[]; port: number; url?: string }

type Listener = () => void;
class Observable<T> {
  private listeners = new Set<Listener>();
  constructor(private value: T) {}
  subscribe = (l: Listener) => { this.listeners.add(l); return () => { this.listeners.delete(l); }; };
  get = () => this.value;
  set(v: T) { this.value = v; this.listeners.forEach((l) => l()); }
}

// ---------------------------------------------------------------- console
/** Côté console : démarre le serveur, répond aux contrôleurs, nourrit les écrans. */
export class NetConsole {
  readonly info = new Observable<ConsoleInfo | null>(null);
  private timers: ReturnType<typeof setInterval>[] = [];
  private lastProgram: string | null = null;
  private lastNext: string | null = null;
  constructor(private engine: Engine) {}

  async start(name: string) {
    if (!inApp() || this.timers.length) return;
    try { this.info.set(await call<ConsoleInfo>('console_start', { name })); } catch (e) { console.warn('console réseau :', e); return; }
    this.timers.push(setInterval(() => void this.inbox(), 100));
    this.timers.push(setInterval(() => void this.broadcastState(), 500));
    this.timers.push(setInterval(() => void tryCall<ConsoleInfo | null>('console_info', undefined, null).then((i) => i && this.info.set(i)), 1000));
  }
  stop() { this.timers.forEach(clearInterval); this.timers = []; }

  private async inbox() {
    const msgs = await tryCall<(NetMessage & { peer: number })[]>('console_messages', undefined, []);
    for (const m of msgs) {
      if (m.type === 'volume') { const s = this.engine.getState().mix.strips[m.deck]; this.engine.setStrip(m.deck, { ...s, volume: Math.max(0, Math.min(1, m.value)) }); }
      else if (m.type === 'crossfader') this.engine.setCrossfader(m.left === 'a' ? 'ab' : 'cd', m.value);
      else if (m.type === 'transport') {
        if (m.action === 'play') this.engine.play(m.deck); else if (m.action === 'pause') this.engine.pause(m.deck);
        else if (m.action === 'toggle') this.engine.toggle(m.deck); else this.engine.cue(m.deck);
      }
    }
  }

  private send(m: NetMessage) { return tryCall('console_broadcast', { message: JSON.stringify(m) }, null); }

  /** État pour les contrôleurs, position et commandes pour les écrans. */
  private async broadcastState() {
    const st = this.engine.getState(), gains = this.engine.gains(), program = this.engine.program();
    const decks: DeckSnapshot[] = (['a', 'b', 'c', 'd'] as DeckId[]).map((d) => ({
      deck: d, title: st.decks[d].track?.title ?? null, channel: st.decks[d].track?.channel ?? null, video_id: st.decks[d].track?.id ?? null,
      duration: st.decks[d].duration, position: st.decks[d].position, playing: st.decks[d].playing, bpm: st.decks[d].track?.bpm ?? null,
      volume: st.mix.strips[d].volume, on_air: gains[d] > 0.05,
    }));
    await this.send({ type: 'state', decks, ab: st.mix.ab, cd: st.mix.cd, master: st.mix.master, program, at: Date.now() });
    const pm = this.engine.programMessage();
    await this.syncScreens(pm);
  }

  /** Écrans : chargement et lecture au changement de platine, position ensuite, préchargement du titre suivant. */
  private async syncScreens(pm: ProgramMessage) {
    const key = pm.video ? `${pm.deck}:${pm.video}` : null;
    if (key !== this.lastProgram) {
      this.lastProgram = key;
      if (pm.deck && pm.video) {
        await this.send({ type: 'load', deck: pm.deck, source: { kind: 'youtube', video_id: pm.video } });
        await this.send(pm.playing ? { type: 'play', deck: pm.deck, position: pm.position, at: pm.at } : { type: 'pause', deck: pm.deck, position: pm.position });
      } else {
        await this.send({ type: 'pause', deck: 'a', position: 0 });
      }
    } else if (pm.deck && pm.video) {
      await this.send(pm.playing ? { type: 'position', deck: pm.deck, position: pm.position, at: pm.at } : { type: 'pause', deck: pm.deck, position: pm.position });
    }
    const nextKey = pm.next ? pm.next.video : null;
    if (nextKey !== this.lastNext) {
      this.lastNext = nextKey;
      if (pm.next) {
        const nextDeck = (['a', 'b', 'c', 'd'] as DeckId[]).find((d) => this.engine.getState().decks[d].track?.id === pm.next!.video) ?? 'b';
        await this.send({ type: 'cue', deck: nextDeck, source: { kind: 'youtube', video_id: pm.next.video }, position: pm.next.position });
      }
    }
  }
}

// ---------------------------------------------------------------- appareil
export interface DeviceStatus { console: string; rtt_ms: number | null; offset_ms: number | null; samples: number; connected: boolean }
export interface DeviceState { phase: 'idle' | 'searching' | 'connecting' | 'connected' | 'lost'; consoleName: string; error: string | null; found: FoundConsole[]; status: DeviceStatus | null; offset: number; disconnections: number }

/** Côté appareil : trouve la console, s'appaire, reçoit ses messages, se reconnecte seul. */
export class NetDevice {
  readonly state = new Observable<DeviceState>({ phase: 'idle', consoleName: '', error: null, found: [], status: null, offset: 0, disconnections: 0 });
  private timers: ReturnType<typeof setInterval>[] = [];
  private target: { url: string; code: string; name: string; role: Role } | null = null;
  private reconnecting = false;
  private handlers = new Set<(m: NetMessage) => void>();

  private patch(p: Partial<DeviceState>) { this.state.set({ ...this.state.get(), ...p }); }

  async discover(): Promise<FoundConsole[]> {
    this.patch({ phase: 'searching', error: null });
    let found: FoundConsole[] = [];
    for (let i = 0; i < 3 && !found.length; i++) found = await tryCall<FoundConsole[]>('discover', { timeoutMs: 4000 }, []);
    this.patch({ phase: this.state.get().phase === 'searching' ? 'idle' : this.state.get().phase, found });
    return found;
  }

  async connect(url: string, code: string, name: string, role: Role) {
    this.target = { url, code, name, role };
    this.patch({ phase: 'connecting', error: null });
    try {
      const consoleName = await call<string>('device_connect', this.target);
      try { localStorage.setItem('lems.device.console', url); } catch { /* sans mémoire */ }
      this.patch({ phase: 'connected', consoleName, error: null });
      if (!this.timers.length) {
        this.timers.push(setInterval(() => void this.poll(), 100));
        this.timers.push(setInterval(() => void this.watch(), 500));
      }
    } catch (e) { this.target = null; this.patch({ phase: 'idle', error: String(e) }); throw e; }
  }

  disconnect() { this.timers.forEach(clearInterval); this.timers = []; this.target = null; this.patch({ phase: 'idle', consoleName: '', status: null }); }
  lastConsoleUrl(): string { try { return localStorage.getItem('lems.device.console') ?? ''; } catch { return ''; } }

  onMessage(h: (m: NetMessage) => void) { this.handlers.add(h); return () => { this.handlers.delete(h); }; }
  send(m: NetMessage) { return tryCall('device_send', { message: JSON.stringify(m) }, null); }

  /** Heure locale correspondant à l'heure `at` de la console. */
  toLocal(atConsole: number) { return atConsole - this.state.get().offset; }

  private async poll() {
    const msgs = await tryCall<NetMessage[]>('device_messages', undefined, []);
    for (const m of msgs) this.handlers.forEach((h) => h(m));
  }

  private async watch() {
    const s = await tryCall<DeviceStatus | null>('device_status', undefined, null);
    if (!s) return;
    this.patch({ status: s, offset: s.offset_ms ?? this.state.get().offset });
    if (s.connected === false && this.target && !this.reconnecting) {
      this.reconnecting = true;
      this.patch({ phase: 'lost', disconnections: this.state.get().disconnections + 1 });
      const t = this.target;
      const again = setInterval(async () => {
        try { const name = await call<string>('device_connect', t); clearInterval(again); this.reconnecting = false; this.patch({ phase: 'connected', consoleName: name, error: null }); }
        catch (e) { this.patch({ error: String(e) }); }
      }, 2000);
    }
  }
}

export function useObservable<T>(o: Observable<T>): T { return useSyncExternalStore(o.subscribe, o.get, o.get); }

/** Un écran distant transforme les messages réseau en ce que la fenêtre de sortie sait suivre. */
export function networkProgramSource(device: NetDevice): (handler: (m: ProgramMessage) => void) => () => void {
  return (handler) => {
    const videoOf: Partial<Record<DeckId, string>> = {};
    let current: ProgramMessage = { deck: null, video: null, title: '', channel: '', position: 0, at: Date.now(), playing: false, showTitle: false, next: null };
    const push = (p: Partial<ProgramMessage>) => { current = { ...current, ...p }; handler(current); };
    return device.onMessage((m) => {
      if (m.type === 'load' && m.source.kind === 'youtube') videoOf[m.deck] = m.source.video_id;
      else if (m.type === 'play') push({ deck: m.deck, video: videoOf[m.deck] ?? current.video, position: m.position, at: device.toLocal(m.at), playing: true });
      else if (m.type === 'position') push({ deck: m.deck, video: videoOf[m.deck] ?? current.video, position: m.position, at: device.toLocal(m.at), playing: true });
      else if (m.type === 'pause') { if (!videoOf[m.deck] && m.position === 0) push({ deck: null, video: null, playing: false }); else push({ deck: m.deck, video: videoOf[m.deck] ?? current.video, position: m.position, at: Date.now(), playing: false }); }
      else if (m.type === 'cue') push({ next: { video: m.source.video_id, position: m.position } });
      else if (m.type === 'state') { const d = m.decks.find((x) => x.deck === current.deck); if (d) push({ title: d.title ?? '', channel: d.channel ?? '' }); }
    });
  };
}
