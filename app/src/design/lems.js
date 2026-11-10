(function () {
  'use strict';
  var React = window.React;
  var h = React.createElement;
  var useState = React.useState, useRef = React.useRef, useMemo = React.useMemo;
  var DECKS = ['a', 'b', 'c', 'd'];
  function cx() { var out = []; for (var i = 0; i < arguments.length; i++) if (arguments[i]) out.push(arguments[i]); return out.join(' '); }
  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
  function omit(o, keys) { var r = {}; for (var k in o) if (keys.indexOf(k) < 0) r[k] = o[k]; return r; }
  function deckClass(d) { return DECKS.indexOf(d) >= 0 ? 'lm-deck-' + d : null; }
  function up(d) { return String(d || '').toUpperCase(); }
  function useControlled(value, defaultValue, onChange) {
    var st = useState(defaultValue);
    var controlled = value !== undefined;
    var current = controlled ? value : st[0];
    var ref = useRef(current);
    ref.current = current;
    function set(next) {
      if (typeof next === 'function') next = next(ref.current);
      ref.current = next;
      if (!controlled) st[1](next);
      if (onChange) onChange(next);
    }
    return [current, set];
  }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function formatTime(sec, tenths) {
    if (sec == null || isNaN(sec)) return tenths === false ? '--:--' : '--:--.-';
    var neg = sec < 0; sec = Math.abs(sec);
    var m = Math.floor(sec / 60); var s = sec - m * 60;
    var ss = tenths === false ? pad2(Math.floor(s)) : (s < 10 ? '0' : '') + (Math.floor(s * 10) / 10).toFixed(1);
    return (neg ? '-' : '') + pad2(m) + ':' + ss;
  }
  function formatDb(x) { var db = (x - 0.5) * 24; return (db > 0.05 ? '+' : '') + db.toFixed(1) + ' dB'; }
  function hashString(s) { var x = 2166136261; s = String(s || ''); for (var i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 16777619); } return x >>> 0; }
  function rng(seed) { var a = seed || 1; return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function makePeaks(seed, n) {
    n = n || 120; var r = rng(hashString(seed)); var out = []; var breakAt = 0.45 + r() * 0.2;
    for (var i = 0; i < n; i++) { var t = i / (n - 1); var env = Math.min(1, t / 0.12) * Math.min(1, (1 - t) / 0.1); if (Math.abs(t - breakAt) < 0.06) env *= 0.35; var beat = i % 4 === 0 ? 1 : 0.72; out.push(clamp(0.12 + env * beat * (0.55 + r() * 0.45), 0.06, 1)); }
    return out;
  }
  var ICONS = {
    play: { fill: true, d: ['M8 5.5v13a.5.5 0 0 0 .77.42l10.2-6.5a.5.5 0 0 0 0-.84L8.77 5.08A.5.5 0 0 0 8 5.5z'] },
    pause: { fill: true, d: ['M7 5h3.5v14H7z', 'M13.5 5H17v14h-3.5z'] },
    cue: { d: ['M6 4v16', 'M10 7.5l8 4.5-8 4.5z'] },
    sync: { d: ['M20 11a8 8 0 0 0-14.3-4.9', 'M4 13a8 8 0 0 0 14.3 4.9', 'M5 3v4h4', 'M19 21v-4h-4'] },
    headphones: { d: ['M4 16v-4a8 8 0 0 1 16 0v4', 'M4 15h3v6H5.5A1.5 1.5 0 0 1 4 19.5z', 'M20 15h-3v6h1.5a1.5 1.5 0 0 0 1.5-1.5z'] },
    search: { d: ['M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z', 'M16.2 16.2L21 21'] },
    video: { d: ['M3 6.5A1.5 1.5 0 0 1 4.5 5h11A1.5 1.5 0 0 1 17 6.5v11a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 3 17.5z', 'M17 10l4-2.5v9L17 14'] },
    load: { d: ['M12 4v11', 'M7 10l5 5 5-5', 'M5 20h14'] }
  };
  function Icon(props) {
    var def = ICONS[props.name]; if (!def) return null; var size = props.size || 16;
    return h('svg', { className: cx('lm-icon', props.className), viewBox: '0 0 24 24', width: size, height: size, role: props.label ? 'img' : undefined, 'aria-label': props.label, 'aria-hidden': props.label ? undefined : true, fill: def.fill ? 'currentColor' : 'none', stroke: def.fill ? 'none' : 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', focusable: 'false' }, def.d.map(function (d, i) { return h('path', { key: i, d: d }); }));
  }
  Icon.names = Object.keys(ICONS);
  function DeckLetter(props) { var d = props.deck || 'a'; return h('span', { className: cx('lm-letter', deckClass(d), props.size === 'sm' && 'lm-letter-sm', props.outline && 'lm-letter-outline', props.className), role: 'img', 'aria-label': 'Platine ' + up(d) }, up(d)); }
  function Badge(props) {
    var tone = props.tone || 'neutral'; var isDeck = DECKS.indexOf(tone) >= 0;
    var text = props.children != null ? props.children : tone === 'on-air' ? 'On air' : tone === 'cue' ? 'Casque' : null;
    return h('span', { className: cx('lm-badge', 'lm-badge-' + (isDeck ? 'deck' : tone), isDeck && deckClass(tone), props.className) }, tone === 'on-air' ? h('span', { className: 'lm-badge-dot', 'aria-hidden': true }) : null, tone === 'cue' ? h(Icon, { name: 'headphones', size: 12 }) : null, text);
  }
  function Button(props) {
    var variant = props.variant || 'quiet'; var sm = props.size === 'sm'; var rest = omit(props, ['variant', 'size', 'icon', 'className', 'children']);
    return h('button', Object.assign({ type: 'button' }, rest, { className: cx('lm-btn', 'lm-btn-' + variant, sm && 'lm-btn-sm', props.className) }), props.icon ? h(Icon, { name: props.icon, size: sm ? 14 : 16 }) : null, props.children != null ? h('span', null, props.children) : null);
  }
  function TransportButton(props) {
    var kind = props.kind || 'play'; var active = !!props.active;
    var icon = kind === 'play' ? (active ? 'pause' : 'play') : kind;
    var label = kind === 'play' ? (active ? 'Pause' : 'Play') : kind === 'cue' ? 'Cue' : 'Sync';
    var rest = omit(props, ['kind', 'active', 'deck', 'className']);
    return h('button', Object.assign({ type: 'button' }, rest, { className: cx('lm-transport', 'lm-transport-' + kind, active && 'is-active', deckClass(props.deck), props.className), 'aria-pressed': kind === 'sync' ? active : undefined, 'aria-label': props['aria-label'] || (label + (props.deck ? ', platine ' + up(props.deck) : '')) }), h(Icon, { name: icon, size: 16 }), h('span', { className: 'lm-transport-label', 'aria-hidden': true }, label));
  }
  function Waveform(props) {
    var bars = props.bars || 120; var seed = props.seed || 'lems';
    var peaks = useMemo(function () { return props.peaks && props.peaks.length ? props.peaks : makePeaks(seed, bars); }, [props.peaks, seed, bars]);
    var n = peaks.length; var progress = clamp(props.progress || 0, 0, 1);
    var ref = useRef(null); var dragging = useRef(false); var seekable = typeof props.onSeek === 'function';
    function seekFrom(e) { var r = ref.current.getBoundingClientRect(); props.onSeek(clamp((e.clientX - r.left) / r.width, 0, 1)); }
    function onKeyDown(e) { var step = e.shiftKey ? 0.1 : 0.01, next = null; if (e.key === 'ArrowRight') next = progress + step; else if (e.key === 'ArrowLeft') next = progress - step; else if (e.key === 'Home') next = 0; if (next != null) { e.preventDefault(); props.onSeek(clamp(next, 0, 1)); } }
    var W = n * 4;
    var rects = peaks.map(function (p, i) { var hgt = Math.max(2, p * 96); var played = (i + 0.5) / n < progress; return h('rect', { key: i, x: i * 4 + 0.5, y: 50 - hgt / 2, width: 3, height: hgt, className: played ? 'lm-wave-bar is-played' : 'lm-wave-bar' }); });
    return h('div', { ref: ref, className: cx('lm-wave', deckClass(props.deck), seekable && 'is-seekable', props.className), style: { height: props.height || 56 }, role: seekable ? 'slider' : 'img', tabIndex: seekable ? 0 : undefined, 'aria-label': props['aria-label'] || 'Forme d’onde', 'aria-valuemin': seekable ? 0 : undefined, 'aria-valuemax': seekable ? 100 : undefined, 'aria-valuenow': seekable ? Math.round(progress * 100) : undefined, 'aria-valuetext': seekable ? Math.round(progress * 100) + ' %' : undefined,
      onPointerDown: seekable ? function (e) { e.currentTarget.setPointerCapture(e.pointerId); dragging.current = true; seekFrom(e); } : undefined,
      onPointerMove: seekable ? function (e) { if (dragging.current) seekFrom(e); } : undefined,
      onPointerUp: seekable ? function () { dragging.current = false; } : undefined,
      onPointerCancel: seekable ? function () { dragging.current = false; } : undefined,
      onKeyDown: seekable ? onKeyDown : undefined },
      h('svg', { viewBox: '0 0 ' + W + ' 100', preserveAspectRatio: 'none', width: '100%', height: '100%', 'aria-hidden': true }, rects),
      props.cuePoint != null ? h('span', { className: 'lm-wave-cue', style: { left: clamp(props.cuePoint, 0, 1) * 100 + '%' }, 'aria-hidden': true }) : null,
      h('span', { className: 'lm-wave-head', style: { left: progress * 100 + '%' }, 'aria-hidden': true }));
  }
  var EMPTY_PEAKS = new Array(120).fill(0.04);
  function Deck(props) {
    var d = props.deck || 'a';
    var pl = useControlled(props.playing, !!props.defaultPlaying, props.onPlayingChange);
    var sync = useControlled(props.sync, !!props.defaultSync, props.onSyncChange);
    var duration = props.duration || 0; var pos = clamp(props.position || 0, 0, duration || 0);
    var empty = !props.title; var progress = duration ? pos / duration : 0;
    var cueSec = props.cuePoint != null ? props.cuePoint * duration : 0;
    var atCue = !empty && !pl[0] && Math.abs(pos - cueSec) < 0.05;
    var yt = props.source === 'youtube';
    var extra = yt ? (props.keyName || 'YouTube · tempo fixe') : [props.pitch != null ? (props.pitch > 0 ? '+' : '') + Number(props.pitch).toFixed(1) + ' %' : null, props.keyName || null].filter(Boolean).join(' · ');
    return h('section', { className: cx('lm-deckpanel', deckClass(d), pl[0] && 'is-playing', empty && 'is-empty', yt && 'is-youtube', props.className), 'aria-label': 'Platine ' + up(d) },
      h('header', { className: 'lm-deck-head' }, h(DeckLetter, { deck: d }),
        h('div', { className: 'lm-deck-meta' }, h('div', { className: 'lm-deck-title', title: props.title || undefined }, empty ? 'Aucun morceau' : props.title), h('div', { className: 'lm-deck-artist' }, empty ? 'Chargez un résultat de recherche sur cette platine' : (props.artist || ' '))),
        h('div', { className: 'lm-deck-flags' }, props.prelisten ? h(Badge, { tone: 'cue' }) : null, props.onAir ? h(Badge, { tone: 'on-air' }) : null)),
      h(Waveform, { deck: d, seed: props.seed || props.title || d, peaks: empty ? EMPTY_PEAKS : props.peaks, progress: progress, cuePoint: empty ? null : props.cuePoint, height: 64, 'aria-label': 'Position dans le morceau, platine ' + up(d), onSeek: props.onSeek && duration && !empty ? function (p) { props.onSeek(p * duration); } : undefined }),
      h('div', { className: 'lm-deck-readouts' },
        h('div', { className: 'lm-readout' }, h('span', { className: 'lm-readout-label' }, 'Écoulé'), h('span', { className: 'lm-readout-xl' }, formatTime(empty ? null : pos)), h('span', { className: 'lm-readout-sm', 'aria-label': 'Temps restant ' + formatTime(empty ? null : duration - pos) }, formatTime(empty ? null : -(duration - pos)))),
        h('div', { className: 'lm-readout lm-readout-end' }, h('span', { className: 'lm-readout-label' }, 'BPM'), h('span', { className: 'lm-readout-xl' }, props.bpm && !empty ? Number(props.bpm).toFixed(2) : '--.--'), h('span', { className: 'lm-readout-sm' }, extra || ' '))),
      h('div', { className: 'lm-deck-transport' },
        h(TransportButton, { kind: 'cue', deck: d, active: atCue, disabled: empty, onClick: function () { pl[1](false); if (props.onCue) props.onCue(); } }),
        h(TransportButton, { kind: 'play', deck: d, active: pl[0], disabled: empty, onClick: function () { pl[1](!pl[0]); } }),
        h(TransportButton, { kind: 'sync', deck: d, active: sync[0], disabled: empty || yt, title: yt ? 'SYNC indisponible sur une platine YouTube' : undefined, onClick: function () { sync[1](!sync[0]); } })));
  }
  function polar(c, r, deg) { var a = deg * Math.PI / 180; return [c + r * Math.sin(a), c - r * Math.cos(a)]; }
  function arcPath(c, r, a0, a1) { if (Math.abs(a1 - a0) < 0.5) return ''; var s = polar(c, r, a0), e = polar(c, r, a1); var large = Math.abs(a1 - a0) > 180 ? 1 : 0; return 'M' + s[0].toFixed(2) + ' ' + s[1].toFixed(2) + 'A' + r + ' ' + r + ' 0 ' + large + ' 1 ' + e[0].toFixed(2) + ' ' + e[1].toFixed(2); }
  function Knob(props) {
    var min = props.min != null ? props.min : 0; var max = props.max != null ? props.max : 1; var bipolar = !!props.bipolar;
    var def = props.defaultValue != null ? props.defaultValue : (bipolar ? (min + max) / 2 : min);
    var st = useControlled(props.value, def, props.onChange); var v = clamp(st[0], min, max); var size = props.size || 44;
    var ang = -135 + (v - min) / (max - min) * 270; var start = bipolar ? 0 : -135; var drag = useRef(null);
    function onPointerDown(e) { if (props.disabled) return; e.currentTarget.setPointerCapture(e.pointerId); drag.current = { y: e.clientY, v: v }; }
    function onPointerMove(e) { if (!drag.current) return; var dy = drag.current.y - e.clientY; st[1](clamp(drag.current.v + dy / 150 * (max - min), min, max)); }
    function onPointerUp() { drag.current = null; }
    function onKeyDown(e) { if (props.disabled) return; var step = (max - min) / (e.shiftKey ? 10 : 50), next = null; if (e.key === 'ArrowUp' || e.key === 'ArrowRight') next = v + step; else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') next = v - step; else if (e.key === 'Home') next = min; else if (e.key === 'End') next = max; else if (e.key === 'Enter' || e.key === ' ') next = def; if (next != null) { e.preventDefault(); st[1](clamp(next, min, max)); } }
    var p1 = polar(22, 5, ang), p2 = polar(22, 12, ang);
    return h('div', { className: cx('lm-knob', deckClass(props.deck), props.disabled && 'is-disabled', props.className) },
      h('div', { className: 'lm-knob-dial', role: 'slider', tabIndex: props.disabled ? -1 : 0, 'aria-disabled': props.disabled || undefined, 'aria-label': props['aria-label'] || props.label, 'aria-valuemin': min, 'aria-valuemax': max, 'aria-valuenow': Math.round(v * 100) / 100, 'aria-valuetext': props.format ? props.format(v) : undefined, style: { width: size, height: size }, onPointerDown: onPointerDown, onPointerMove: onPointerMove, onPointerUp: onPointerUp, onPointerCancel: onPointerUp, onKeyDown: onKeyDown, onDoubleClick: function () { if (!props.disabled) st[1](def); } },
        h('svg', { viewBox: '0 0 44 44', width: size, height: size, 'aria-hidden': true },
          h('path', { className: 'lm-knob-track', d: arcPath(22, 18, -135, 135) }),
          h('path', { className: 'lm-knob-value', d: arcPath(22, 18, Math.min(start, ang), Math.max(start, ang)) }),
          h('circle', { className: 'lm-knob-cap', cx: 22, cy: 22, r: 13 }),
          h('line', { className: 'lm-knob-pointer', x1: p1[0], y1: p1[1], x2: p2[0], y2: p2[1] }))),
      props.label ? h('span', { className: 'lm-knob-label', 'aria-hidden': true }, props.label) : null);
  }
  function LinearSlider(p) {
    var box = useRef(null); var dragging = useRef(false); var vertical = p.orientation === 'vertical'; var t = (p.value - p.min) / (p.max - p.min);
    function fromEvent(e) { var r = box.current.getBoundingClientRect(); var f = vertical ? 1 - (e.clientY - r.top) / r.height : (e.clientX - r.left) / r.width; return p.min + clamp(f, 0, 1) * (p.max - p.min); }
    function onKeyDown(e) { var step = (p.max - p.min) / (e.shiftKey ? 10 : 50), next = null; if (e.key === 'ArrowUp' || e.key === 'ArrowRight') next = p.value + step; else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') next = p.value - step; else if (e.key === 'Home') next = p.min; else if (e.key === 'End') next = p.max; else if (e.key === 'Enter' || e.key === ' ') next = p.def; if (next != null) { e.preventDefault(); p.set(clamp(next, p.min, p.max)); } }
    return h('div', { className: cx('lm-slider', vertical ? 'is-vertical' : 'is-horizontal', p.className), role: 'slider', tabIndex: 0, 'aria-orientation': vertical ? 'vertical' : 'horizontal', 'aria-label': p.label, 'aria-valuemin': p.min, 'aria-valuemax': p.max, 'aria-valuenow': Math.round(p.value * 100) / 100, 'aria-valuetext': p.valueText,
      onPointerDown: function (e) { e.currentTarget.setPointerCapture(e.pointerId); dragging.current = true; p.set(fromEvent(e)); },
      onPointerMove: function (e) { if (dragging.current) p.set(fromEvent(e)); },
      onPointerUp: function () { dragging.current = false; }, onPointerCancel: function () { dragging.current = false; },
      onKeyDown: onKeyDown, onDoubleClick: function () { p.set(p.def); } },
      h('div', { className: 'lm-slider-box', ref: box }, h('span', { className: 'lm-slider-rail', 'aria-hidden': true }), ticks(p.ticks || 11, vertical), h('span', { className: cx('lm-slider-thumb', p.thumbClass), style: vertical ? { bottom: t * 100 + '%' } : { left: t * 100 + '%' }, 'aria-hidden': true })));
  }
  function ticks(n, vertical) { var out = []; for (var i = 0; i < n; i++) { var at = i / (n - 1) * 100 + '%'; out.push(h('span', { key: i, className: cx('lm-tick', i === (n - 1) / 2 && 'is-center'), style: vertical ? { bottom: at } : { left: at } })); } return h('span', { className: 'lm-ticks', 'aria-hidden': true }, out); }
  function Fader(props) {
    var def = props.defaultValue != null ? props.defaultValue : 0.75; var st = useControlled(props.value, def, props.onChange); var v = clamp(st[0], 0, 1);
    return h('div', { className: cx('lm-fader', deckClass(props.deck), props.className), style: { height: props.height || 160 } }, h(LinearSlider, { orientation: 'vertical', value: v, set: st[1], min: 0, max: 1, def: def, label: props['aria-label'] || props.label || 'Volume', valueText: Math.round(v * 100) + ' %', thumbClass: 'lm-fader-cap', ticks: 11 }));
  }
  function VuMeter(props) {
    var n = props.segments || 16; var level = clamp(props.level || 0, 0, 1); var lit = Math.round(level * n);
    var peakIdx = props.peak != null ? Math.round(clamp(props.peak, 0, 1) * n) - 1 : -1; var hotFrom = Math.round(n * 0.8); var segs = [];
    for (var i = 0; i < n; i++) segs.push(h('span', { key: i, className: cx('lm-vu-seg', i >= hotFrom && 'is-hot', (i < lit || i === peakIdx) && 'is-lit') }));
    return h('div', { className: cx('lm-vu', deckClass(props.deck), props.className), role: 'meter', 'aria-label': props['aria-label'] || 'Niveau', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': Math.round(level * 100), style: { height: props.height || 160 } }, segs);
  }
  var STRIP_DEFAULT = { gain: 0.5, hi: 0.5, mid: 0.5, lo: 0.5, volume: 0.75, prelisten: false };
  function ChannelStrip(props) {
    var d = props.deck || 'a'; var L = up(d);
    var st = useControlled(props.value, Object.assign({}, STRIP_DEFAULT, props.defaultValue), props.onChange);
    var v = Object.assign({}, STRIP_DEFAULT, st[0]);
    var yt = props.source === 'youtube';
    function setField(k) { return function (x) { st[1](function (prev) { var n = Object.assign({}, STRIP_DEFAULT, prev); n[k] = x; return n; }); }; }
    function eq(key, label, full) { return h(Knob, { label: label, 'aria-label': full + ' ' + L, deck: d, bipolar: true, size: 36, disabled: yt, value: v[key], defaultValue: 0.5, onChange: setField(key), format: formatDb }); }
    return h('section', { className: cx('lm-strip', deckClass(d), v.prelisten && 'is-prelisten', yt && 'is-youtube', props.className), 'aria-label': 'Tranche ' + L },
      h(DeckLetter, { deck: d }),
      h(Knob, { label: 'Gain', 'aria-label': 'Gain ' + L, deck: d, bipolar: true, disabled: yt, value: v.gain, defaultValue: 0.5, onChange: setField('gain'), format: formatDb }),
      h('span', { className: 'lm-strip-rule', 'aria-hidden': true }),
      eq('hi', 'Aigus', 'Aigus'), eq('mid', 'Méd.', 'Médiums'), eq('lo', 'Basses', 'Basses'),
      h('button', { type: 'button', className: cx('lm-prelisten', v.prelisten && 'is-active'), 'aria-pressed': v.prelisten, disabled: yt, 'aria-label': 'Pré-écoute au casque, platine ' + L, title: yt ? 'Pré-écoute indisponible sur une platine YouTube' : 'Pré-écoute au casque', onClick: function () { setField('prelisten')(!v.prelisten); } }, h(Icon, { name: 'headphones', size: 16 })),
      h('div', { className: 'lm-strip-fader' }, h(VuMeter, { deck: d, level: props.level, peak: props.peak, height: props.faderHeight || 160, 'aria-label': 'Niveau ' + L }), h(Fader, { deck: d, 'aria-label': 'Volume ' + L, value: v.volume, defaultValue: 0.75, onChange: setField('volume'), height: props.faderHeight || 160 })));
  }
  function Crossfader(props) {
    var def = props.defaultValue != null ? props.defaultValue : 0; var st = useControlled(props.value, def, props.onChange);
    var left = props.left || 'a', right = props.right || 'b'; var v = clamp(st[0], -1, 1);
    var text = Math.abs(v) < 0.02 ? 'Centre' : (v < 0 ? up(left) : up(right)) + ' ' + Math.round(Math.abs(v) * 100) + ' %';
    return h('div', { className: cx('lm-xfader', props.className) }, h(DeckLetter, { deck: left, size: 'sm', outline: v > 0.98 }), h(LinearSlider, { orientation: 'horizontal', value: v, set: st[1], min: -1, max: 1, def: def, label: props['aria-label'] || 'Crossfader ' + up(left) + ' / ' + up(right), valueText: text, thumbClass: 'lm-xfader-cap', ticks: 9 }), h(DeckLetter, { deck: right, size: 'sm', outline: v < -0.98 }));
  }
  function VideoMonitor(props) {
    var program = props.mode === 'program'; var d = props.deck; var live = program && props.live !== false;
    return h('figure', { className: cx('lm-monitor', program ? 'is-program' : 'is-preview', program && !live && 'is-idle', deckClass(d), props.className), 'aria-label': program ? 'Sortie programme' : 'Prévisualisation' + (d ? ' platine ' + up(d) : '') },
      h('figcaption', { className: 'lm-monitor-bar' }, d ? h(DeckLetter, { deck: d, size: 'sm' }) : null, h('span', { className: 'lm-monitor-kind' }, program ? 'Sortie' : 'Prévisualisation'), h('span', { className: 'lm-monitor-title' }, props.title || ''), live ? h(Badge, { tone: 'on-air' }) : null, !program && props.prelisten ? h(Badge, { tone: 'cue' }) : null),
      h('div', { className: 'lm-monitor-screen', style: { aspectRatio: props.aspectRatio || '16 / 9' } }, props.children || h('div', { className: 'lm-monitor-empty' }, h(Icon, { name: 'video', size: 28 }), h('span', null, props.emptyText || (program ? 'Rien à l’antenne' : 'Aucune vidéo chargée')))));
  }
  function TrackSearch(props) {
    var q = useControlled(props.query, props.defaultQuery || '', props.onQueryChange); var decks = props.decks || DECKS; var loaded = props.loaded || {}; var results = props.results || [];
    function submit(e) { e.preventDefault(); if (props.onSearch) props.onSearch(q[0]); }
    var list;
    if (props.loading) list = h('p', { className: 'lm-search-note', role: 'status' }, 'Recherche en cours…');
    else if (!results.length) list = h('p', { className: 'lm-search-note' }, props.emptyText || 'Aucun résultat. Essayez un titre, un artiste, ou collez un lien YouTube.');
    else list = h('ul', { className: 'lm-results' }, results.map(function (r) {
      return h('li', { key: r.id, className: 'lm-result' },
        h('span', { className: 'lm-thumb' }, r.thumbnail ? h('img', { src: r.thumbnail, alt: '' }) : h(Icon, { name: 'play', size: 14 })),
        h('span', { className: 'lm-result-meta' }, h('span', { className: 'lm-result-title', title: r.title }, r.title), h('span', { className: 'lm-result-channel' }, r.channel || '')),
        h('span', { className: 'lm-result-time' }, typeof r.duration === 'number' ? formatTime(r.duration, false) : (r.duration || '')),
        props.onPreview ? h('button', { type: 'button', className: 'lm-iconbtn', title: 'Pré-écouter', 'aria-label': 'Pré-écouter « ' + r.title + ' »', onClick: function () { props.onPreview(r); } }, h(Icon, { name: 'headphones', size: 16 })) : null,
        h('span', { className: 'lm-load', role: 'group', 'aria-label': 'Charger sur une platine' }, decks.map(function (d) { var on = loaded[d] === r.id; return h('button', { key: d, type: 'button', className: cx('lm-loadbtn', deckClass(d), on && 'is-loaded'), 'aria-pressed': on, 'aria-label': 'Charger « ' + r.title + ' » sur la platine ' + up(d), onClick: function () { if (props.onLoad) props.onLoad(r, d); } }, up(d)); })));
    }));
    return h('div', { className: cx('lm-search', props.className) },
      h('form', { className: 'lm-search-bar', role: 'search', onSubmit: submit }, h(Icon, { name: 'search', size: 16, className: 'lm-search-icon' }), h('input', { className: 'lm-search-input', type: 'search', value: q[0], placeholder: props.placeholder || 'Rechercher sur YouTube', 'aria-label': 'Rechercher sur YouTube', onChange: function (e) { q[1](e.target.value); } }), h(Button, { type: 'submit', variant: 'solid', size: 'sm' }, 'Rechercher')),
      list);
  }
  /* ========== Composants d'application (v2) ========== */

  /* ---------- StatusDot ---------- */
  var STATUS_LABEL = { connected: 'Connecté', pending: 'En attente', offline: 'Déconnecté', unstable: 'Connexion instable' };
  function StatusDot(props) {
    var s = props.state || 'connected';
    return h('span', { className: cx('lm-dot', 'lm-dot-' + s, props.className), role: 'img', 'aria-label': props.label || STATUS_LABEL[s] || s });
  }

  /* ---------- AppBar ---------- */
  function AppBar(props) {
    var items = props.items || ['Console', 'Bibliothèque', 'Réglages'];
    var n = props.devices;
    var status = props.status !== undefined ? props.status
      : n == null ? null
      : [h(StatusDot, { key: 'd', state: n > 0 ? 'connected' : 'offline' }),
         h('span', { key: 't' }, n > 0 ? n + (n > 1 ? ' appareils connectés' : ' appareil connecté') : 'Aucun appareil connecté')];
    return h('header', { className: cx('lm-appbar', props.className) },
      h('span', { className: 'lm-appbar-title' }, props.title || 'Lems VJ Player'),
      h('nav', { className: 'lm-appbar-nav', 'aria-label': 'Navigation principale' }, items.map(function (it) {
        var on = it === props.active;
        return h('button', { key: it, type: 'button', className: cx('lm-appbar-item', on && 'is-active'), 'aria-current': on ? 'page' : undefined, onClick: function () { if (props.onNavigate) props.onNavigate(it); } }, it);
      })),
      status ? h('div', { className: 'lm-appbar-status' }, status) : null);
  }

  /* ---------- Select ---------- */
  var selectSeq = 0;
  function Select(props) {
    var options = props.options || [];
    var st = useControlled(props.value, props.defaultValue, props.onChange);
    var openSt = useState(!!props.defaultOpen);
    var open = openSt[0] && !props.disabled;
    var idRef = useRef(null); if (!idRef.current) idRef.current = 'lm-select-' + (++selectSeq);
    var rootRef = useRef(null);
    var current = null;
    for (var i = 0; i < options.length; i++) if (options[i].value === st[0]) current = options[i];
    React.useEffect(function () {
      if (!open || props.defaultOpen) return;
      function away(e) { if (rootRef.current && !rootRef.current.contains(e.target)) openSt[1](false); }
      document.addEventListener('pointerdown', away);
      return function () { document.removeEventListener('pointerdown', away); };
    }, [open]);
    function pick(o) { if (o.disabled) return; st[1](o.value); openSt[1](false); }
    function onKeyDown(e) {
      if (props.disabled) return;
      var enabled = options.filter(function (o) { return !o.disabled; });
      var idx = enabled.indexOf(current);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (!open) { openSt[1](true); return; }
        var next = enabled[(idx + (e.key === 'ArrowDown' ? 1 : enabled.length - 1)) % enabled.length];
        if (next) st[1](next.value);
      } else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openSt[1](!open); }
      else if (e.key === 'Escape') { openSt[1](false); }
    }
    return h('div', { className: cx('lm-select', open && 'is-open', props.disabled && 'is-disabled', props.className), ref: rootRef, style: props.width ? { width: props.width } : undefined },
      h('button', {
        type: 'button', className: 'lm-select-button', disabled: props.disabled,
        'aria-haspopup': 'listbox', 'aria-expanded': open, 'aria-controls': idRef.current, 'aria-label': props['aria-label'] || props.label,
        onClick: function () { openSt[1](!open); }, onKeyDown: onKeyDown
      },
        h('span', { className: cx('lm-select-value', !current && 'is-placeholder') }, current ? current.label : (props.placeholder || 'Choisir…')),
        h('span', { className: 'lm-select-chev', 'aria-hidden': true }, '▾')),
      open ? h('ul', { className: 'lm-select-list', role: 'listbox', id: idRef.current }, options.map(function (o) {
        var sel = current === o;
        return h('li', {
          key: o.value, role: 'option', 'aria-selected': sel, 'aria-disabled': o.disabled || undefined,
          className: cx('lm-select-option', sel && 'is-selected', o.disabled && 'is-disabled'),
          onClick: function () { pick(o); }
        }, h('span', { className: 'lm-select-option-label' }, o.label),
           (o.disabled && o.reason) || o.meta ? h('span', { className: 'lm-select-option-meta' }, o.disabled && o.reason ? o.reason : o.meta) : null);
      })) : null);
  }

  /* ---------- TextField ---------- */
  var fieldSeq = 0;
  function TextField(props) {
    var st = useControlled(props.value, props.defaultValue || '', props.onChange);
    var idRef = useRef(null); if (!idRef.current) idRef.current = 'lm-field-' + (++fieldSeq);
    var errId = idRef.current + '-err';
    return h('div', { className: cx('lm-field', props.error && 'is-error', props.className), style: props.width ? { width: props.width } : undefined },
      props.label ? h('label', { className: 'lm-field-label', htmlFor: idRef.current }, props.label) : null,
      h('div', { className: 'lm-field-box' },
        props.icon ? h(Icon, { name: props.icon, size: 16, className: 'lm-field-icon' }) : null,
        h('input', {
          id: idRef.current, className: 'lm-field-input', type: props.type || 'text', value: st[0], placeholder: props.placeholder,
          disabled: props.disabled, 'aria-invalid': props.error ? true : undefined, 'aria-describedby': props.error ? errId : undefined,
          'aria-label': props.label ? undefined : (props['aria-label'] || props.placeholder),
          onChange: function (e) { st[1](e.target.value); }
        })),
      props.error ? h('span', { className: 'lm-field-error', id: errId }, h('i', { 'aria-hidden': true }, '!'), 'Erreur : ' + props.error) : null);
  }

  /* ---------- CodeInput ---------- */
  function CodeInput(props) {
    var len = props.length || 6;
    var st = useControlled(props.value, props.defaultValue || '', props.onChange);
    var refs = useRef([]);
    var val = String(st[0] || '').replace(/\D/g, '').slice(0, len);
    function set(next) {
      next = next.replace(/\D/g, '').slice(0, len);
      st[1](next);
      if (next.length === len && props.onComplete) props.onComplete(next);
    }
    function focusAt(i) { var el = refs.current[Math.max(0, Math.min(len - 1, i))]; if (el) el.focus(); }
    var cells = [];
    for (var i = 0; i < len; i++) {
      (function (i) {
        cells.push(h('input', {
          key: i, ref: function (el) { refs.current[i] = el; },
          className: cx('lm-code-cell', !val[i] && 'is-empty'), inputMode: 'numeric', autoComplete: 'one-time-code', maxLength: 1,
          value: val[i] || '', 'aria-label': 'Chiffre ' + (i + 1) + ' sur ' + len, disabled: props.disabled,
          onChange: function (e) {
            var d = e.target.value.replace(/\D/g, '');
            if (!d) return;
            var next = (val.slice(0, i) + d + val.slice(i + d.length)).slice(0, len);
            set(next); focusAt(i + d.length);
          },
          onKeyDown: function (e) {
            if (e.key === 'Backspace') { e.preventDefault(); if (val[i]) set(val.slice(0, i) + val.slice(i + 1)); else if (i > 0) { set(val.slice(0, i - 1) + val.slice(i)); focusAt(i - 1); } }
            else if (e.key === 'ArrowLeft') focusAt(i - 1);
            else if (e.key === 'ArrowRight') focusAt(i + 1);
          },
          onPaste: function (e) { e.preventDefault(); var t = (e.clipboardData.getData('text') || '').replace(/\D/g, ''); set(t); focusAt(t.length); }
        }));
      })(i);
    }
    return h('div', { className: cx('lm-code', props.error && 'is-error', props.className) },
      h('div', { className: 'lm-code-cells', role: 'group', 'aria-label': props['aria-label'] || 'Code à ' + len + ' chiffres' }, cells),
      props.error ? h('span', { className: 'lm-field-error' }, h('i', { 'aria-hidden': true }, '!'), 'Erreur : ' + props.error) : null);
  }

  /* ---------- Toggle ---------- */
  function Toggle(props) {
    var st = useControlled(props.checked, !!props.defaultChecked, props.onChange);
    return h('label', { className: cx('lm-toggle', props.disabled && 'is-disabled', props.className) },
      h('button', {
        type: 'button', role: 'switch', 'aria-checked': !!st[0], className: cx('lm-toggle-track', st[0] && 'is-on'),
        disabled: props.disabled, 'aria-label': props.label ? undefined : props['aria-label'],
        onClick: function () { st[1](!st[0]); }
      }, h('span', { className: 'lm-toggle-thumb', 'aria-hidden': true })),
      props.label ? h('span', { className: 'lm-toggle-label' }, props.label, props.hint ? h('span', { className: 'lm-toggle-hint' }, props.hint) : null) : null);
  }

  /* ---------- SegmentedControl ---------- */
  function SegmentedControl(props) {
    var options = props.options || [];
    var st = useControlled(props.value, props.defaultValue, props.onChange);
    var refs = useRef([]);
    function move(from, dir) {
      for (var k = 1; k <= options.length; k++) {
        var j = (from + dir * k + options.length * 2) % options.length;
        if (!options[j].disabled) { st[1](options[j].value); if (refs.current[j]) refs.current[j].focus(); return; }
      }
    }
    var reason = null;
    options.forEach(function (o) { if (o.disabled && o.reason) reason = o.reason; });
    return h('div', { className: cx('lm-seg-wrap', props.className) },
      h('div', { className: 'lm-seg', role: 'radiogroup', 'aria-label': props['aria-label'] || props.label }, options.map(function (o, i) {
        var on = st[0] === o.value;
        return h('button', {
          key: o.value, type: 'button', role: 'radio', 'aria-checked': on, disabled: o.disabled,
          ref: function (el) { refs.current[i] = el; }, tabIndex: on ? 0 : -1,
          className: cx('lm-seg-option', on && 'is-on'), title: o.disabled ? o.reason : undefined,
          onClick: function () { st[1](o.value); },
          onKeyDown: function (e) {
            if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); move(i, 1); }
            else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); move(i, -1); }
          }
        }, o.label);
      })),
      reason && props.showReason !== false ? h('span', { className: 'lm-seg-reason' }, reason) : null);
  }

  /* ---------- Notice ---------- */
  function Notice(props) {
    return h('div', { className: cx('lm-notice', props.className), role: 'note' },
      props.title ? h('strong', { className: 'lm-notice-title' }, props.title) : null,
      h('div', { className: 'lm-notice-body' }, props.children));
  }

  /* ---------- PairingCode ---------- */
  function placeholderQr(seedText) {
    var r = rng(hashString(seedText || 'lems')), cells = [];
    function finder(x, y) {
      var c = [[0, 0], [18, 0], [0, 18]];
      for (var k = 0; k < 3; k++) { var dx = x - c[k][0], dy = y - c[k][1]; if (dx >= 0 && dx < 7 && dy >= 0 && dy < 7) return (dx === 0 || dy === 0 || dx === 6 || dy === 6 || (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4)) ? 1 : 0; }
      return -1;
    }
    for (var y = 0; y < 25; y++) for (var x = 0; x < 25; x++) { var f = finder(x, y); cells.push(h('i', { key: x + '-' + y, className: (f === -1 ? r() > 0.52 : f === 1) ? 'on' : '' })); }
    return h('div', { className: 'lm-qr-grid', role: 'img', 'aria-label': 'QR code d’appairage (illustration)' }, cells);
  }
  function formatRemaining(sec) {
    if (sec == null) return null;
    if (sec <= 0) return 'Code expiré';
    var m = Math.floor(sec / 60), s = Math.floor(sec % 60);
    return 'Valable ' + (m ? m + ' min ' : '') + s + ' s';
  }
  function PairingCode(props) {
    var code = String(props.code || '').replace(/\D/g, '');
    var shown = code.length === 6 ? code.slice(0, 3) + ' ' + code.slice(3) : code;
    var expired = props.expiresIn != null && props.expiresIn <= 0;
    return h('div', { className: cx('lm-pairing', expired && 'is-expired', props.className) },
      h('div', { className: 'lm-qr' }, props.qr || placeholderQr(code)),
      h('div', { className: 'lm-pairing-text' },
        h('span', { className: 'lm-pairing-label' }, 'Ou saisissez ce code'),
        h('span', { className: 'lm-pairing-code', 'aria-label': 'Code ' + code.split('').join(' ') }, shown),
        h('span', { className: 'lm-pairing-meta' }, [formatRemaining(props.expiresIn), props.note || 'un seul appareil'].filter(Boolean).join(' · ')),
        props.onRenew ? h(Button, { size: 'sm', onClick: props.onRenew }, 'Nouveau code') : null));
  }

  /* ---------- Dialog ---------- */
  var dialogSeq = 0;
  function Dialog(props) {
    var idRef = useRef(null); if (!idRef.current) idRef.current = 'lm-dialog-' + (++dialogSeq);
    var boxRef = useRef(null);
    React.useEffect(function () {
      if (!props.open) return;
      var prev = document.activeElement;
      var first = boxRef.current && boxRef.current.querySelector('button, [href], input, select, [tabindex]:not([tabindex="-1"])');
      if (first && !props.contained) first.focus();
      function onKey(e) { if (e.key === 'Escape' && props.onClose) props.onClose(); }
      document.addEventListener('keydown', onKey);
      return function () { document.removeEventListener('keydown', onKey); if (prev && prev.focus && !props.contained) prev.focus(); };
    }, [props.open]);
    if (!props.open) return null;
    return h('div', { className: cx('lm-scrim', props.contained && 'is-contained'), onPointerDown: function (e) { if (e.target === e.currentTarget && props.onClose) props.onClose(); } },
      h('div', { className: cx('lm-dialog', props.className), role: 'dialog', 'aria-modal': true, 'aria-labelledby': idRef.current + '-t', ref: boxRef, style: props.width ? { width: props.width } : undefined },
        h('h2', { className: 'lm-dialog-title', id: idRef.current + '-t' }, props.title),
        props.children ? h('div', { className: 'lm-dialog-body' }, props.children) : null,
        props.actions ? h('div', { className: 'lm-dialog-actions' }, props.actions) : null));
  }

  /* ---------- Table ---------- */
  function Table(props) {
    var cols = props.columns || [];
    var rows = props.rows || [];
    var sort = props.sort || {};
    var keyOf = props.rowKey || function (r, i) { return r.id != null ? r.id : i; };
    return h('table', { className: cx('lm-table', props.className) },
      h('colgroup', null, cols.map(function (c) { return h('col', { key: c.key, style: c.width ? { width: c.width } : undefined }); })),
      h('thead', null, h('tr', null, cols.map(function (c) {
        var sorted = sort.key === c.key;
        var label = c.label + (sorted ? (sort.dir === 'desc' ? ' ▾' : ' ▴') : '');
        return h('th', { key: c.key, className: cx(sorted && 'is-sorted', c.align === 'right' && 'is-right'), 'aria-sort': sorted ? (sort.dir === 'desc' ? 'descending' : 'ascending') : undefined },
          c.sortable && props.onSort ? h('button', { type: 'button', className: 'lm-table-sort', onClick: function () { props.onSort({ key: c.key, dir: sorted && sort.dir === 'asc' ? 'desc' : 'asc' }); } }, label) : label);
      }))),
      h('tbody', null, rows.map(function (r, i) {
        var k = keyOf(r, i);
        return h('tr', { key: k, className: cx(props.selectedKey === k && 'is-selected', props.onRowClick && 'is-clickable'), 'aria-selected': props.onRowClick ? props.selectedKey === k : undefined, onClick: props.onRowClick ? function () { props.onRowClick(r, k); } : undefined },
          cols.map(function (c) {
            var v = c.render ? c.render(r) : r[c.key];
            return h('td', { key: c.key, className: cx(c.mono && 'is-mono', c.align === 'right' && 'is-right') }, v);
          }));
      })));
  }

  /* ---------- DeviceRow ---------- */
  function DeviceRow(props) {
    var roles = props.roles || ['Contrôleur', 'Écran', 'Bibliothèque'];
    return h('div', { className: cx('lm-device', props.className) },
      h('div', { className: 'lm-device-name' },
        h('span', { className: 'lm-device-title' }, props.name),
        h('span', { className: 'lm-device-state' }, h(StatusDot, { state: props.state || 'connected' }), props.detail || STATUS_LABEL[props.state || 'connected'])),
      h(Select, { 'aria-label': 'Rôle de ' + props.name, value: props.role, defaultValue: props.role, onChange: props.onRoleChange, options: roles.map(function (r) { return { value: r, label: r }; }), disabled: props.state === 'offline' }),
      h('div', { className: 'lm-device-actions' }, props.actions));
  }

  var NEW_API = {
    AppBar: AppBar, Select: Select, TextField: TextField, CodeInput: CodeInput, Toggle: Toggle,
    SegmentedControl: SegmentedControl, Notice: Notice, PairingCode: PairingCode, Dialog: Dialog,
    Table: Table, DeviceRow: DeviceRow, StatusDot: StatusDot
  };

  window.LemsMP = Object.assign(window.LemsMP || {}, { Deck: Deck, Waveform: Waveform, TransportButton: TransportButton, ChannelStrip: ChannelStrip, Knob: Knob, Fader: Fader, VuMeter: VuMeter, Crossfader: Crossfader, VideoMonitor: VideoMonitor, TrackSearch: TrackSearch, DeckLetter: DeckLetter, Badge: Badge, Button: Button, Icon: Icon, formatTime: formatTime, makePeaks: makePeaks });
  Object.assign(window.LemsMP, NEW_API);
})();
