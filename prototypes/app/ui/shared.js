// Fonctions communes aux pages d'essai.
// Numéro de version des essais : visible en haut de chaque page et dans chaque rapport.
const ESSAIS_VERSION = 'essais v9';
const TAURI = window.__TAURI__ && window.__TAURI__.core ? window.__TAURI__.core : null;
const IN_APP = !!TAURI;

async function call(cmd, args) {
  if (!TAURI) throw new Error("Cette fonction demande l'application d'essai (pas un simple navigateur).");
  return TAURI.invoke(cmd, args || {});
}

function $(sel) { return document.querySelector(sel); }
function el(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === 'class') e.className = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (v != null) e.setAttribute(k, v);
  }
  for (const k of kids.flat()) if (k != null) e.append(k.nodeType ? k : document.createTextNode(String(k)));
  return e;
}
function fmt(n, d = 1) { return n == null || Number.isNaN(n) ? '—' : Number(n).toFixed(d); }
function median(a) { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
function percentile(a, p) { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; }
function stddev(a) { if (a.length < 2) return null; const m = a.reduce((x, y) => x + y, 0) / a.length; return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / (a.length - 1)); }

// Rapport commun : chaque essai remplit `report`, l'utilisateur le copie.
const report = { essai: document.title, version: ESSAIS_VERSION, date: new Date().toISOString(), environnement: {}, resultats: {} };
async function fillEnvironment() {
  report.environnement = { navigateur: navigator.userAgent, origine: location.origin, ecran: `${screen.width}×${screen.height} @${devicePixelRatio}`, application: IN_APP };
  if (IN_APP) { try { Object.assign(report.environnement, await call('platform_info')); } catch (e) { report.environnement.erreur = String(e); } }
  renderReport();
}
function renderReport() { const p = $('#report'); if (p) p.textContent = JSON.stringify(report, null, 2); }
async function copyReport() {
  const t = JSON.stringify(report, null, 2);
  try { await navigator.clipboard.writeText(t); toast('Rapport copié. Collez-le dans la conversation.'); }
  catch (e) { const ta = el('textarea', { style: 'position:fixed;opacity:0' }); ta.value = t; document.body.append(ta); ta.select(); document.execCommand('copy'); ta.remove(); toast('Rapport copié.'); }
}
function toast(msg) { const t = el('div', { class: 'note', style: 'position:fixed;right:24px;bottom:24px;background:#1a1c21;color:#eef0f3' }, msg); document.body.append(t); setTimeout(() => t.remove(), 3000); }
function reportPanel() {
  return el('section', { class: 'panel' }, el('h2', null, 'Rapport'), el('p', null, 'À copier et à me renvoyer, avec ce que vous avez entendu ou vu.'),
    el('div', { class: 'row' }, el('button', { class: 'solid', onclick: copyReport }, 'Copier le rapport')), el('pre', { id: 'report' }));
}
function appOnlyNotice() {
  return IN_APP ? null : el('div', { class: 'note' }, "Ouvert dans un navigateur : cet essai a besoin de l'application d'essai (Mac, Windows ou Android). Voir le README des essais.");
}
window.addEventListener('DOMContentLoaded', () => {
  const h = document.querySelector('header');
  if (h) h.append(el('span', { class: 'mono', style: 'margin-left:auto;color:var(--ink-muted)' }, ESSAIS_VERSION + (location.origin.startsWith('http://localhost') ? ' · fenêtre B (http://localhost)' : '')));
  fillEnvironment();
});
