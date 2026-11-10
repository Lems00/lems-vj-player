// Suivi d'une lecture de référence (la console) par un autre lecteur (un écran).
// Méthode validée par les essais 5 et 6 : la référence ne se corrige jamais ;
// l'écran mesure son écart et le rattrape en douceur (1,05× / 0,95×, les
// seules vitesses fines acceptées par YouTube), ne saute qu'au-delà de 1,5 s,
// et laisse le lecteur se stabiliser après chaque saut.
import { YtPlayer, YT_STATE } from './youtube';

export const SYNC = { enterMs: 30, exitMs: 10, jumpMs: 1500, settleMs: 1200, everyMs: 250 } as const;

export interface FollowStats { median: number | null; p95: number | null; jumps: number; nudges: number; samples: number }

const median = (a: number[]) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const percentile = (a: number[], p: number) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };

export class Follower {
  private base: number | null = null; // position − heure locale (s) : où en est la référence
  private samples: number[] = [];
  private rate = 1;
  private settleUntil = 0;
  private seekLead = 0.25;
  private drifts: number[] = [];
  private jumps = 0;
  private nudges = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  constructor(private player: YtPlayer) {}

  /** La référence était à `position` (s) à l'heure locale `atMs`. Médiane des 8 derniers relevés ; remise à zéro si la référence saute. */
  report(position: number, atMs: number) {
    const b = position - atMs / 1000;
    const cur = median(this.samples);
    if (cur != null && Math.abs(b - cur) > 1) this.samples = [];
    this.samples.push(b);
    if (this.samples.length > 8) this.samples.shift();
    this.base = median(this.samples);
  }

  start() {
    this.stop();
    this.settleUntil = Date.now() + SYNC.settleMs;
    this.timer = setInterval(() => this.step(), SYNC.everyMs);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.rate !== 1) { this.player.setRate(1); this.rate = 1; }
  }

  reset() { this.base = null; this.samples = []; this.drifts = []; this.jumps = 0; this.nudges = 0; }

  stats(): FollowStats {
    const recent = this.drifts.slice(-80);
    return { median: median(recent), p95: percentile(recent, 0.95), jumps: this.jumps, nudges: this.nudges, samples: this.drifts.length };
  }

  private step() {
    if (this.base == null || this.player.state() !== YT_STATE.PLAYING) return;
    const now = Date.now();
    if (now < this.settleUntil) return;
    const expected = now / 1000 + this.base;
    const d = (this.player.time() - expected) * 1000; // > 0 : en avance
    this.drifts.push(Math.abs(d));
    if (this.drifts.length > 400) this.drifts.shift();
    if (Math.abs(d) > SYNC.jumpMs) {
      this.jumps++;
      if (this.rate !== 1) { this.player.setRate(1); this.rate = 1; }
      this.player.seek(expected + this.seekLead);
      this.settleUntil = now + SYNC.settleMs;
    } else if (Math.abs(d) > SYNC.enterMs || (this.rate !== 1 && Math.abs(d) > SYNC.exitMs)) {
      const want = d < 0 ? 1.05 : 0.95;
      if (this.rate !== want) { this.player.setRate(want); this.rate = want; this.nudges++; }
    } else if (this.rate !== 1) {
      this.player.setRate(1); this.rate = 1;
    }
  }
}
