// Pont vers la partie Rust (Tauri). L'application expose `window.__TAURI__`
// (withGlobalTauri) : on passe par lui quand il est là, ce qui permet aussi aux
// tests d'en poser une doublure. Dans un simple navigateur, `inApp()` vaut false
// et chaque appel renvoie une erreur claire plutôt qu'un plantage.
import { invoke as tauriInvoke } from '@tauri-apps/api/core';
import { emit as tauriEmit, listen as tauriListen, type UnlistenFn } from '@tauri-apps/api/event';

interface TauriGlobal {
  __TAURI__?: {
    core?: { invoke: <T>(cmd: string, args?: Record<string, unknown>) => Promise<T> };
    event?: { emit: (event: string, payload?: unknown) => Promise<void>; listen: <T>(event: string, handler: (e: { payload: T }) => void) => Promise<UnlistenFn> };
  };
  __TAURI_INTERNALS__?: unknown;
}
const g = () => window as unknown as TauriGlobal;

export const inApp = (): boolean => !!(g().__TAURI_INTERNALS__ || g().__TAURI__?.core);

export class NotInApp extends Error {
  constructor(cmd: string) { super(`« ${cmd} » demande l’application Lems VJ Player (ici : simple navigateur).`); }
}

export async function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!inApp()) throw new NotInApp(cmd);
  const direct = g().__TAURI__?.core?.invoke;
  return direct ? direct<T>(cmd, args) : tauriInvoke<T>(cmd, args);
}

/** Comme `call`, mais rend `fallback` hors de l'application, ou si la commande échoue. */
export async function tryCall<T>(cmd: string, args: Record<string, unknown> | undefined, fallback: T): Promise<T> {
  if (!inApp()) return fallback;
  try { return await call<T>(cmd, args); } catch { return fallback; }
}

export async function emit(event: string, payload: unknown): Promise<void> {
  if (!inApp()) { window.dispatchEvent(new CustomEvent('lems:' + event, { detail: payload })); return; }
  const direct = g().__TAURI__?.event?.emit;
  await (direct ? direct(event, payload) : tauriEmit(event, payload));
}

export async function listen<T>(event: string, handler: (payload: T) => void): Promise<UnlistenFn> {
  if (!inApp()) {
    const fn = (e: Event) => handler((e as CustomEvent).detail as T);
    window.addEventListener('lems:' + event, fn);
    return () => window.removeEventListener('lems:' + event, fn);
  }
  const direct = g().__TAURI__?.event?.listen;
  return direct ? direct<T>(event, (e) => handler(e.payload)) : tauriListen<T>(event, (e) => handler(e.payload));
}

export interface PlatformInfo { os: string; arch: string; app_version: string; localhost_port: number }
export interface MonitorInfo { index: number; name: string; width: number; height: number; x: number; y: number; scale: number; is_primary: boolean }
export interface AudioDevice { name: string; is_default: boolean; max_channels: number; sample_rates: number[]; buffer_min: number | null; buffer_max: number | null; config_unknown: boolean }
