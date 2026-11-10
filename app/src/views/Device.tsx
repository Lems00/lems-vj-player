// Vue 5a — l'appareil : choisir un rôle, trouver la console, saisir le code.
// Puis la vue du rôle : contrôleur (5b/6) ou écran (7b/7c).
import { useEffect, useRef, useState } from 'react';
import { L } from '../design';
import { NetDevice, networkProgramSource, useObservable, type ConsoleSnapshot, type Role } from '../net';
import { Output } from '../output/Output';
import { Controller } from './Controller';

const ROLES: { value: Role; label: string }[] = [{ value: 'controller', label: 'Contrôleur' }, { value: 'screen', label: 'Écran' }];

export function DeviceApp({ deviceName, onBackToConsole }: { deviceName: string; onBackToConsole?: () => void }) {
  const device = useRef<NetDevice>(null as unknown as NetDevice);
  if (!device.current) device.current = new NetDevice();
  const net = useObservable(device.current.state);
  const [role, setRole] = useState<Role>('controller');
  const [url, setUrl] = useState(device.current.lastConsoleUrl());
  const [code, setCode] = useState('');
  const [snapshot, setSnapshot] = useState<ConsoleSnapshot | null>(null);
  const [wide, setWide] = useState(window.innerWidth >= 900);

  useEffect(() => { const on = () => setWide(window.innerWidth >= 900); window.addEventListener('resize', on); return () => window.removeEventListener('resize', on); }, []);
  useEffect(() => device.current.onMessage((m) => { if (m.type === 'state') setSnapshot(m); }), []);
  useEffect(() => { void device.current.discover(); }, []);
  // L'écran reste allumé pendant qu'on suit la console (essai 5 : un téléphone en veille coupe le réseau).
  useEffect(() => {
    if (net.phase !== 'connected' || !navigator.wakeLock) return;
    let lock: { release: () => Promise<void> } | null = null;
    navigator.wakeLock.request('screen').then((l) => { lock = l; }).catch(() => { /* refusé */ });
    return () => { void lock?.release(); };
  }, [net.phase]);

  async function connect() {
    if (!url.trim()) return;
    try { await device.current.connect(url.trim(), code.trim(), deviceName || (role === 'screen' ? 'Écran' : 'Contrôleur'), role); } catch { /* l'état porte l'erreur */ }
  }

  const connected = net.phase === 'connected' || net.phase === 'lost';
  const status = net.phase === 'connected' ? [<L.StatusDot key="d" state="connected" />, <span key="t">{net.consoleName}{net.status?.rtt_ms != null ? ` · ${Math.round(net.status.rtt_ms)} ms` : ''}</span>]
    : net.phase === 'lost' ? [<L.StatusDot key="d" state="unstable" />, <span key="t">Connexion perdue, reconnexion…</span>]
    : [<L.StatusDot key="d" state="offline" />, <span key="t">Non connecté</span>];

  if (connected && role === 'screen') {
    return (
      <div className="screen-role">
        <Output subscribe={networkProgramSource(device.current)} />
        <div className={'screen-hud' + (net.phase === 'lost' ? ' is-lost' : '')}>{net.phase === 'lost' ? 'Connexion perdue · reconnexion…' : `Synchronisé avec ${net.consoleName}${net.status?.rtt_ms != null ? ` · ${Math.round(net.status.rtt_ms)} ms` : ''}`}</div>
        <button type="button" className="screen-leave" onClick={() => { device.current.disconnect(); setSnapshot(null); }}>Quitter</button>
      </div>
    );
  }

  return (
    <div className="device">
      <L.AppBar title={connected ? (role === 'controller' ? 'Contrôleur' : 'Écran') : 'Lems VJ Player'} items={[]} active="" onNavigate={() => undefined} status={status} />
      {connected ? (
        <>
          <Controller device={device.current} snapshot={snapshot} wide={wide} />
          <div className="view row" style={{ paddingTop: 0 }}>
            <L.Button size="sm" variant="ghost" onClick={() => { device.current.disconnect(); setSnapshot(null); }}>Se déconnecter</L.Button>
          </div>
        </>
      ) : (
        <div className="view device-connect">
          <section className="panel">
            <h2>Cet appareil sera</h2>
            <L.SegmentedControl value={role} options={ROLES} onChange={(v: string) => setRole(v as Role)} />
          </section>
          <section className="panel">
            <h2>Consoles sur ce Wi-Fi</h2>
            {net.phase === 'searching' ? <p className="muted">Recherche…</p> : net.found.length ? net.found.map((c) => (
              <div key={c.url ?? c.name} className="found-row">
                <div><b>{c.name}</b><br /><span className="muted">Console · {(c.addresses ?? []).join(', ')}</span></div>
                <L.Button size="sm" variant={url === c.url ? 'solid' : undefined} onClick={() => setUrl(c.url ?? '')}>{url === c.url ? 'Choisie' : 'Choisir'}</L.Button>
              </div>
            )) : <p className="muted">Aucune console trouvée. Sur la console : Réglages → Appareils connectés, et recopiez l’adresse affichée.</p>}
            <div className="row">
              <L.TextField placeholder="ws://192.168.1.20:48700" value={url} onChange={setUrl} aria-label="Adresse de la console" />
              <L.Button size="sm" onClick={() => void device.current.discover()} disabled={net.phase === 'searching'}>Chercher</L.Button>
            </div>
          </section>
          <section className="panel">
            <h2>Code affiché sur la console</h2>
            <L.CodeInput value={code} onChange={setCode} />
            <p className="muted" style={{ margin: 0 }}>Le code change après trois erreurs. Les échanges sont chiffrés et restent sur le réseau local.</p>
            {net.error ? <p className="error" role="alert">{net.error}</p> : null}
            <div className="row">
              <L.Button variant="solid" onClick={() => void connect()} disabled={net.phase === 'connecting' || !url.trim() || code.trim().length < 6}>{net.phase === 'connecting' ? 'Connexion…' : 'Se connecter'}</L.Button>
              {onBackToConsole ? <L.Button variant="ghost" onClick={onBackToConsole}>Redevenir console</L.Button> : null}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
