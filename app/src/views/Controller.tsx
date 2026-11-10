// Vues 5b et 6 — le contrôleur : pilote la console à distance. Le son et
// l'image restent sur la console ; ici, on voit son état et on lui envoie
// des commandes (transport, volumes, crossfaders).
import { useEffect, useState } from 'react';
import { DECKS, L, type DeckId, type StripValue } from '../design';
import type { ConsoleSnapshot, NetDevice } from '../net';

const FLAT_PEAKS = Array.from({ length: 120 }, () => 0.18);
const LEFT: Record<DeckId, boolean> = { a: true, b: false, c: true, d: false };
const PAIR: Record<DeckId, [DeckId, DeckId]> = { a: ['a', 'b'], b: ['a', 'b'], c: ['c', 'd'], d: ['c', 'd'] };

export function Controller({ device, snapshot, wide }: { device: NetDevice; snapshot: ConsoleSnapshot | null; wide: boolean }) {
  const [selected, setSelected] = useState<DeckId>('a');
  // Volumes et crossfaders : ce que l'on touche prime pendant une seconde sur ce que la console renvoie.
  const [local, setLocal] = useState<{ volumes: Partial<Record<DeckId, number>>; ab?: number; cd?: number; until: number }>({ volumes: {}, until: 0 });
  useEffect(() => { const t = setInterval(() => { if (local.until && Date.now() > local.until) setLocal({ volumes: {}, until: 0 }); }, 300); return () => clearInterval(t); }, [local.until]);

  const deckOf = (d: DeckId) => snapshot?.decks.find((x) => x.deck === d);
  const volume = (d: DeckId) => local.volumes[d] ?? deckOf(d)?.volume ?? 0.75;
  const xf = (pair: 'ab' | 'cd') => local[pair] ?? snapshot?.[pair] ?? 0;
  const hold = () => Date.now() + 1000;

  function setVolume(d: DeckId, v: number) { setLocal((l) => ({ ...l, volumes: { ...l.volumes, [d]: v }, until: hold() })); void device.send({ type: 'volume', deck: d, value: v }); }
  function setXf(pair: 'ab' | 'cd', v: number) { setLocal((l) => ({ ...l, [pair]: v, until: hold() })); void device.send({ type: 'crossfader', left: pair === 'ab' ? 'a' : 'c', right: pair === 'ab' ? 'b' : 'd', value: v }); }

  function deckView(d: DeckId) {
    const s = deckOf(d);
    return (
      <L.Deck key={d} deck={d} source="youtube" title={s?.title ?? undefined} artist={s?.title ? (s.channel || 'YouTube') : undefined}
        duration={s?.duration ?? 0} position={s?.position ?? 0} bpm={s?.bpm ?? null} keyName={s?.title ? 'YouTube · tempo fixe' : null}
        playing={!!s?.playing} onAir={!!s?.on_air} peaks={FLAT_PEAKS} cuePoint={0}
        onPlayingChange={(p: boolean) => void device.send({ type: 'transport', deck: d, action: p ? 'play' : 'pause' })}
        onCue={() => void device.send({ type: 'transport', deck: d, action: 'cue' })} />
    );
  }
  function strip(d: DeckId) {
    const value: StripValue = { gain: 0.5, hi: 0.5, mid: 0.5, lo: 0.5, volume: volume(d), prelisten: false };
    return <L.ChannelStrip key={d} deck={d} source="youtube" value={value} level={deckOf(d)?.on_air ? volume(d) : 0} faderHeight={wide ? 136 : 120} onChange={(v) => setVolume(d, v.volume)} />;
  }

  if (!snapshot) return <p className="muted device-wait">Connecté. En attente de l’état de la console…</p>;

  if (wide) {
    return (
      <div className="view console controller-wide">
        <div className="col">{deckView('a')}{deckView('c')}</div>
        <div className="mixer">
          <div className="strips">{strip('c')}{strip('a')}{strip('b')}{strip('d')}</div>
          <div className="xfaders">
            <L.Crossfader left="a" right="b" value={xf('ab')} onChange={(v) => setXf('ab', v)} />
            <L.Crossfader left="c" right="d" value={xf('cd')} onChange={(v) => setXf('cd', v)} />
          </div>
        </div>
        <div className="col">{deckView('b')}{deckView('d')}</div>
      </div>
    );
  }

  const [l, r] = PAIR[selected];
  return (
    <div className="view controller-phone">
      <div className="deck-tabs" role="tablist" aria-label="Platine affichée">
        {DECKS.map((d) => <button key={d} type="button" role="tab" aria-selected={d === selected} className={'deck-tab lm-deck-' + d + (d === selected ? ' is-on' : '')} onClick={() => setSelected(d)}><L.DeckLetter deck={d} size="sm" outline={d !== selected} /></button>)}
      </div>
      {deckView(selected)}
      <div className="phone-mixer">
        <div className="phone-faders">
          {[l, r].map((d) => (
            <div key={d} className={'phone-fader lm-deck-' + d}>
              <L.DeckLetter deck={d} size="sm" />
              <L.Fader deck={d} aria-label={'Volume ' + d.toUpperCase()} value={volume(d)} height={150} onChange={(v: number) => setVolume(d, v)} />
            </div>
          ))}
        </div>
        <div className="phone-xf">
          <span className="lm-knob-label">Crossfader</span>
          <L.Crossfader left={l} right={r} value={xf(LEFT[selected] ? (selected === 'a' ? 'ab' : 'cd') : (selected === 'b' ? 'ab' : 'cd'))} onChange={(v) => setXf(selected === 'a' || selected === 'b' ? 'ab' : 'cd', v)} />
        </div>
      </div>
    </div>
  );
}
