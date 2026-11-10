// Doublures pour les tests : un faux lecteur YouTube et une fausse application
// (commandes Rust, événements). Elles prouvent la logique des pages, pas le
// comportement du vrai YouTube ni du vrai Tauri (voir prototypes/README.md).

export const FAKE_YT = `
window.__ytPlayers = [];
window.YT = { PlayerState: { UNSTARTED: -1, ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 }, Player: class {
  constructor(el, o) {
    this.o = o; this.rate = 1; this.state = -1; this.base = 0; this.t0 = 0; this.vol = 100; this.muted = false; this.vid = null;
    const f = document.createElement('iframe'); f.width = o.width; f.height = o.height; f.setAttribute('data-fake-yt', '1'); el.replaceWith(f); this.iframe = f;
    window.__ytPlayers.push(this);
    setTimeout(() => o.events && o.events.onReady && o.events.onReady({ target: this }), 30);
  }
  fire(s) { this.state = s; this.o.events && this.o.events.onStateChange && this.o.events.onStateChange({ data: s, target: this }); }
  getAvailablePlaybackRates() { return [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]; }
  setPlaybackRate(r) { const cur = this.getCurrentTime(); this.rate = Math.floor(r * 20 + 1e-9) / 20; this.base = cur; this.t0 = performance.now(); }
  getPlaybackRate() { return this.rate; }
  playVideo() { if (!this.vid) return; if (this.state !== 1) { this.base = this.getCurrentTime(); this.t0 = performance.now(); setTimeout(() => this.fire(1), 40); } }
  pauseVideo() { if (this.state === 1) { this.base = this.getCurrentTime(); setTimeout(() => this.fire(2), 20); } }
  stopVideo() { this.base = 0; this.vid = null; this.fire(-1); }
  getCurrentTime() { return this.state === 1 ? this.base + (performance.now() - this.t0) / 1000 * this.rate : this.base; }
  seekTo(s) { this.base = s; this.t0 = performance.now(); }
  getPlayerState() { return this.state; } getDuration() { return this.vid ? 372 : 0; }
  setVolume(v) { this.vol = v; } getVolume() { return this.vol; } mute() { this.muted = true; } unMute() { this.muted = false; } isMuted() { return this.muted; }
  getVideoData() { return { video_id: this.vid, title: this.vid ? 'Titre de ' + this.vid : '', author: this.vid ? 'Chaîne de ' + this.vid : '' }; }
  getIframe() { return this.iframe; } setSize(w, h) { this.iframe.width = w; this.iframe.height = h; } destroy() { this.iframe.remove(); }
  cueVideoById(v) { this.vid = v.videoId; this.base = v.startSeconds || 0; this.rate = 1; setTimeout(() => this.fire(5), 30); }
  loadVideoById(v) { this.vid = v.videoId; this.base = v.startSeconds || 0; this.rate = 1; this.t0 = performance.now(); setTimeout(() => this.fire(1), 60); }
} };
// L'API ne se charge jamais depuis Internet dans les tests : on la déclare prête.
window.onYouTubeIframeAPIReady && window.onYouTubeIframeAPIReady();
`;

export const FAKE_TAURI = `
(function () {
  // Le faux dossier de données survit aux rechargements de page : localStorage.
  const store = { get: (k) => localStorage.getItem('fakestore.' + k), set: (k, v) => localStorage.setItem('fakestore.' + k, v) };
  const listeners = {};
  window.__events = [];
  const H = {
    platform_info: () => ({ os: window.__platformOs || 'macos', arch: 'aarch64', app_version: '0.1.0', localhost_port: 14870 }),
    last_crash: () => null,
    store_get: (a) => store.get(a.key),
    store_set: (a) => { store.set(a.key, a.value); return null; },
    audio_devices: () => [{ name: 'Haut-parleurs', is_default: true, max_channels: 2, sample_rates: [48000], buffer_min: 64, buffer_max: 2048, config_unknown: false }, { name: 'Focusrite 2i2', is_default: false, max_channels: 4, sample_rates: [48000], buffer_min: 32, buffer_max: 1024, config_unknown: false }],
    audio_inventory: () => [], audio_start: () => [], audio_stats: () => null, audio_stop: () => null,
    console_start: () => ({ port: 48700, code: '482913', peers: [], advertised: true, advertise_error: null, urls: ['ws://192.168.1.20:48700'] }),
    console_info: () => ({ port: 48700, code: '482913', peers: [{ id: 1, name: 'PC Salle', role: 'screen', addr: '192.168.1.31:51234', connected: true, rtt_ms: 4, offset_ms: -300 }], advertised: true, advertise_error: null, urls: ['ws://192.168.1.20:48700'] }),
    console_new_code: () => '730155',
    console_broadcast: (a) => { (window.__broadcasts = window.__broadcasts || []).push(JSON.parse(a.message)); return null; },
    console_messages: () => { const m = window.__consoleInbox || []; window.__consoleInbox = []; return m; },
    discover: () => [{ name: 'MacBook Pro de Lems', addresses: ['192.168.1.20'], port: 48700, protocol: 1, url: 'ws://192.168.1.20:48700' }],
    device_connect: (a) => { if (a.code !== '482913') throw new Error('Connexion impossible : code incorrect.'); window.__deviceConnect = a; window.__deviceConnected = true; return 'MacBook Pro de Lems'; },
    device_status: () => ({ console: 'MacBook Pro de Lems', rtt_ms: 4, offset_ms: -300, samples: 32, connected: window.__deviceConnected !== false }),
    device_messages: () => { const m = window.__deviceInbox || []; window.__deviceInbox = []; return m; },
    device_send: (a) => { (window.__deviceSent = window.__deviceSent || []).push(JSON.parse(a.message)); return null; },
    now_ms: () => Date.now(),
    list_monitors: () => [{ index: 0, name: 'Écran intégré', width: 2880, height: 1800, x: 0, y: 0, scale: 2, is_primary: true }, { index: 1, name: 'EPSON EB-L200F', width: 1920, height: 1080, x: 1440, y: 0, scale: 1, is_primary: false }],
    open_output: (a) => { window.__outputOpened = a; return { opened_ms: 120, on_requested_monitor: a.index === 1, fullscreen: a.fullscreen }; },
    close_output: () => { window.__outputClosed = true; return null; },
  };
  window.__TAURI__ = {
    core: { invoke: async (cmd, args) => { if (!H[cmd]) throw new Error('commande inconnue ' + cmd); return H[cmd](args || {}); } },
    event: {
      emit: async (name, payload) => { window.__events.push({ name, payload }); (listeners[name] || []).forEach((f) => f({ payload })); },
      listen: async (name, f) => { (listeners[name] = listeners[name] || []).push(f); return () => { listeners[name] = listeners[name].filter((x) => x !== f); }; },
    },
  };
  window.__emit = (name, payload) => window.__TAURI__.event.emit(name, payload);
  window.__pushDevice = (m) => (window.__deviceInbox = window.__deviceInbox || []).push(m);
  window.__pushConsole = (m) => (window.__consoleInbox = window.__consoleInbox || []).push(m);
})();
`;
