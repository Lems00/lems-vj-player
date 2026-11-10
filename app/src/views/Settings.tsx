// Vue 3 — réglages : son et vidéo, YouTube, appareils connectés, à propos.
import { useEffect, useState } from 'react';
import { DECKS, L } from '../design';
import { useEngine } from '../engine';
import { Tray } from '../Stage';
import { SEARCHES_PER_DAY, today } from '../search';
import { call, inApp, tryCall, type AudioDevice, type MonitorInfo, type PlatformInfo } from '../tauri';
import type { CrossfaderCurve, Library, Settings as SettingsData, Transition } from '../store';

type Section = 'Son et vidéo' | 'YouTube' | 'Appareils connectés' | 'À propos';
const SECTIONS: Section[] = ['Son et vidéo', 'YouTube', 'Appareils connectés', 'À propos'];

interface Peer { id: number; name: string; role: string; addr: string; connected: boolean; rtt_ms: number | null; offset_ms: number | null }
interface ConsoleInfo { port: number; code: string; peers: Peer[]; advertised: boolean; advertise_error: string | null; urls: string[] }

export interface SettingsProps { settings: SettingsData; onChange: (patch: Partial<SettingsData>) => void; library: Library }

export function Settings({ settings, onChange, library }: SettingsProps) {
  const st = useEngine();
  const loadedDecks = DECKS.filter((d) => st.decks[d].track);
  const [section, setSection] = useState<Section>('Son et vidéo');
  const [devices, setDevices] = useState<AudioDevice[]>([]);
  const [monitors, setMonitors] = useState<MonitorInfo[]>([]);
  const [platform, setPlatform] = useState<PlatformInfo | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [outputState, setOutputState] = useState<string>('');
  const [consoleInfo, setConsoleInfo] = useState<ConsoleInfo | null>(null);
  const [netError, setNetError] = useState<string | null>(null);

  useEffect(() => {
    void tryCall<AudioDevice[]>('audio_devices', undefined, []).then(setDevices);
    void tryCall<MonitorInfo[]>('list_monitors', undefined, []).then(setMonitors);
    void tryCall<PlatformInfo | null>('platform_info', undefined, null).then(setPlatform);
  }, []);

  useEffect(() => {
    if (section !== 'Appareils connectés' || !inApp()) return;
    let stop = false;
    call<ConsoleInfo>('console_start', { name: settings.deviceName || 'Console Lems VJ Player' }).then(setConsoleInfo).catch((e) => setNetError(String(e)));
    const t = setInterval(() => { void tryCall<ConsoleInfo | null>('console_info', undefined, null).then((i) => { if (!stop && i) setConsoleInfo(i); }); }, 1000);
    return () => { stop = true; clearInterval(t); };
  }, [section, settings.deviceName]);

  async function test(kind: 'main' | 'phones') {
    setTesting(kind);
    try {
      const main = kind === 'main' ? settings.mainOutput : '';
      const phones = kind === 'phones' ? settings.headphonesOutput : '';
      await call('audio_start', { main: kind === 'main' ? main : '__none__', phones: kind === 'phones' ? phones : '__none__', buffer: settings.bufferSize });
      await new Promise((r) => setTimeout(r, 1500));
    } catch (e) { setOutputState(String(e)); }
    finally { await tryCall('audio_stop', undefined, null); setTesting(null); }
  }

  async function openOutput() {
    if (settings.outputMonitor == null) { setOutputState('Choisissez d’abord un écran de sortie.'); return; }
    try {
      const r = await call<{ on_requested_monitor: boolean | null; fullscreen: boolean }>('open_output', { index: settings.outputMonitor, fullscreen: settings.outputFullscreen });
      setOutputState(r.on_requested_monitor === false ? 'Fenêtre ouverte, mais pas sur l’écran demandé : vérifiez la disposition des écrans.' : 'Fenêtre de sortie ouverte' + (r.fullscreen ? ' en plein écran.' : '.'));
    } catch (e) { setOutputState(String(e)); }
  }

  const deviceOptions = [{ value: '', label: 'Sortie par défaut du système' }, ...devices.map((d) => ({ value: d.name, label: d.name, meta: d.config_unknown ? 'réglages non lisibles' : `${d.max_channels} can.` }))];
  const quota = library.quota.day === today() ? library.quota.searches : 0;

  return (
    <div className="view settings">
      <nav className="side" aria-label="Sections des réglages">
        {SECTIONS.map((s) => <button key={s} type="button" className={'nav-item' + (s === section ? ' is-active' : '')} aria-current={s === section ? 'page' : undefined} onClick={() => setSection(s)}>{s}</button>)}
      </nav>
      <section>
        {section === 'Son et vidéo' ? (<>
          <div className="settings-section">
            <h3>Son</h3>
            <L.Notice title="Platines YouTube">Leur son sort sur la sortie par défaut du système, réglée par le volume de chaque platine et les crossfaders. Les sorties ci-dessous serviront aux fichiers locaux (casque séparé) ; « Tester » joue un son d’essai pour vérifier le branchement.</L.Notice>
            <Setting label="Sortie principale" hint="Ce que le public entend">
              <L.Select aria-label="Sortie principale" value={settings.mainOutput} options={deviceOptions} onChange={(v: string) => onChange({ mainOutput: v })} />
              <L.Button size="sm" disabled={!inApp() || !!testing} onClick={() => void test('main')}>{testing === 'main' ? 'Son d’essai…' : 'Tester'}</L.Button>
            </Setting>
            <Setting label="Casque (pré-écoute)" hint="Fichiers locaux uniquement">
              <L.Select aria-label="Casque" value={settings.headphonesOutput} options={deviceOptions} onChange={(v: string) => onChange({ headphonesOutput: v })} />
              <L.Button size="sm" disabled={!inApp() || !!testing} onClick={() => void test('phones')}>{testing === 'phones' ? 'Son d’essai…' : 'Tester'}</L.Button>
            </Setting>
            <Setting label="Latence" hint="Plus bas = plus réactif, plus de risque de craquements">
              <L.SegmentedControl value={String(settings.bufferSize)} options={['128', '256', '512', '1024'].map((v) => ({ value: v, label: v }))} onChange={(v: string) => onChange({ bufferSize: Number(v) as SettingsData['bufferSize'] })} />
              <span className="muted" style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>{settings.bufferSize} échantillons · {(settings.bufferSize / 48).toFixed(1)} ms à 48 kHz</span>
            </Setting>
            <Setting label="Courbe du crossfader">
              <L.SegmentedControl value={settings.crossfaderCurve} options={[{ value: 'linear', label: 'Progressive' }, { value: 'constant-power', label: 'Puissance constante' }, { value: 'cut', label: 'Coupe nette' }]} onChange={(v: string) => onChange({ crossfaderCurve: v as CrossfaderCurve })} />
            </Setting>
          </div>
          <div className="settings-section">
            <h3>Vidéo</h3>
            <Setting label="Écran de sortie" hint="Vidéoprojecteur ou écran géant">
              <L.Select aria-label="Écran de sortie" placeholder={monitors.length ? 'Choisir un écran' : (inApp() ? 'Aucun écran détecté' : 'Disponible dans l’application')} value={settings.outputMonitor == null ? undefined : String(settings.outputMonitor)}
                options={monitors.map((m) => ({ value: String(m.index), label: `Écran ${m.index + 1} — ${m.name}`, meta: `${m.width} × ${m.height}${m.is_primary ? ' · principal' : ''}` }))}
                onChange={(v: string) => onChange({ outputMonitor: Number(v) })} />
              <L.Button size="sm" variant="solid" disabled={!inApp()} onClick={() => void openOutput()}>Ouvrir la sortie</L.Button>
              <L.Button size="sm" disabled={!inApp()} onClick={() => { void tryCall('close_output', undefined, null); setOutputState('Fenêtre de sortie fermée.'); }}>Fermer</L.Button>
            </Setting>
            <Setting label="Plein écran à l’ouverture">
              <L.Toggle checked={settings.outputFullscreen} onChange={(v: boolean) => onChange({ outputFullscreen: v })} />
            </Setting>
            <Setting label="Transition entre vidéos" hint="Le fondu n’existe qu’entre deux fichiers locaux">
              <L.SegmentedControl value={settings.transition} options={[{ value: 'cut', label: 'Coupe franche' }, { value: 'fade', label: 'Fondu (fichiers)', disabled: true }]} onChange={(v: string) => onChange({ transition: v as Transition })} reason="Platines YouTube : coupe franche seulement (règle YouTube)." />
            </Setting>
            <Setting label="Titre du morceau à l’écran">
              <L.Toggle checked={settings.showTitleOnOutput} onChange={(v: boolean) => onChange({ showTitleOnOutput: v })} label={settings.showTitleOnOutput ? 'Affiché quelques secondes à chaque changement' : 'Désactivé'} />
            </Setting>
            {outputState ? <p className="muted" role="status" style={{ margin: 'var(--space-2) 0 0' }}>{outputState}</p> : null}
          </div>
        </>) : null}

        {section === 'YouTube' ? (
          <div className="settings-section">
            <h3>YouTube</h3>
            <Setting label="Clé d’API (Data API v3)" hint="Nécessaire pour la recherche par mots-clés ; coller un lien marche sans clé">
              <L.TextField type="password" placeholder="AIza…" value={settings.youtubeApiKey} onChange={(v: string) => onChange({ youtubeApiKey: v.trim() })} aria-label="Clé d’API YouTube" />
            </Setting>
            <Setting label="Recherches aujourd’hui" hint="100 unités par recherche, 10 000 par jour">
              <div style={{ flex: 1 }}>
                <div className="row"><span className="spacer" /><span style={{ fontFamily: 'var(--font-mono)' }}>{quota} / {SEARCHES_PER_DAY}</span></div>
                <div className="quota" aria-hidden>{Array.from({ length: 20 }, (_, i) => <i key={i} className={i < Math.round((quota / SEARCHES_PER_DAY) * 20) ? 'is-on' : ''} />)}</div>
              </div>
            </Setting>
            <L.Notice>Sur une platine YouTube, l’application ne peut pas modifier le son ni l’image : pas de gain, d’égaliseur, de casque séparé, de SYNC ni de fondu. Seuls la lecture, le repère et le volume sont disponibles. C’est une règle de YouTube, pas un réglage.</L.Notice>
            <L.Notice title="Obtenir une clé">Console Google Cloud → créer un projet → activer « YouTube Data API v3 » → Identifiants → Clé d’API. La clé reste sur cet ordinateur.</L.Notice>
          </div>
        ) : null}

        {section === 'Appareils connectés' ? (
          <div className="settings-section">
            <h3>Appareils connectés</h3>
            <Setting label="Nom de cette console" hint="Affiché aux appareils qui la cherchent">
              <L.TextField value={settings.deviceName} placeholder="Console Lems VJ Player" onChange={(v: string) => onChange({ deviceName: v })} aria-label="Nom de cette console" />
            </Setting>
            <Setting label="Rôle de cet ordinateur" hint="Console (défaut), ou appareil relié à une autre console">
              <L.Button size="sm" onClick={() => onChange({ mode: 'device' })}>Utiliser cet ordinateur comme écran ou contrôleur</L.Button>
            </Setting>
            {!inApp() ? <L.Notice>Disponible dans l’application.</L.Notice> : netError ? <p className="error" role="alert">{netError}</p> : consoleInfo ? (<>
              <Setting label="Code d’appairage" hint="À saisir sur l’appareil ; change après trois erreurs">
                <L.PairingCode code={consoleInfo.code} note={consoleInfo.urls.length ? 'adresse ' + consoleInfo.urls.join(' ou ') : 'aucune adresse réseau : cet ordinateur est-il sur le Wi-Fi ?'}
                  qr={<span className="qr-soon" aria-label="QR code : prochaine version">QR<br />bientôt</span>} />
                <L.Button size="sm" onClick={() => void call('console_new_code')}>Nouveau code</L.Button>
              </Setting>
              <div>
                {consoleInfo.peers.length ? consoleInfo.peers.map((p) => (
                  <L.DeviceRow key={p.id} name={p.name} state={p.connected ? 'connected' : 'offline'} role={p.role === 'screen' ? 'Écran' : p.role === 'library' ? 'Bibliothèque' : 'Contrôleur'}
                    detail={p.connected ? `Connecté · ${p.addr}${p.rtt_ms != null ? ` · ${p.rtt_ms} ms` : ''}` : 'Déconnecté'} />
                )) : <p className="muted" style={{ margin: 'var(--space-2) 0 0' }}>Aucun appareil. {consoleInfo.advertised ? 'La console est annoncée sur le Wi-Fi.' : 'Annonce Wi-Fi impossible : ' + consoleInfo.advertise_error}</p>}
              </div>
              <L.Notice>Version 1 : les appareils se connectent et sont reconnus ; le contrôle à distance et les écrans synchronisés arrivent à l’étape 5 du plan. Les échanges sont chiffrés et restent sur le réseau local.</L.Notice>
            </>) : <p className="muted">Démarrage de la console…</p>}
          </div>
        ) : null}

        {section === 'À propos' ? (
          <div className="settings-section about">
            <h3>À propos</h3>
            <dl>
              <dt>Application</dt><dd>Lems VJ Player {platform?.app_version ?? '0.1.0'} (version 1, ordinateur)</dd>
              <dt>Système</dt><dd>{platform ? `${platform.os} ${platform.arch}` : 'navigateur'}</dd>
              <dt>Page</dt><dd>{location.origin}</dd>
              <dt>Design system</dt><dd>Lems VJ Player, 26 composants</dd>
            </dl>
            <L.Notice>YouTube est lu par son lecteur officiel, sans modification du son ni de l’image (conditions d’utilisation des services API YouTube, section III). Les fichiers locaux, le casque séparé et les effets viendront à l’étape suivante.</L.Notice>
          </div>
        ) : null}
      </section>
      <aside className="side">
        <div className="panel">
          <h3>Sortie en cours</h3>
          <p className="muted" style={{ margin: 0 }}>{(() => { const d = DECKS.find((x) => st.decks[x].playing && st.decks[x].track); return d ? `Platine ${d.toUpperCase()} — ${st.decks[d].track!.title}` : 'Rien à l’antenne.'; })()}</p>
          <Tray decks={loadedDecks} Letter={L.DeckLetter} />
        </div>
      </aside>
    </div>
  );
}

function Setting({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="setting">
      <div className="setting-label"><b>{label}</b>{hint ? <span>{hint}</span> : null}</div>
      <div className="setting-control">{children}</div>
    </div>
  );
}
