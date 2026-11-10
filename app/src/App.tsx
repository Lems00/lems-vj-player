import { useEffect, useRef, useState } from 'react';
import './app.css';
import { DECKS, L } from './design';
import { Stage, assignSlots, traySlots } from './Stage';
import { engine, useEngine } from './engine';
import { DEFAULT_SETTINGS, EMPTY_LIBRARY, loadJson, saveJson, type Library, type Settings } from './store';
import { tryCall, type PlatformInfo } from './tauri';
import { NetConsole, useObservable } from './net';
import { DeviceApp } from './views/Device';
import { Console } from './views/Console';
import { Library as LibraryView } from './views/Library';
import { Settings as SettingsView } from './views/Settings';

type View = 'Console' | 'Bibliothèque' | 'Réglages';

export function App() {
  const [view, setView] = useState<View>('Console');
  const [settings, setSettings] = useState<Settings | null>(null);
  const [library, setLibrary] = useState<Library | null>(null);
  const [crash, setCrash] = useState<string | null>(null);
  const [platform, setPlatform] = useState<PlatformInfo | null | undefined>(undefined);
  const bridge = useRef<NetConsole | null>(null);
  if (!bridge.current) bridge.current = new NetConsole(engine);
  const netInfo = useObservable(bridge.current.info);
  const st = useEngine();
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    void Promise.all([loadJson('settings', DEFAULT_SETTINGS), loadJson('library', EMPTY_LIBRARY)]).then(([s, l]) => { setSettings(s); setLibrary(l); });
    void tryCall<string | null>('last_crash', undefined, null).then(setCrash);
    void tryCall<PlatformInfo | null>('platform_info', undefined, null).then(setPlatform);
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

  const isAndroid = platform?.os === 'android';
  const deviceMode = isAndroid || settings?.mode === 'device';

  // Console réseau : démarrée dès l'ouverture, pour que les appareils puissent se connecter.
  useEffect(() => {
    if (!settings || platform === undefined || deviceMode) return;
    void bridge.current!.start(settings.deviceName || 'Console Lems VJ Player');
    return () => bridge.current!.stop();
  }, [settings?.deviceName, platform === undefined, deviceMode]);

  // En mode appareil, la console n'est plus affichée : ses lecteurs YouTube quittent la page.
  useEffect(() => { if (deviceMode) engine.detachPlayers(); }, [deviceMode]);

  if (!settings || !library || platform === undefined) return <div className="app" />;
  if (deviceMode) return <DeviceApp deviceName={settings.deviceName} onBackToConsole={isAndroid ? undefined : () => setSettings((s) => (s ? { ...s, mode: 'console' } : s))} />;

  const onAir = engine.onAir();
  const devices = netInfo?.peers.filter((p) => p.connected).length ?? 0;
  const status = [
    ...(onAir.length ? [<span key="t">Son et vidéo en sortie</span>, ...onAir.map((d) => <L.DeckLetter key={d} deck={d} size="sm" />)] : [<span key="t">Rien ne part en sortie</span>]),
    ...(devices ? [<span key="sep" aria-hidden> · </span>, <L.StatusDot key="d" state="connected" />, <span key="n">{devices} appareil{devices > 1 ? 's' : ''}</span>] : []),
  ];
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
