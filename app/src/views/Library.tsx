// Vue 2 — la bibliothèque : morceaux déjà chargés, favoris, playlists, recherche.
import { useMemo, useState } from 'react';
import { DECKS, L, type SearchResult } from '../design';
import { engine, useEngine } from '../engine';
import { Tray } from '../Stage';
import { resolveQuery, SEARCHES_PER_DAY, today } from '../search';
import type { Library as LibraryData, Playlist, Settings, Track } from '../store';

type Source = 'search' | 'all' | 'favorites' | `playlist:${string}`;

export interface LibraryProps { settings: Settings; library: LibraryData; onLibraryChange: (patch: (lib: LibraryData) => LibraryData) => void }

export function Library({ settings, library, onLibraryChange }: LibraryProps) {
  const st = useEngine();
  const [source, setSource] = useState<Source>(library.tracks.length ? 'all' : 'search');
  const [filter, setFilter] = useState('');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newPlaylist, setNewPlaylist] = useState('');
  const loadedDecks = DECKS.filter((d) => st.decks[d].track);
  const quota = library.quota.day === today() ? library.quota.searches : 0;

  const rows = useMemo(() => {
    let list: Track[] = library.tracks;
    if (source === 'favorites') list = list.filter((t) => library.favorites.includes(t.id));
    if (source.startsWith('playlist:')) {
      const pl = library.playlists.find((p) => 'playlist:' + p.id === source);
      list = pl ? pl.trackIds.map((id) => library.tracks.find((t) => t.id === id)).filter((t): t is Track => !!t) : [];
    }
    const f = filter.trim().toLowerCase();
    if (f) list = list.filter((t) => (t.title + ' ' + t.channel + ' ' + (t.bpm ?? '')).toLowerCase().includes(f));
    return [...list].sort((x, y) => y.addedAt - x.addedAt);
  }, [library, source, filter]);

  async function search(q: string) {
    if (!q.trim()) return;
    setLoading(true); setError(null);
    try {
      const r = await resolveQuery(q, settings.youtubeApiKey);
      setResults(r.results);
      if (r.countedSearch) onLibraryChange((lib) => ({ ...lib, quota: lib.quota.day === today() ? { day: today(), searches: lib.quota.searches + 1 } : { day: today(), searches: 1 } }));
    } catch (e) { setError((e as Error).message); setResults([]); }
    finally { setLoading(false); }
  }
  function toTrack(r: SearchResult): Track {
    const known = library.tracks.find((t) => t.id === r.id);
    return { id: r.id, title: r.title, channel: r.channel ?? '', duration: typeof r.duration === 'number' ? r.duration : known?.duration, thumbnail: r.thumbnail ?? known?.thumbnail, bpm: known?.bpm, addedAt: known?.addedAt ?? Date.now() };
  }
  function remember(t: Track) {
    onLibraryChange((lib) => lib.tracks.some((x) => x.id === t.id) ? lib : { ...lib, tracks: [...lib.tracks, t] });
  }
  function toggleFavorite(id: string) {
    onLibraryChange((lib) => ({ ...lib, favorites: lib.favorites.includes(id) ? lib.favorites.filter((x) => x !== id) : [...lib.favorites, id] }));
  }
  function addToPlaylist(playlistId: string, id: string) {
    onLibraryChange((lib) => ({ ...lib, playlists: lib.playlists.map((p) => p.id === playlistId && !p.trackIds.includes(id) ? { ...p, trackIds: [...p.trackIds, id] } : p) }));
  }
  function removeFromPlaylist(playlistId: string, id: string) {
    onLibraryChange((lib) => ({ ...lib, playlists: lib.playlists.map((p) => p.id === playlistId ? { ...p, trackIds: p.trackIds.filter((x) => x !== id) } : p) }));
  }
  function createPlaylist() {
    const name = newPlaylist.trim(); if (!name) return;
    const pl: Playlist = { id: 'pl' + Date.now().toString(36), name, trackIds: [] };
    onLibraryChange((lib) => ({ ...lib, playlists: [...lib.playlists, pl] }));
    setNewPlaylist(''); setSource(('playlist:' + pl.id) as Source);
  }
  function deletePlaylist(id: string) {
    onLibraryChange((lib) => ({ ...lib, playlists: lib.playlists.filter((p) => p.id !== id) }));
    if (source === 'playlist:' + id) setSource('all');
  }
  function forget(id: string) {
    onLibraryChange((lib) => ({ ...lib, tracks: lib.tracks.filter((t) => t.id !== id), favorites: lib.favorites.filter((x) => x !== id), playlists: lib.playlists.map((p) => ({ ...p, trackIds: p.trackIds.filter((x) => x !== id) })) }));
  }
  const currentPlaylist = source.startsWith('playlist:') ? library.playlists.find((p) => 'playlist:' + p.id === source) : null;

  const loadBtns = (t: Track) => (
    <span className="load-group" role="group" aria-label="Charger sur une platine">
      {DECKS.map((d) => <button key={d} type="button" className={'lm-loadbtn lm-deck-' + d + (st.decks[d].track?.id === t.id ? ' is-loaded' : '')} aria-pressed={st.decks[d].track?.id === t.id} aria-label={`Charger « ${t.title} » sur la platine ${d.toUpperCase()}`} onClick={() => { remember(t); engine.load(d, t); }}>{d.toUpperCase()}</button>)}
    </span>
  );

  const columns = [
    { key: 'title', label: 'Titre', render: (r: Record<string, unknown>) => { const t = r as unknown as Track; return <span><b style={{ color: 'var(--ink)', fontWeight: 600 }}>{t.title}</b><br /><span className="muted">{t.channel}</span></span>; } },
    { key: 'source', label: 'Source', render: () => <L.Badge tone="neutral">YouTube</L.Badge> },
    { key: 'bpm', label: 'BPM', mono: true, render: (r: Record<string, unknown>) => { const t = r as unknown as Track; return t.bpm ? t.bpm.toFixed(1) : '—'; } },
    { key: 'duration', label: 'Durée', mono: true, render: (r: Record<string, unknown>) => { const t = r as unknown as Track; return t.duration ? L.formatTime(t.duration, false) : '—'; } },
    { key: 'load', label: 'Charger sur', align: 'right' as const, render: (r: Record<string, unknown>) => {
      const t = r as unknown as Track; const fav = library.favorites.includes(t.id);
      return <span className="row" style={{ justifyContent: 'flex-end' }}>
        <button type="button" className={'iconbtn' + (fav ? ' is-on' : '')} aria-pressed={fav} aria-label={fav ? 'Retirer des favoris' : 'Ajouter aux favoris'} title="Favori" onClick={() => toggleFavorite(t.id)}>★</button>
        {currentPlaylist ? <button type="button" className="iconbtn" aria-label="Retirer de la playlist" title="Retirer de la playlist" onClick={() => removeFromPlaylist(currentPlaylist.id, t.id)}>−</button>
          : library.playlists.length ? <L.Select aria-label="Ajouter à une playlist" placeholder="+ playlist" options={library.playlists.map((p) => ({ value: p.id, label: p.name }))} onChange={(v: string) => addToPlaylist(v, t.id)} /> : null}
        {loadBtns(t)}
        <button type="button" className="iconbtn" aria-label="Oublier ce morceau" title="Oublier" onClick={() => forget(t.id)}>×</button>
      </span>;
    } },
  ];

  return (
    <div className="view library">
      <aside className="side">
        <div className="panel">
          <h2>Sources</h2>
          <button type="button" className={'nav-item' + (source === 'search' ? ' is-active' : '')} onClick={() => setSource('search')}>Recherche YouTube</button>
          <button type="button" className={'nav-item' + (source === 'all' ? ' is-active' : '')} onClick={() => setSource('all')}>Tous les morceaux <small>{library.tracks.length}</small></button>
          <button type="button" className={'nav-item' + (source === 'favorites' ? ' is-active' : '')} onClick={() => setSource('favorites')}>Favoris <small>{library.favorites.length}</small></button>
        </div>
        <div className="panel">
          <h2>Playlists</h2>
          {library.playlists.map((p) => (
            <button key={p.id} type="button" className={'nav-item' + (source === 'playlist:' + p.id ? ' is-active' : '')} onClick={() => setSource(('playlist:' + p.id) as Source)}>{p.name} <small>{p.trackIds.length}</small></button>
          ))}
          <form className="row" onSubmit={(e) => { e.preventDefault(); createPlaylist(); }}>
            <L.TextField placeholder="Nouvelle playlist" value={newPlaylist} onChange={setNewPlaylist} aria-label="Nom de la nouvelle playlist" />
            <L.Button type="submit" size="sm" disabled={!newPlaylist.trim()}>Créer</L.Button>
          </form>
          {currentPlaylist ? <L.Button size="sm" variant="ghost" onClick={() => deletePlaylist(currentPlaylist.id)}>Supprimer « {currentPlaylist.name} »</L.Button> : null}
        </div>
        <L.Notice>Recherches YouTube aujourd’hui : {quota} sur {SEARCHES_PER_DAY}. YouTube : pas de forme d’onde ni de BPM automatique — le BPM se saisit au tap, sur la console.</L.Notice>
      </aside>
      <section>
        {source === 'search' ? (
          <div className="main-panel">
            {error ? <p className="error" role="alert">{error}</p> : null}
            <L.TrackSearch query={query} onQueryChange={setQuery} onSearch={search} loading={loading} results={results}
              loaded={Object.fromEntries(loadedDecks.map((d) => [d, st.decks[d].track!.id]))}
              onLoad={(r, d) => { const t = toTrack(r); remember(t); engine.load(d, t); }}
              placeholder={settings.youtubeApiKey ? 'Rechercher sur YouTube, ou coller un lien' : 'Coller un lien YouTube (clé requise pour les mots-clés : Réglages → YouTube)'} />
            {results.length ? <p className="muted" style={{ margin: 'var(--space-2) 0 0' }}>Charger un résultat sur une platine l’ajoute à « Tous les morceaux ».</p> : null}
          </div>
        ) : (
          <>
            <div className="toolbar">
              <L.TextField placeholder="Filtrer : titre, artiste, BPM" value={filter} onChange={setFilter} icon="search" aria-label="Filtrer la bibliothèque" />
              <L.Button onClick={() => setSource('search')}>Chercher sur YouTube</L.Button>
            </div>
            <div className="main-panel">
              {rows.length ? <L.Table columns={columns} rows={rows as unknown as Record<string, unknown>[]} rowKey={(r: Record<string, unknown>) => String(r.id)} />
                : <p className="muted" style={{ margin: 0 }}>{library.tracks.length ? 'Rien ne correspond.' : 'Encore vide : chaque morceau chargé sur une platine apparaîtra ici.'}</p>}
            </div>
          </>
        )}
        <div style={{ marginTop: 'var(--space-4)' }}><Tray decks={loadedDecks} Letter={L.DeckLetter} /></div>
      </section>
    </div>
  );
}
