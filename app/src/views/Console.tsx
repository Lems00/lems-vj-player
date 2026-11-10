// Vue 1 — la console : quatre platines, le mixeur, les moniteurs, la recherche.
import { useEffect, useMemo, useRef, useState } from 'react';
import { DECKS, L, type DeckId, type SearchResult } from '../design';
import { engine, useEngine } from '../engine';
import { Tray, assignSlots } from '../Stage';
import { resolveQuery } from '../search';
import type { Library, Settings, Track } from '../store';

// Pas de forme d'onde pour YouTube (l'application n'a pas accès au son) : une
// barre plate sert de barre de progression, honnêtement.
const FLAT_PEAKS = Array.from({ length: 120 }, () => 0.18);

export interface ConsoleProps {
  settings: Settings;
  library: Library;
  onLibraryChange: (patch: (lib: Library) => Library) => void;
}

export function Console({ settings, library, onLibraryChange }: ConsoleProps) {
  const st = useEngine();
  const gains = engine.gains();
  const program = engine.program();
  const onAir = engine.onAir();
  const loaded = DECKS.filter((d) => st.decks[d].track);
  const slots = useMemo(() => assignSlots(program, st.mix.preview, loaded), [program, st.mix.preview.left, st.mix.preview.right, loaded.join('')]);
  const trayDecks = DECKS.filter((d) => slots[d]?.startsWith('tray-'));

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const taps = useRef<Partial<Record<DeckId, number[]>>>({});

  // BPM au tap : au moins 4 frappes, médiane des intervalles ; une pause de 2 s recommence.
  function tap(d: DeckId) {
    const now = performance.now(), list = (taps.current[d] ?? []).filter((t) => now - t < 2000);
    list.push(now); taps.current[d] = list.slice(-12);
    if (list.length >= 4) {
      const gaps = list.slice(1).map((t, i) => t - list[i]).sort((x, y) => x - y);
      const med = gaps[gaps.length >> 1];
      engine.setBpm(d, Math.round((60000 / med) * 10) / 10);
    }
  }

  // Raccourcis (indépendants de la disposition du clavier : chiffres, flèches, espace).
  // 1–4 : lecture/pause A–D · Maj+1–4 : repère A–D · ←/→ : crossfader A/B · Maj+←/→ : C/D · Espace : platine active · T : BPM au tap.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      const m = /^Digit([1-4])$/.exec(e.code);
      if (m) { const d = DECKS[+m[1] - 1]; e.preventDefault(); e.shiftKey ? engine.cue(d) : engine.toggle(d); engine.focus(d); return; }
      if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
        const pair = e.shiftKey ? 'cd' : 'ab', cur = engine.getState().mix[pair];
        e.preventDefault(); engine.setCrossfader(pair, cur + (e.code === 'ArrowRight' ? 0.1 : -0.1)); return;
      }
      if (e.code === 'Space') { const d = engine.focused ?? engine.program(); if (d) { e.preventDefault(); engine.toggle(d); } return; }
      if (e.code === 'KeyT') { const d = engine.focused ?? engine.program(); if (d) { e.preventDefault(); tap(d); } }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  async function search(q: string) {
    if (!q.trim()) return;
    setLoading(true); setError(null);
    try {
      const { results, countedSearch } = await resolveQuery(q, settings.youtubeApiKey);
      setResults(results);
      if (countedSearch) onLibraryChange((lib) => {
        const day = new Date().toISOString().slice(0, 10);
        return { ...lib, quota: lib.quota.day === day ? { day, searches: lib.quota.searches + 1 } : { day, searches: 1 } };
      });
    } catch (e) { setError((e as Error).message); setResults([]); }
    finally { setLoading(false); }
  }

  function load(r: SearchResult, d: DeckId) {
    const known = library.tracks.find((t) => t.id === r.id);
    const track: Track = { id: r.id, title: r.title, channel: r.channel ?? '', duration: typeof r.duration === 'number' ? r.duration : known?.duration, thumbnail: r.thumbnail ?? known?.thumbnail, bpm: known?.bpm, addedAt: known?.addedAt ?? Date.now() };
    engine.load(d, track);
  }

  const loadedIds: Partial<Record<DeckId, string>> = {};
  for (const d of loaded) loadedIds[d] = st.decks[d].track!.id;

  function deckView(d: DeckId) {
    const dk = st.decks[d], t = dk.track;
    return (
      <div key={d} className="deck-block" onPointerDownCapture={() => { engine.focus(d); if (t && d !== program) engine.showPreview(d); }}>
      <L.Deck deck={d} source="youtube" title={t?.title} artist={t ? (t.channel || 'YouTube') : undefined}
        duration={dk.duration} bpm={t?.bpm ?? null} keyName={t ? (t.bpm ? 'YouTube · BPM au tap' : 'YouTube · tempo fixe') : null}
        position={dk.position} cuePoint={dk.cuePoint} playing={dk.playing} peaks={FLAT_PEAKS}
        onPlayingChange={(p: boolean) => (p ? engine.play(d) : engine.pause(d))}
        onCue={() => engine.cue(d)} onSeek={(s: number) => engine.seek(d, s)}
        prelisten={st.mix.strips[d].prelisten} onAir={onAir.includes(d)} />
      <div className="deck-tools">
        <button type="button" className={'tapbtn lm-deck-' + d} disabled={!t} aria-label={'BPM au tap, platine ' + d.toUpperCase()} title="Frappez en rythme, 4 fois au moins (ou touche T)" onClick={() => tap(d)}>TAP BPM</button>
        {t?.bpm ? <button type="button" className="tapbtn" aria-label="Effacer le BPM" onClick={() => { taps.current[d] = []; engine.setBpm(d, undefined); }}>Effacer</button> : null}
        {dk.error ? <span className="deck-error" role="alert">YouTube : {dk.error}</span> : null}
        {engine.focused === d ? <span className="deck-focus" aria-label="Platine commandée au clavier">clavier</span> : null}
      </div>
      </div>
    );
  }

  function previewView(side: 'left' | 'right') {
    const d = st.mix.preview[side], t = st.decks[d].track;
    const isProgram = d === program;
    return (
      <L.VideoMonitor mode="preview" deck={d} title={t?.title ?? ''} emptyText="Aucune vidéo chargée">
        {!t ? null : isProgram
          ? <div className="monitor-note"><b>Platine {d.toUpperCase()} à l’antenne</b><span>Sa vidéo est dans le moniteur de sortie.</span></div>
          : <div className="slot" data-slot={side} />}
      </L.VideoMonitor>
    );
  }

  const programTitle = onAir.map((d) => d.toUpperCase() + ' — ' + (st.decks[d].track?.title ?? '')).join('  +  ');
  const masterLevel = program ? Math.min(1, gains[program] * 1.05) : 0;

  return (
    <div className="view console">
      {previewView('left')}
      <L.VideoMonitor mode="program" live={!!program} title={programTitle} emptyText="Rien à l’antenne : montez un fader et lancez une platine">
        {program ? <div className="slot" data-slot="program" /> : null}
      </L.VideoMonitor>
      {previewView('right')}

      <div className="col">{deckView('a')}{deckView('c')}</div>
      <div className="mixer">
        <div className="strips">
          {(['c', 'a', 'b', 'd'] as DeckId[]).map((d) => (
            <L.ChannelStrip key={d} deck={d} source="youtube" value={st.mix.strips[d]} level={gains[d]} faderHeight={136}
              onChange={(v) => engine.setStrip(d, v)} />
          ))}
          <section className="master" aria-label="Master et casque">
            <span className="master-name">Master</span>
            <L.Knob label="Sortie" aria-label="Volume de sortie" value={st.mix.master} defaultValue={0.85} onChange={(v) => engine.setMaster(v)} />
            <span className="master-rule" aria-hidden />
            <L.Knob label="Casque" aria-label="Volume du casque (fichiers locaux)" size={36} value={st.mix.phones} defaultValue={0.7} onChange={(v) => engine.setPhones(v)} disabled />
            <L.Knob label="Cue/Mst" aria-label="Mélange casque (fichiers locaux)" size={36} bipolar value={st.mix.cueMix} defaultValue={0.5} onChange={(v) => engine.setCueMix(v)} disabled />
            <div className="master-vu">
              <L.VuMeter level={masterLevel} height={172} aria-label="Niveau de sortie, gauche" />
              <L.VuMeter level={masterLevel} height={172} aria-label="Niveau de sortie, droite" />
            </div>
          </section>
        </div>
        <div className="xfaders">
          <L.Crossfader left="a" right="b" value={st.mix.ab} onChange={(v) => engine.setCrossfader('ab', v)} />
          <L.Crossfader left="c" right="d" value={st.mix.cd} onChange={(v) => engine.setCrossfader('cd', v)} />
        </div>
        <Tray decks={trayDecks} Letter={L.DeckLetter} />
      </div>
      <div className="col">{deckView('b')}{deckView('d')}</div>

      <p className="hint">Platines YouTube : lecture, repère, position et volume. Gain, égaliseur, casque séparé et SYNC sont indisponibles (règles de YouTube). Le casque et son mélange serviront aux fichiers locaux.<br />Clavier : 1–4 lecture/pause A–D · Maj+1–4 repère · ←/→ crossfader A/B (Maj : C/D) · Espace platine active · T tap BPM.</p>
      {error ? <p className="error" role="alert">{error}</p> : null}
      <div className="search">
        <L.TrackSearch query={query} onQueryChange={setQuery} onSearch={search} loading={loading} results={results} loaded={loadedIds} onLoad={load}
          placeholder={settings.youtubeApiKey ? 'Rechercher sur YouTube, ou coller un lien' : 'Coller un lien YouTube (ajoutez une clé dans Réglages pour chercher par mots-clés)'}
          emptyText={settings.youtubeApiKey ? 'Aucun résultat. Essayez un titre, un artiste, ou collez un lien YouTube.' : 'Collez un lien ou un identifiant YouTube, puis Rechercher.'} />
      </div>
    </div>
  );
}
