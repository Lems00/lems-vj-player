import { useEffect, useRef, useState } from 'react';
import './app.css';
import { DECKS, L } from './design';
import { Stage, assignSlots, traySlots } from './Stage';
import { engine, useEngine } from './engine';
import { DEFAULT_SETTINGS, EMPTY_LIBRARY, loadJson, saveJson, type Library, type Settings } from './store';
import { tryCall } from './tauri';
import { Console } from './views/Console';
import { Library as LibraryView } from './views/Library';
import { Settings as SettingsView } from './views/Settings';

type View = 'Console' | 'Bibliothèque' | 'Réglages';

export function App() {
  const [view, setView] = useState<View>('Console');
  const [settings, setSettings] = useState<Settings | null>(null);
  const [library, setLibrary] = useState<Library | null>(null);
  const [crash, setCrash] = useState<string | null>(null);
  const st = useEngine();
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    void Promise.all([loadJson('settings', DEFAULT_SETTINGS), loadJson('library', EMPTY_LIBRARY)]).then(([s, l]) => { setSettings(s); setLibrary(l); });
    void tryCall<string | null>('last_crash', undefined, null).then(setCrash);
  }, []);

  // Le moteur suit les réglages qui le concernent.
  useEffect(() => { if (settings) { engine.setCurve(settings.crossfaderCurve); engine.setShowTitle(settings.showTitleOnOutput); } }, [settings?.crossfaderCurve, settings?.showTitleOnOutput]);

  // Chaque morceau chargé entre dans la bibliothèque (historique), avec son titre une fois connu.
  useEffect(() => {
    engine.onTrackLoaded = (t) => setLibrary((lib) => {
      if (!lib) return lib;
      const i = lib.tracks.findIndex((x) => x.id === t.id);
      const tracks = i >= 0 ? lib.tracks.map((x, k) => (k === i ? { ...x, ...t, bpm: t.bpm ?? x.bpm, addedAt: x.addedAt } : x)) : [...lib.tracks, t];
      return { ...lib, tracks };
    });
    return () => { engine.onTrackLoaded = null; };
  }, []);

  // Enregistrement groupé, 300 ms après le dernier changement.
  useEffect(() => {
    if (!settings || !library) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { void saveJson('settings', settings); void saveJson('library', library); }, 300);
  }, [settings, library]);

  if (!settings || !library) return <div className="app" />;

  const onAir = engine.onAir();
  const status = onAir.length
    ? [<span key="t">Son et vidéo en sortie</span>, ...onAir.map((d) => <L.DeckLetter key={d} deck={d} size="sm" />)]
    : <span>Rien ne part en sortie</span>;
  const patchLibrary = (f: (lib: Library) => Library) => setLibrary((lib) => (lib ? f(lib) : lib));
  // Les quatre lecteurs YouTube vivent dans la Scène, au niveau de l'application :
  // changer de vue ne les détruit pas, ils changent seulement d'emplacement.
  const loaded = DECKS.filter((d) => st.decks[d].track);
  const slots = view === 'Console' ? assignSlots(engine.program(), st.mix.preview, loaded) : traySlots(loaded);

  return (
    <div className="app">
      <L.AppBar title="Lems VJ Player" items={['Console', 'Bibliothèque', 'Réglages']} active={view} onNavigate={(v) => setView(v as View)} status={status} />
      {crash ? (
        <div className="view" style={{ paddingBottom: 0 }}>
          <L.Notice title="L’application s’est arrêtée la dernière fois">
            <span>Le détail ci-dessous aide à corriger le défaut.</span>
            <pre style={{ margin: 'var(--space-2) 0 0', whiteSpace: 'pre-wrap', maxHeight: 160, overflow: 'auto', font: '12px/16px var(--font-mono)' }}>{crash}</pre>
            <L.Button size="sm" onClick={() => setCrash(null)}>Fermer</L.Button>
          </L.Notice>
        </div>
      ) : null}
      {view === 'Console' ? <Console settings={settings} library={library} onLibraryChange={patchLibrary} /> : null}
      {view === 'Bibliothèque' ? <LibraryView settings={settings} library={library} onLibraryChange={patchLibrary} /> : null}
      {view === 'Réglages' ? <SettingsView settings={settings} library={library} onChange={(p) => setSettings((s) => (s ? { ...s, ...p } : s))} /> : null}
      <Stage slots={slots} />
      <span hidden data-decks-loaded={loaded.length} />
    </div>
  );
}
