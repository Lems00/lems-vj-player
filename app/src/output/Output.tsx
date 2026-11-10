// La fenêtre de sortie (vue 7a) : plein écran, aucune commande visible. Deux
// lecteurs : l'un montre la platine à l'antenne et suit sa lecture réelle,
// l'autre précharge la platine suivante pour une coupe franche sans attente.
// Le son vient de la console : ici, les lecteurs sont muets.
import { useEffect, useRef, useState } from 'react';
import { Follower } from '../follower';
import type { ProgramMessage } from '../engine';
import { call, listen } from '../tauri';
import { YtPlayer, YT_STATE } from '../youtube';
import './output.css';

type Slot = 0 | 1;

export function Output({ subscribe }: { subscribe?: (handler: (m: ProgramMessage) => void) => (() => void) | Promise<() => void> } = {}) {
  const hosts = useRef<(HTMLDivElement | null)[]>([null, null]);
  const players = useRef<(YtPlayer | null)[]>([null, null]);
  const followers = useRef<(Follower | null)[]>([null, null]);
  const videoIn = useRef<(string | null)[]>([null, null]);
  const active = useRef<Slot>(0);
  const [shown, setShown] = useState<Slot | null>(null);
  const [title, setTitle] = useState<{ text: string; channel: string; until: number } | null>(null);
  const [idle, setIdle] = useState(true);
  const lastVideo = useRef<string | null>(null);

  useEffect(() => {
    for (const i of [0, 1] as Slot[]) {
      const host = hosts.current[i];
      if (!host || players.current[i]) continue;
      const p = new YtPlayer(host, window.innerWidth, window.innerHeight, {
        onReady: () => p.mute(),
        onState: (s) => { if (s === YT_STATE.PLAYING && i === active.current) setShown(i); },
      });
      players.current[i] = p;
      followers.current[i] = new Follower(p);
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') void call('close_output').catch(() => window.close()); };
    window.addEventListener('keydown', onKey);
    const un = Promise.resolve(subscribe ? subscribe(onProgram) : listen<ProgramMessage>('program', onProgram));
    return () => { window.removeEventListener('keydown', onKey); void un.then((f) => f()); };
  }, []);

  function onProgram(m: ProgramMessage) {
    const a = active.current, b: Slot = a === 0 ? 1 : 0;
    const pa = players.current[a]!;
    if (!m.video) {
      // Rien à l'antenne : on coupe, sans décharger (la platine peut revenir).
      if (!idle) { pa.pause(); followers.current[a]!.stop(); }
      setIdle(true); lastVideo.current = null;
      return;
    }
    setIdle(false);
    if (m.video !== lastVideo.current) {
      // Changement de titre : coupe franche vers l'autre lecteur, préchargé si possible.
      lastVideo.current = m.video;
      // Le lecteur libre s'il tient déjà ce titre (préchargé) ; sinon le lecteur
      // actif s'il est vide ou tient ce titre ; sinon le lecteur libre.
      const target: Slot = videoIn.current[b] === m.video ? b : (videoIn.current[a] == null || videoIn.current[a] === m.video ? a : b);
      if (target !== a) { pa.pause(); followers.current[a]!.stop(); active.current = target; }
      const pt = players.current[target]!;
      if (videoIn.current[target] !== m.video) { pt.load(m.video, m.position); videoIn.current[target] = m.video; }
      else pt.seek(m.position);
      pt.mute();
      const f = followers.current[target]!; f.reset();
      if (m.playing) { pt.play(); f.start(); } else pt.pause();
      setShown(target);
      if (m.showTitle) setTitle({ text: m.title, channel: m.channel, until: Date.now() + 6000 });
    } else {
      const pt = players.current[active.current]!, f = followers.current[active.current]!;
      if (m.playing) { f.report(m.position, m.at); if (pt.state() !== YT_STATE.PLAYING) { pt.play(); f.start(); } }
      else if (pt.state() === YT_STATE.PLAYING) { pt.pause(); f.stop(); pt.seek(m.position); }
    }
    // Préchargement de la platine suivante dans le lecteur libre.
    const free: Slot = active.current === 0 ? 1 : 0;
    const next = m.next?.video;
    if (next && next !== m.video && videoIn.current[free] !== next) {
      const pf = players.current[free]!; pf.mute(); pf.cue(next, m.next!.position); videoIn.current[free] = next;
    }
    if (!next && videoIn.current[free] && free !== active.current && videoIn.current[free] !== m.video) { /* on garde le dernier titre préchargé */ }
    if (shownRef.current !== active.current) setShown(active.current);
  }
  const shownRef = useRef<Slot | null>(null); shownRef.current = shown;

  useEffect(() => {
    if (!title) return;
    const t = setTimeout(() => setTitle(null), Math.max(0, title.until - Date.now()));
    return () => clearTimeout(t);
  }, [title]);

  return (
    <div className={'output' + (idle ? ' is-idle' : '')}>
      {([0, 1] as Slot[]).map((i) => (
        <div key={i} className={'output-player' + (shown === i && !idle ? ' is-shown' : '')} aria-hidden={shown !== i}>
          <div ref={(el) => { hosts.current[i] = el; }} style={{ width: '100%', height: '100%' }} />
        </div>
      ))}
      {idle ? <div className="output-idle"><span className="output-kicker">Lems VJ Player · Sortie</span><b>Rien à l’antenne</b><span>La vidéo apparaît dès qu’une platine part en sortie.</span></div> : null}
      {title && !idle ? <div className="output-title" role="status"><b>{title.text}</b>{title.channel ? <span>{title.channel}</span> : null}</div> : null}
    </div>
  );
}
