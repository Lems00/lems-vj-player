// Vérifications automatiques des vues de l'application, avec doublures
// (faux YouTube, fausse application). Lancer : npm run build && npm test
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
// Playwright est installé globalement sur les machines de test : on le charge par require.
const { chromium } = createRequire(import.meta.url)('playwright');
import { FAKE_TAURI, FAKE_YT } from './fakes.mjs';

const DIST = resolve(fileURLToPath(new URL('.', import.meta.url)), '..', 'dist');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };

const server = createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let file = join(DIST, path === '/' ? 'index.html' : path);
    if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
    res.end(await readFile(file));
  } catch { res.writeHead(404); res.end('introuvable'); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;

let failed = 0;
const ok = (c, m) => { console.log((c ? '✓ ' : '✗ ') + m); if (!c) { failed++; process.exitCode = 1; } };
const browser = await chromium.launch();

async function open(page, { app = true, yt = true } = {}) {
  const p = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  p.errs = [];
  p.on('pageerror', (e) => p.errs.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error' && !/ERR_|favicon/.test(m.text())) p.errs.push(m.text()); });
  await p.route('**/iframe_api', (r) => r.abort());
  await p.route('**/oembed**', (r) => { const id = new URL(new URL(r.request().url()).searchParams.get('url')).searchParams.get('v'); r.fulfill({ contentType: 'application/json', body: JSON.stringify({ title: 'Lagune (Extended Mix)', author_name: 'Abidjan Sound System', thumbnail_url: 'https://i.ytimg.com/vi/' + id + '/default.jpg' }) }); });
  await p.route('**/youtube/v3/search**', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ items: [{ id: { videoId: 'eRsGyueVLvQ' }, snippet: { title: 'Harmattan Nights', channelTitle: 'Kofi Mensah', thumbnails: {} } }, { id: { videoId: 'R6MlUcmOul8' }, snippet: { title: 'Sahel Express', channelTitle: 'Radio Dunes', thumbnails: {} } }] }) }));
  await p.route('**/youtube/v3/videos**', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ items: [{ id: 'eRsGyueVLvQ', contentDetails: { duration: 'PT6M45S' } }, { id: 'R6MlUcmOul8', contentDetails: { duration: 'PT30M34S' } }] }) }));
  if (app) await p.addInitScript(FAKE_TAURI);
  if (yt) await p.addInitScript(FAKE_YT);
  await p.goto(BASE + page);
  await p.waitForTimeout(300);
  return p;
}
async function waitResults(p) {
  await p.waitForSelector('.lm-result, .error, .lm-search-note:not([role=status])', { timeout: 8000 });
  const err = await p.locator('.error').count() ? await p.locator('.error').textContent() : null;
  if (err) console.log('   (la page affiche : ' + err + ')');
}
const rect = (p, sel) => p.evaluate((s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }; }, sel);
const overlaps = (a, b) => a && b && Math.abs(a.x - b.x) <= 1 && Math.abs(a.y - b.y) <= 1 && Math.abs(a.w - b.w) <= 1 && Math.abs(a.h - b.h) <= 1;

// ---- Console ----
let p = await open('/index.html');
ok(await p.locator('.lm-appbar-title').textContent() === 'Lems VJ Player', 'Console : barre d’application');
ok((await p.locator('.lm-deckpanel').count()) === 4, 'Console : quatre platines');
ok((await p.locator('.lm-deckpanel.is-empty').count()) === 4, 'Console : les quatre platines sont vides au départ');
ok((await p.locator('.lm-strip.is-youtube').count()) === 4, 'Console : tranches en mode YouTube (gain, égaliseur, casque grisés)');
ok((await p.locator('.stage-player.is-parked').count()) === 4, 'Console : lecteurs garés tant que rien n’est chargé');
ok((await p.locator('[data-fake-yt]').count()) === 4, 'Console : quatre lecteurs YouTube créés une seule fois');
await p.fill('.lm-search-input', 'https://www.youtube.com/watch?v=aqz-KE-bpKQ');
await p.click('.lm-search-bar button[type=submit]');
await waitResults(p);
ok((await p.locator('.lm-result-title').first().textContent()) === 'Lagune (Extended Mix)', 'Console : un lien collé donne la vidéo, sans clé ni quota');
await p.click('.lm-result .lm-loadbtn.lm-deck-a');
await p.waitForTimeout(400);
// Le lecteur, une fois la vidéo prête, donne le titre qui fait foi (la doublure répond « Titre de <id> »).
const titleA = await p.locator('.lm-deckpanel.lm-deck-a .lm-deck-title').textContent();
ok(!(await p.locator('.lm-deckpanel.lm-deck-a').evaluate((e) => e.classList.contains('is-empty'))) && /Lagune|aqz-KE-bpKQ/.test(titleA), 'Console : chargement sur la platine A (' + titleA + ')');
ok(overlaps(await rect(p, '[data-stage=a]'), await rect(p, '[data-slot=left]')), 'Console : le lecteur A est posé sur la prévisualisation de gauche');
ok((await p.locator('.lm-monitor.is-program.is-idle').count()) === 1, 'Console : sortie au repos tant que rien ne joue');
await p.click('.lm-deckpanel.lm-deck-a .lm-transport-play, .lm-deckpanel.lm-deck-a button[aria-label*="Lecture"], .lm-deckpanel.lm-deck-a .lm-transport button:nth-child(2)');
await p.waitForTimeout(700);
let vol = await p.evaluate(() => window.__ytPlayers[0].vol);
ok(vol === Math.round(0.75 * 1 * 0.85 * 100), 'Console : volume YouTube = volume × crossfader × master (' + vol + ' %)');
ok((await p.locator('.lm-monitor.is-program .lm-badge').count()) >= 1, 'Console : ON AIR sur la sortie quand A joue');
ok(overlaps(await rect(p, '[data-stage=a]'), await rect(p, '[data-slot=program]')), 'Console : le lecteur A passe dans le moniteur de sortie');
ok((await p.locator('.lm-appbar-status .lm-letter').count()) === 1, 'Console : la barre indique la platine en sortie');
let ev = await p.evaluate(() => window.__events.filter((e) => e.name === 'program').pop());
ok(ev && ev.payload.deck === 'a' && ev.payload.video === 'aqz-KE-bpKQ' && ev.payload.playing, 'Console : la sortie reçoit la platine à l’antenne (' + JSON.stringify(ev && ev.payload.deck) + ')');
// crossfader à droite : A se tait
await p.evaluate(() => { const s = document.querySelector('.lm-xfader .lm-slider'); s.focus(); });
await p.keyboard.press('End');
await p.waitForTimeout(500);
vol = await p.evaluate(() => window.__ytPlayers[0].vol);
ok(vol === 0 && (await p.locator('.lm-monitor.is-program.is-idle').count()) === 1, 'Console : crossfader tout à droite → A muette, rien à l’antenne');
await p.keyboard.press('Home');
await p.waitForTimeout(300);
// deuxième platine par recherche (clé posée dans le store)
await p.evaluate(() => { localStorage.setItem('fakestore.settings', JSON.stringify({ youtubeApiKey: 'AIzaTEST' })); });
await p.reload(); await p.waitForTimeout(400);
await p.fill('.lm-search-input', 'afro house'); await p.click('.lm-search-bar button[type=submit]'); await waitResults(p);
ok((await p.locator('.lm-result').count()) === 2 && (await p.locator('.lm-result-time').first().textContent()) === '06:45', 'Console : recherche par mots-clés avec clé, durées lues');
await p.click('.lm-result:nth-child(1) .lm-loadbtn.lm-deck-b');
await p.waitForTimeout(400);
ok(overlaps(await rect(p, '[data-stage=b]'), await rect(p, '[data-slot=right]')), 'Console : B chargée s’affiche dans la prévisualisation de droite');
const lib = JSON.parse(await p.evaluate(() => localStorage.getItem('fakestore.library') || '{}'));
ok(lib.tracks && lib.tracks.some((t) => t.id === 'eRsGyueVLvQ') && lib.quota.searches === 1, 'Console : historique et quota enregistrés (' + (lib.quota && lib.quota.searches) + ' recherche)');
// clavier : 2 lance B, Maj+2 la ramène au repère, flèches = crossfader, T = tap
await p.click('body', { position: { x: 5, y: 600 } });
await p.keyboard.press('Digit2'); await p.waitForTimeout(300);
ok(await p.locator('.lm-deckpanel.lm-deck-b').evaluate((e) => e.classList.contains('is-playing')), 'Clavier : « 2 » lance la platine B');
await p.keyboard.press('Shift+Digit2'); await p.waitForTimeout(200);
ok(!(await p.locator('.lm-deckpanel.lm-deck-b').evaluate((e) => e.classList.contains('is-playing'))), 'Clavier : « Maj+2 » ramène B au repère et l’arrête');
const xf0 = await p.locator('.lm-xfader .lm-slider').first().getAttribute('aria-valuenow');
await p.keyboard.press('ArrowRight'); await p.waitForTimeout(100);
ok(Number(await p.locator('.lm-xfader .lm-slider').first().getAttribute('aria-valuenow')) > Number(xf0), 'Clavier : « → » pousse le crossfader A/B vers B');
// toucher la platine A (à l'antenne) la met au clavier ; toucher C la met en prévisualisation gauche
await p.locator('.lm-deckpanel.lm-deck-a .lm-deck-title').click(); await p.waitForTimeout(100);
ok((await p.locator('.deck-block:has(.lm-deck-a) .deck-focus').count()) === 1, 'Console : toucher une platine la met au clavier');
// erreur YouTube affichée sous la platine (vidéo refusée par son auteur)
await p.evaluate(() => { const pl = window.__ytPlayers[1]; pl.o.events.onError({ data: 150 }); }); await p.waitForTimeout(150);
ok((await p.locator('.deck-block:has(.lm-deck-b) .deck-error').textContent()).includes('refusée'), 'Console : une erreur YouTube s’affiche sous la platine');
await p.keyboard.press('Digit2'); await p.waitForTimeout(300);
for (let i = 0; i < 5; i++) { await p.keyboard.press('KeyT'); await p.waitForTimeout(500); }
const bpmB = await p.locator('.lm-deckpanel.lm-deck-b .lm-readout-end .lm-readout-xl').textContent();
ok(Math.abs(Number(bpmB) - 120) < 6, 'BPM au tap : 5 frappes à 500 ms → ' + bpmB + ' BPM sur la platine active');
ok(p.errs.length === 0, 'Console : aucune erreur' + (p.errs.length ? ' — ' + p.errs.join(' | ') : ''));

// ---- Bibliothèque ----
await p.click('.lm-appbar-item:has-text("Bibliothèque")');
await p.waitForTimeout(300);
ok((await p.locator('.lm-table tbody tr').count()) === 2, 'Bibliothèque : les deux morceaux chargés sont dans « Tous les morceaux »');
ok((await p.locator('.tray-tile').count()) === 1 && !(await p.locator('[data-stage=b]').evaluate((e) => e.classList.contains('is-parked'))), 'Bibliothèque : la platine chargée reste visible dans le bac');
await p.click('.lm-table .iconbtn[title="Favori"]');
await p.click('.nav-item:has-text("Favoris")');
ok((await p.locator('.lm-table tbody tr').count()) === 1, 'Bibliothèque : favori ajouté et filtré');
await p.fill('.side input[placeholder="Nouvelle playlist"]', 'Soirée Abidjan'); await p.click('.side button:has-text("Créer")');
ok((await p.locator('.nav-item.is-active').textContent()).includes('Soirée Abidjan'), 'Bibliothèque : playlist créée et ouverte');
ok(p.errs.length === 0, 'Bibliothèque : aucune erreur' + (p.errs.length ? ' — ' + p.errs.join(' | ') : ''));

// ---- Réglages ----
await p.click('.lm-appbar-item:has-text("Réglages")');
await p.waitForTimeout(300);
ok((await p.locator('.setting').count()) >= 8, 'Réglages : son et vidéo affichés');
await p.click('.setting:has-text("Écran de sortie") .lm-select-button'); await p.click('.lm-select-option:has-text("EPSON")');
await p.click('button:has-text("Ouvrir la sortie")'); await p.waitForTimeout(200);
const opened = await p.evaluate(() => window.__outputOpened);
ok(opened && opened.index === 1 && opened.fullscreen === true, 'Réglages : la sortie s’ouvre sur l’écran choisi, en plein écran');
await p.click('.setting:has-text("Courbe du crossfader") .lm-seg-option:has-text("Coupe nette")');
await p.waitForTimeout(500);
const saved = JSON.parse(await p.evaluate(() => localStorage.getItem('fakestore.settings')));
ok(saved.outputMonitor === 1 && saved.crossfaderCurve === 'cut', 'Réglages : enregistrés dans le dossier de l’application (écran 1, coupe nette)');
await p.click('.nav-item:has-text("YouTube")'); ok((await p.locator('.quota i.is-on').count()) === 0, 'Réglages : quota du jour affiché (1 recherche → barre quasi vide)');
await p.click('.nav-item:has-text("Appareils")'); await p.waitForTimeout(1300);
ok((await p.locator('.lm-pairing-code').textContent()).replace(/\s/g, '') === '482913' && (await p.locator('.lm-device').count()) === 1, 'Réglages : code d’appairage et appareil connecté');
ok(p.errs.length === 0, 'Réglages : aucune erreur' + (p.errs.length ? ' — ' + p.errs.join(' | ') : ''));

// ---- Hors application (simple navigateur) ----
p = await open('/index.html', { app: false });
ok((await p.locator('.lm-deckpanel').count()) === 4 && p.errs.length === 0, 'Navigateur seul : la console s’affiche sans l’application');

// ---- Sortie ----
p = await open('/output.html');
ok((await p.locator('.output-idle').count()) === 1 && (await p.locator('[data-fake-yt]').count()) === 2, 'Sortie : au repos, deux lecteurs prêts et muets');
const t0 = Date.now();
await p.evaluate((at) => window.__emit('program', { deck: 'a', video: 'aqz-KE-bpKQ', title: 'Lagune', channel: 'Abidjan', position: 30, at, playing: true, showTitle: true, next: { video: 'eRsGyueVLvQ', position: 0 } }), t0);
await p.waitForTimeout(400);
ok((await p.locator('.output-player.is-shown').count()) === 1 && await p.evaluate(() => window.__ytPlayers.every((x) => x.muted)), 'Sortie : le lecteur actif s’affiche, les deux restent muets');
ok(await p.evaluate(() => window.__ytPlayers[1].vid === 'eRsGyueVLvQ' && window.__ytPlayers[1].state === 5), 'Sortie : la platine suivante est préchargée dans le lecteur libre');
ok((await p.locator('.output-title b').textContent()) === 'Lagune', 'Sortie : titre affiché au changement');
// la console avance ; la sortie suit sa position réelle (−80 ms de retard simulé)
for (let i = 0; i < 12; i++) { await p.waitForTimeout(250); await p.evaluate((o) => window.__emit('program', { ...o, position: 30 + (Date.now() - o.t0) / 1000 - 0.08, at: Date.now() }), { deck: 'a', video: 'aqz-KE-bpKQ', title: 'Lagune', channel: '', playing: true, showTitle: false, next: null, t0 }); }
const drift = await p.evaluate((o) => Math.round((window.__ytPlayers[0].getCurrentTime() - (30 + (Date.now() - o) / 1000 - 0.08)) * 1000), t0);
ok(Math.abs(drift) < 60, 'Sortie : écart avec la console ' + drift + ' ms après 3 s de suivi');
await p.evaluate(() => window.__emit('program', { deck: 'b', video: 'eRsGyueVLvQ', title: 'Harmattan', channel: '', position: 0, at: Date.now(), playing: true, showTitle: false, next: { video: 'aqz-KE-bpKQ', position: 33 } }));
await p.waitForTimeout(300);
ok(await p.evaluate(() => window.__ytPlayers[1].state === 1 && window.__ytPlayers[0].state !== 1), 'Sortie : coupe franche vers le lecteur préchargé, l’autre s’arrête');
await p.evaluate(() => window.__emit('program', { deck: null, video: null, title: '', channel: '', position: 0, at: Date.now(), playing: false, showTitle: false, next: null }));
await p.waitForTimeout(200);
ok((await p.locator('.output-idle').count()) === 1, 'Sortie : retour au repos quand rien n’est à l’antenne');
await p.keyboard.press('Escape'); await p.waitForTimeout(100);
ok(await p.evaluate(() => window.__outputClosed === true), 'Sortie : Échap ferme la fenêtre');
ok(p.errs.length === 0, 'Sortie : aucune erreur' + (p.errs.length ? ' — ' + p.errs.join(' | ') : ''));

await browser.close();
server.close();
console.log(failed ? `\n${failed} vérification(s) en échec` : '\nToutes les vérifications passent');
