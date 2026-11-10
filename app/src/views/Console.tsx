// Vue 1 — la console : quatre platines, le mixeur, les moniteurs, la recherche.
import { useMemo, useState } from 'react';
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
      <L.Deck key={d} deck={d} source="youtube" title={t?.title} artist={t ? (t.channel || 'YouTube') : undefined}
        duration={dk.duration} bpm={t?.bpm ?? null} keyName={t ? (t.bpm ? 'YouTube · BPM au tap' : 'YouTube · tempo fixe') : null}
        position={dk.position} cuePoint={dk.cuePoint} playing={dk.playing} peaks={FLAT_PEAKS}
        onPlayingChange={(p: boolean) => (p ? engine.play(d) : engine.pause(d))}
        onCue={() => engine.cue(d)} onSeek={(s: number) => engine.seek(d, s)}
        prelisten={st.mix.strips[d].prelisten} onAir={onAir.includes(d)} />
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

      <p className="hint">Platines YouTube : lecture, repère, position et volume. Gain, égaliseur, casque séparé et SYNC sont indisponibles (règles de YouTube). Le casque et son mélange serviront aux fichiers locaux.</p>
      {error ? <p className="error" role="alert">{error}</p> : null}
      <div className="search">
        <L.TrackSearch query={query} onQueryChange={setQuery} onSearch={search} loading={loading} results={results} loaded={loadedIds} onLoad={load}
          placeholder={settings.youtubeApiKey ? 'Rechercher sur YouTube, ou coller un lien' : 'Coller un lien YouTube (ajoutez une clé dans Réglages pour chercher par mots-clés)'}
          emptyText={settings.youtubeApiKey ? 'Aucun résultat. Essayez un titre, un artiste, ou collez un lien YouTube.' : 'Collez un lien ou un identifiant YouTube, puis Rechercher.'} />
      </div>
    </div>
  );
}
