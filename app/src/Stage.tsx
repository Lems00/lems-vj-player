// La scène : les quatre lecteurs YouTube vivent ici, une fois pour toutes, et
// sont posés par-dessus l'emplacement qu'on leur désigne (un moniteur, ou une
// tuile du bac). Déplacer un lecteur dans la page le rechargerait : on déplace
// donc l'emplacement sous lui, jamais lui.
import { useEffect, useRef } from 'react';
import { DECKS, type DeckId } from './design';
import { engine } from './engine';

export type SlotKey = string; // 'program' | 'left' | 'right' | 'tray-a' …
const PARK_W = 356, PARK_H = 200; // règle YouTube : au moins 200 × 200

export function Stage({ slots }: { slots: Record<DeckId, SlotKey | null> }) {
  const hosts = useRef<Partial<Record<DeckId, HTMLDivElement | null>>>({});
  const current = useRef(slots);
  current.current = slots;

  useEffect(() => {
    for (const d of DECKS) {
      const host = hosts.current[d];
      if (host && !engine.hasPlayer(d)) engine.attachPlayer(d, host, PARK_W, PARK_H);
    }
  }, []);

  useEffect(() => {
    let raf = 0;
    const place = () => {
      raf = 0;
      for (const d of DECKS) {
        const el = hosts.current[d]?.parentElement;
        if (!el) continue;
        const key = current.current[d];
        const slot = key ? document.querySelector<HTMLElement>(`[data-slot="${key}"]`) : null;
        if (!slot) { el.classList.add('is-parked'); continue; }
        const r = slot.getBoundingClientRect();
        el.classList.remove('is-parked');
        el.style.left = r.left + 'px'; el.style.top = r.top + 'px';
        el.style.width = Math.max(PARK_W, r.width) + 'px'; el.style.height = Math.max(PARK_H, r.height) + 'px';
      }
    };
    const schedule = () => { if (!raf) raf = requestAnimationFrame(place); };
    place();
    const timer = setInterval(place, 100);
    window.addEventListener('scroll', schedule, true);
    window.addEventListener('resize', schedule);
    return () => { clearInterval(timer); if (raf) cancelAnimationFrame(raf); window.removeEventListener('scroll', schedule, true); window.removeEventListener('resize', schedule); };
  }, []);

  return (
    <>
      {DECKS.map((d) => (
        <div key={d} className="stage-player is-parked" data-stage={d} aria-hidden={slots[d] ? undefined : true}>
          <div ref={(el) => { hosts.current[d] = el; }} style={{ width: '100%', height: '100%' }} />
        </div>
      ))}
    </>
  );
}

/** Où va chaque lecteur : la sortie d'abord, puis les deux prévisualisations, le reste dans le bac. */
export function assignSlots(program: DeckId | null, preview: { left: DeckId; right: DeckId }, loaded: DeckId[]): Record<DeckId, SlotKey | null> {
  const out: Record<DeckId, SlotKey | null> = { a: null, b: null, c: null, d: null };
  if (program) out[program] = 'program';
  if (preview.left !== program) out[preview.left] = 'left';
  if (preview.right !== program && preview.right !== preview.left) out[preview.right] = 'right';
  for (const d of loaded) if (!out[d]) out[d] = 'tray-' + d;
  return out;
}

/** Hors de la console : toutes les platines chargées vont dans le bac. */
export function traySlots(loaded: DeckId[]): Record<DeckId, SlotKey | null> {
  const out: Record<DeckId, SlotKey | null> = { a: null, b: null, c: null, d: null };
  for (const d of loaded) out[d] = 'tray-' + d;
  return out;
}

/** Le bac : les platines chargées qui ne sont dans aucun moniteur restent visibles, en petit. */
export function Tray({ decks, Letter }: { decks: DeckId[]; Letter: React.ComponentType<{ deck: DeckId; size?: 'sm' }> }) {
  return (
    <div className="tray" aria-label="Platines hors moniteur">
      {decks.map((d) => (
        <div key={d} className={'tray-tile lm-deck-' + d}>
          <Letter deck={d} size="sm" />
          <div className="slot" data-slot={'tray-' + d} />
        </div>
      ))}
    </div>
  );
}
