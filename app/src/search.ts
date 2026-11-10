// Recherche YouTube (Data API v3, clé de l'utilisateur) et lecture d'un lien collé.
// Quota : une recherche coûte 100 unités sur 10 000 par jour, soit 100 recherches.
import type { SearchResult } from './design';
import { parseVideoId } from './youtube';

export const SEARCHES_PER_DAY = 100;
export const today = () => new Date().toISOString().slice(0, 10);

export function isoDurationToSeconds(iso: string): number {
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso);
  if (!m) return 0;
  return (+(m[1] ?? 0)) * 3600 + (+(m[2] ?? 0)) * 60 + (+(m[3] ?? 0));
}

interface SearchItem { id: { videoId: string }; snippet: { title: string; channelTitle: string; thumbnails?: { default?: { url: string } } } }
interface VideoItem { id: string; contentDetails: { duration: string } }

const decode = (s: string) => { const t = document.createElement('textarea'); t.innerHTML = s; return t.value; };

/** Recherche par la Data API ; `fetcher` est remplaçable pour les tests. */
export async function searchYouTube(query: string, apiKey: string, fetcher: typeof fetch = fetch): Promise<SearchResult[]> {
  const u = new URL('https://www.googleapis.com/youtube/v3/search');
  u.search = new URLSearchParams({ part: 'snippet', type: 'video', videoEmbeddable: 'true', maxResults: '15', q: query, key: apiKey }).toString();
  const r = await fetcher(u.toString());
  if (!r.ok) throw new Error(await explainApiError(r));
  const data = (await r.json()) as { items: SearchItem[] };
  const results: SearchResult[] = data.items.filter((i) => i.id?.videoId).map((i) => ({
    id: i.id.videoId, title: decode(i.snippet.title), channel: decode(i.snippet.channelTitle), thumbnail: i.snippet.thumbnails?.default?.url,
  }));
  if (results.length) {
    const v = new URL('https://www.googleapis.com/youtube/v3/videos');
    v.search = new URLSearchParams({ part: 'contentDetails', id: results.map((x) => x.id).join(','), key: apiKey }).toString();
    const rv = await fetcher(v.toString());
    if (rv.ok) {
      const vd = (await rv.json()) as { items: VideoItem[] };
      const dur = new Map(vd.items.map((x) => [x.id, isoDurationToSeconds(x.contentDetails.duration)]));
      results.forEach((x) => { x.duration = dur.get(x.id); });
    }
  }
  return results;
}

async function explainApiError(r: Response): Promise<string> {
  let reason = '';
  try { const j = (await r.json()) as { error?: { errors?: { reason?: string }[]; message?: string } }; reason = j.error?.errors?.[0]?.reason ?? j.error?.message ?? ''; } catch { /* pas de détail */ }
  if (r.status === 403 && /quota/i.test(reason)) return 'Quota YouTube du jour épuisé (100 recherches). Collez un lien YouTube, ou réessayez demain.';
  if (r.status === 400 || r.status === 403) return 'Clé YouTube refusée : vérifiez-la dans Réglages → YouTube.';
  return `Recherche impossible (${r.status}${reason ? ', ' + reason : ''}).`;
}

/** Titre et chaîne d'une vidéo sans clé ni quota (oEmbed). Rend null si YouTube ne répond pas. */
export async function lookupVideo(videoId: string, fetcher: typeof fetch = fetch): Promise<SearchResult | null> {
  try {
    const r = await fetcher(`https://www.youtube.com/oembed?url=${encodeURIComponent('https://www.youtube.com/watch?v=' + videoId)}&format=json`);
    if (!r.ok) return null;
    const j = (await r.json()) as { title?: string; author_name?: string; thumbnail_url?: string };
    return { id: videoId, title: j.title ?? 'Vidéo ' + videoId, channel: j.author_name ?? '', thumbnail: j.thumbnail_url };
  } catch { return null; }
}

/** Une saisie : lien ou identifiant → la vidéo ; sinon une recherche. */
export async function resolveQuery(query: string, apiKey: string, fetcher: typeof fetch = fetch): Promise<{ results: SearchResult[]; countedSearch: boolean }> {
  const id = parseVideoId(query);
  if (id) {
    const found = await lookupVideo(id, fetcher);
    return { results: [found ?? { id, title: 'Vidéo ' + id, channel: 'Titre connu au chargement' }], countedSearch: false };
  }
  if (!apiKey) throw new Error('Pour chercher par mots-clés, ajoutez une clé YouTube dans Réglages → YouTube. Sans clé, collez un lien YouTube.');
  return { results: await searchYouTube(query, apiKey, fetcher), countedSearch: true };
}
