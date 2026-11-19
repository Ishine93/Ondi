// Infos détaillées des films et séries de la bibliothèque, comme Jellyfin, depuis TMDB (clé gratuite à mettre
// dans les Réglages) : résumé en français, casting avec photos, images de fond, logos, titres et résumés de chaque épisode.
import { normaliser } from './titres.mjs';

const TMDB = 'https://api.themoviedb.org/3';
const IMG = 'https://image.tmdb.org/t/p';
const img = (taille, chemin) => (chemin ? `${IMG}/${taille}${chemin}` : '');

export class ErreurMeta extends Error {}

async function lireJson(url, options = {}) {
  const res = await fetch(url, { ...options, signal: AbortSignal.timeout(15_000) });
  if (res.status === 401) throw new ErreurMeta('Clé TMDB refusée : vérifie-la dans les Réglages.');
  if (!res.ok) throw new ErreurMeta(`HTTP ${res.status}`);
  return res.json();
}

// Le « jeton d'accès en lecture » (eyJ…) passe dans l'en-tête ; l'ancienne « clé d'API » dans l'adresse.
function appelTmdb(cle) {
  return (chemin, params = {}) => {
    const u = new URL(`${TMDB}${chemin}`);
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') u.searchParams.set(k, v);
    const options = {};
    if (/^eyJ/.test(cle)) options.headers = { Authorization: `Bearer ${cle}`, Accept: 'application/json' };
    else u.searchParams.set('api_key', cle);
    return lireJson(u, options);
  };
}

export async function verifierCleTmdb(cle) {
  await appelTmdb(cle)('/configuration');
}

// Résultats classés : titre identique (français ou original) et année proche d'abord, puis les plus populaires.
function classer(resultats, titre, annee, champs) {
  const n = normaliser(titre);
  const score = (r) => {
    const titres = champs.titres.map((c) => normaliser(r[c] || ''));
    const a = Number(String(r[champs.date] || '').slice(0, 4)) || 0;
    let s = 0;
    if (titres.includes(n)) s += 10;
    else if (titres.some((t) => t && (t.startsWith(n) || n.startsWith(t)))) s += 4;
    if (annee && a) s += a === annee ? 6 : Math.abs(a - annee) === 1 ? 3 : -4;
    return s + Math.min(3, (r.popularity || 0) / 20);
  };
  return [...resultats].sort((x, y) => score(y) - score(x));
}
const meilleur = (...args) => classer(...args)[0] || null;

const imagesLangue = (langue) => (langue.startsWith('en') ? 'en,null' : 'fr,null,en');
function logoDe(images, langue = 'fr-FR') {
  const logos = images?.logos || [];
  const l = logos.find((x) => x.iso_639_1 === langue.slice(0, 2)) || logos.find((x) => x.iso_639_1 === 'en') || logos.find((x) => !x.iso_639_1);
  return l ? img('w500', l.file_path) : '';
}
function fondDe(d) {
  const fonds = d.images?.backdrops || [];
  // Fond sans texte de préférence (iso_639_1 null), sinon celui de la fiche.
  const f = fonds.find((x) => !x.iso_639_1) || fonds[0];
  return img('w1280', f?.file_path || d.backdrop_path);
}
const casting = (credits) =>
  (credits?.cast || []).slice(0, 15).map((c) => ({ nom: c.name, role: c.character || '', photo: img('w185', c.profile_path) }));

// ---------- TMDB ----------

// « duree » (en minutes, lue dans le fichier) départage les homonymes : un court métrage de 18 min
// n'est pas le film de 1 h 50 du même nom et de la même année.
async function filmTmdb(cle, { titre, annee, duree, langue = 'fr-FR', idTmdb }) {
  const api = appelTmdb(cle);
  const details = (id) => api(`/movie/${id}`, { language: langue, append_to_response: 'credits,images,release_dates', include_image_language: imagesLangue(langue) });
  let d = null;
  if (idTmdb) d = await details(idTmdb);
  else {
    // Avec l'année (toutes dates de sortie : festival, cinéma…) puis sans : un film daté 2025 dans le nom
    // du fichier peut être sorti en 2026.
    const vus = new Map();
    for (const params of [annee ? { year: annee } : null, {}].filter(Boolean)) {
      for (const x of (await api('/search/movie', { query: titre, language: langue, ...params })).results || []) vus.set(x.id, x);
    }
    const classes = classer([...vus.values()], titre, annee, { titres: ['title', 'original_title'], date: 'release_date' });
    const n = normaliser(titre);
    const memeTitre = classes.filter((x) => [x.title, x.original_title].some((t) => normaliser(t || '') === n));
    const candidats = memeTitre.length && duree ? memeTitre.slice(0, 5) : classes.slice(0, 1);
    if (!candidats.length) return null;
    for (const c of candidats) {
      const essai = await details(c.id);
      d ||= essai;
      if (!duree || !essai.runtime || Math.abs(essai.runtime - duree) <= Math.max(12, duree * 0.15)) {
        d = essai;
        break;
      }
    }
  }
  const choix = d;
  let resume = d.overview;
  if (!resume && langue !== 'en-US') resume = (await api(`/movie/${choix.id}`, { language: 'en-US' })).overview || '';
  const fr = d.release_dates?.results?.find((x) => x.iso_3166_1 === (langue.startsWith('en') ? 'US' : 'FR'));
  return {
    source: 'tmdb',
    id: d.id,
    titre: d.title,
    titreOriginal: d.original_title,
    annee: Number(String(d.release_date || '').slice(0, 4)) || annee || null,
    resume,
    slogan: d.tagline || '',
    genres: (d.genres || []).map((g) => g.name),
    duree: d.runtime || null,
    note: d.vote_average ? Math.round(d.vote_average * 10) / 10 : null,
    age: fr?.release_dates?.find((x) => x.certification)?.certification || '',
    affiche: img('w500', d.poster_path),
    fond: fondDe(d),
    logo: logoDe(d.images, langue),
    realisateurs: (d.credits?.crew || []).filter((c) => c.job === 'Director').map((c) => c.name),
    casting: casting(d.credits),
  };
}

async function serieTmdb(cle, { titre, annee, langue = 'fr-FR' }) {
  const api = appelTmdb(cle);
  let r = await api('/search/tv', { query: titre, language: langue, first_air_date_year: annee || undefined });
  if (!r.results?.length && annee) r = await api('/search/tv', { query: titre, language: langue });
  const choix = meilleur(r.results || [], titre, annee, { titres: ['name', 'original_name'], date: 'first_air_date' });
  if (!choix) return null;
  const d = await api(`/tv/${choix.id}`, { language: langue, append_to_response: 'credits,images,content_ratings', include_image_language: imagesLangue(langue) });
  let resume = d.overview;
  if (!resume && langue !== 'en-US') resume = (await api(`/tv/${choix.id}`, { language: 'en-US' })).overview || '';
  return {
    source: 'tmdb',
    id: d.id,
    titre: d.name,
    titreOriginal: d.original_name,
    annee: Number(String(d.first_air_date || '').slice(0, 4)) || annee || null,
    resume,
    slogan: d.tagline || '',
    genres: (d.genres || []).map((g) => g.name),
    duree: d.episode_run_time?.[0] || null,
    note: d.vote_average ? Math.round(d.vote_average * 10) / 10 : null,
    age: d.content_ratings?.results?.find((x) => x.iso_3166_1 === (langue.startsWith('en') ? 'US' : 'FR'))?.rating || '',
    affiche: img('w500', d.poster_path),
    fond: fondDe(d),
    logo: logoDe(d.images, langue),
    realisateurs: (d.created_by || []).map((c) => c.name),
    casting: casting(d.credits),
    saisons: (d.seasons || []).map((s) => ({ numero: s.season_number, nom: s.name, resume: s.overview || '', affiche: img('w342', s.poster_path), nbEpisodes: s.episode_count })),
  };
}

async function saisonTmdb(cle, idSerie, numero, langue = 'fr-FR') {
  const d = await appelTmdb(cle)(`/tv/${idSerie}/season/${numero}`, { language: langue });
  return (d.episodes || []).map((e) => ({
    numero: e.episode_number,
    titre: e.name || '',
    resume: e.overview || '',
    image: img('w400', e.still_path),
    date: e.air_date || '',
    duree: e.runtime || null,
  }));
}

// ---------- point d'entrée ----------

// Sans clé TMDB : pas d'infos (l'API de recherche d'iTunes ne renvoie plus ni films ni séries).
export async function infosFilm(cleTmdb, recherche) {
  return cleTmdb ? filmTmdb(cleTmdb, recherche) : null;
}

export async function infosSerie(cleTmdb, recherche) {
  return cleTmdb ? serieTmdb(cleTmdb, recherche) : null;
}

export async function episodesSaison(cleTmdb, meta, numero, langue = 'fr-FR') {
  return meta?.source === 'tmdb' && cleTmdb ? saisonTmdb(cleTmdb, meta.id, numero, langue) : [];
}
