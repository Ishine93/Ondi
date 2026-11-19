// Décide où ranger chaque fichier pour que Jellyfin le reconnaisse :
//   films  → <Films>\<nom d'origine>                      (comme tes fichiers actuels)
//   séries → <Séries>\<Nom de la série>\Saison 01\<nom d'origine>
import fs from 'node:fs';
import path from 'node:path';

export const EXT_VIDEO = new Set(['mkv', 'mp4', 'avi', 'm4v', 'ts', 'm2ts', 'mts', 'wmv', 'mov', 'webm', 'mpg', 'mpeg', 'vob', 'flv', 'divx']);
export const EXT_SOUS_TITRES = new Set(['srt', 'ass', 'ssa', 'sub', 'idx', 'vtt', 'sup']);

export const extension = (nom) => path.extname(nom).slice(1).toLowerCase();
export const estVideo = (nom) => EXT_VIDEO.has(extension(nom));
export const estSousTitre = (nom) => EXT_SOUS_TITRES.has(extension(nom));
export const estEchantillon = (chemin) =>
  /(?:^|[\s._\-[(])sample(?:[\s._\-\])]|$)/i.test(path.posix.parse(chemin).name) || /(?:^|\/)samples?\//i.test(chemin);

const SEP = '[\\s._\\-]';
// « The.Boys.S04E01… », « the_boys_4x01… », « The Boys Saison 4 Épisode 1… »
const MOTIFS_EPISODE = [
  new RegExp(`^(.*?)(?:^|${SEP}+)S(\\d{1,2})${SEP}?E(\\d{1,3})(?!\\d)`, 'i'),
  new RegExp(`^(.*?)(?:^|${SEP}+)(\\d{1,2})x(\\d{2,3})(?!\\d)`, 'i'),
  new RegExp(`^(.*?)(?:^|${SEP}+)(?:Saison|Season)${SEP}*(\\d{1,2})${SEP}+(?:[ÉE]pisode|Ep|E)${SEP}*(\\d{1,3})(?!\\d)`, 'i'),
];
// Nom de dossier ou de torrent : « The.Boys.S04.MULTi… », « The Boys - Saison 4 »
const MOTIFS_SAISON = [
  new RegExp(`^(.*?)(?:^|${SEP}+)S(\\d{1,2})(?=${SEP}|[\\])]|$)`, 'i'),
  new RegExp(`^(.*?)(?:^|${SEP}+)(?:Saison|Season)${SEP}*(\\d{1,2})(?!\\d)`, 'i'),
];
// Épisode seul dans le nom du fichier (la série et la saison sont dans le dossier)
const MOTIF_EPISODE_SEUL = new RegExp(`(?:^|${SEP}+)(?:[ÉE]pisode|Ep|E)${SEP}*(\\d{1,3})(?!\\d)`, 'i');
const MOTIF_NUMERO_SEUL = new RegExp(`^(\\d{1,3})(?=${SEP}|$)`);

const ETIQUETTES =
  /(?:^|\s)(?:multi|french|truefrench|vostfr|vff|vfq|vfi|vf2?|vost|subfrench|1080p|720p|2160p|480p|4k|uhd|web|webrip|web-dl|bluray|bdrip|brrip|hdtv|hdrip|dvdrip|x264|x265|h264|h265|hevc|complete|integrale|intégrale)(?=\s|$)/i;

// « The.Boys.MULTi.1080p » → « The Boys » ; « doctor.who.2005 » → « Doctor Who (2005) »
export function nettoyerNom(brut) {
  let n = String(brut || '');
  n = n.replace(/^(?:www\.)?[a-z0-9-]+\.(?:com|net|org|ws|cc|to|io|fr|tv|se|me|co|xyz|site|vip|nl|lol|biz|info)\s*[-–]\s*/i, '');
  n = n.replace(/^\s*\[[^\]]*\]\s*/, '');
  n = n.replace(/[._]+/g, ' ').replace(/\s+/g, ' ').trim();
  const coupe = n.search(ETIQUETTES);
  if (coupe > 0) n = n.slice(0, coupe);
  let annee = null;
  const a = n.match(/^(.+?)\s*[([]?((?:19|20)\d{2})[)\]]?$/);
  if (a) {
    n = a[1];
    annee = a[2];
  }
  n = n.replace(/[\s\-–:,]+$/, '').trim();
  if (n && !/\p{Lu}/u.test(n)) n = n.replace(/(^|\s)(\p{L})/gu, (_, s, l) => s + l.toUpperCase());
  if (!n) return '';
  return annee ? `${n} (${annee})` : n;
}

// Nom de fichier ou de dossier accepté par Windows.
const RESERVES = /^(con|prn|aux|nul|com\d|lpt\d)$/i;
export function assainir(nom) {
  let n = String(nom)
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '');
  if (!n) n = 'sans-nom';
  if (RESERVES.test(n.split('.')[0])) n = `_${n}`;
  if (n.length > 180) {
    const ext = path.extname(n);
    n = n.slice(0, 180 - ext.length).trim() + ext;
  }
  return n;
}

function serieDuContexte(dossiers, contexte) {
  const candidats = [...dossiers].reverse();
  if (contexte) candidats.push(contexte);
  let saisonOrpheline = null;
  for (const c of candidats) {
    let trouve = false;
    for (const re of MOTIFS_SAISON) {
      const m = c.match(re);
      if (!m) continue;
      trouve = true;
      const serie = nettoyerNom(m[1]);
      if (serie) return { serie, saison: Number(m[2]) };
      saisonOrpheline ??= Number(m[2]); // dossier « Saison 2 » : la série est le dossier parent
      break;
    }
    if (!trouve && saisonOrpheline !== null) {
      const serie = nettoyerNom(c);
      if (serie) return { serie, saison: saisonOrpheline };
    }
  }
  return null;
}

// chemin = chemin dans le torrent, avec des « / ». Renvoie { serie, saison, episode } ou null.
export function analyserEpisode(chemin, contexte = '') {
  const parties = chemin.split('/');
  const base = path.posix.parse(parties.pop()).name;
  for (const re of MOTIFS_EPISODE) {
    const m = base.match(re);
    if (!m) continue;
    const serie = nettoyerNom(m[1]) || serieDuContexte(parties, contexte)?.serie || '';
    return { serie, saison: Number(m[2]), episode: Number(m[3]) };
  }
  const ctx = serieDuContexte(parties, contexte);
  if (ctx) {
    const m = base.match(MOTIF_EPISODE_SEUL) || base.match(MOTIF_NUMERO_SEUL);
    if (m) return { serie: ctx.serie, saison: ctx.saison, episode: Number(m[1]) };
  }
  return null;
}

const cle = (s) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\((?:19|20)\d{2}\)/g, '')
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]/g, '');

const sousDossiers = (racine) => {
  try {
    return fs
      .readdirSync(racine, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch {
    return [];
  }
};

// Réutilise le dossier de la série s'il existe déjà (même avec une autre casse ou des accents).
export function dossierSerie(racine, nom) {
  const existants = sousDossiers(racine);
  const exact = existants.find((d) => d.toLowerCase() === nom.toLowerCase());
  if (exact) return exact;
  const k = cle(nom);
  return existants.find((d) => k && cle(d) === k) || assainir(nom);
}

export function dossierSaison(dossierDeLaSerie, saison) {
  const existant = sousDossiers(dossierDeLaSerie).find((d) => {
    const m = d.match(/^(?:saison|season|s)\s*0*(\d+)$/i);
    return m && Number(m[1]) === saison;
  });
  return existant || `Saison ${String(saison).padStart(2, '0')}`;
}

function suffixeLangue(chemin) {
  const c = chemin.toLowerCase();
  let l = '';
  if (/(?:^|[^a-z])(?:fr|fre|fra|french|francais|français|vf|vff|vfq)(?:[^a-z]|$)/.test(c)) l = '.fr';
  else if (/(?:^|[^a-z])(?:en|eng|english|anglais)(?:[^a-z]|$)/.test(c)) l = '.en';
  if (/forced|forcé/.test(c)) l += '.forced';
  return l;
}

function videoPourSousTitre(st, videos, contexte) {
  if (videos.length === 1) return videos[0];
  const ep = analyserEpisode(st.chemin, contexte);
  if (ep) return videos.find((v) => v.ep && v.ep.saison === ep.saison && v.ep.episode === ep.episode) || null;
  const b = path.posix.parse(st.nom).name.toLowerCase();
  return videos.find((v) => b.startsWith(path.posix.parse(v.nom).name.toLowerCase())) || null;
}

// fichiers : [{ chemin, nom, taille, lien, url? }]   mode : 'auto' | 'film' | 'serie' | 'manga'
// contexte : nom du torrent (aide quand les fichiers s'appellent juste « E01.mkv »)
export function planifier(fichiers, { mode = 'auto', contexte = '', dossiers }) {
  let videos = fichiers.filter((f) => estVideo(f.nom));
  const sansEchantillons = videos.filter((f) => !estEchantillon(f.chemin));
  if (sansEchantillons.length) videos = sansEchantillons;

  const plan = [];
  for (const f of videos) {
    const ep = analyserEpisode(f.chemin, contexte);
    const enSerie = mode === 'serie' || mode === 'manga' || (mode === 'auto' && ep);
    const racineSeries = mode === 'manga' && dossiers.mangas ? dossiers.mangas : dossiers.series;
    let dest;
    if (enSerie) {
      const nomSerie =
        ep?.serie || serieDuContexte(f.chemin.split('/').slice(0, -1), contexte)?.serie || nettoyerNom(contexte) || 'Divers';
      const base = path.join(racineSeries, dossierSerie(racineSeries, nomSerie));
      const dossier = ep?.saison ? path.join(base, dossierSaison(base, ep.saison)) : base;
      dest = path.join(dossier, assainir(f.nom));
    } else {
      dest = path.join(dossiers.films, assainir(f.nom));
    }
    plan.push({ ...f, dest, categorie: enSerie ? 'serie' : 'film', ep });
  }

  // Sous-titres externes : renommés « <nom de la vidéo>.fr.srt » à côté de la vidéo.
  const planVideos = [...plan];
  for (const st of fichiers.filter((f) => estSousTitre(f.nom))) {
    const v = videoPourSousTitre(st, planVideos, contexte);
    if (!v) continue;
    const nom = `${path.parse(v.dest).name}${suffixeLangue(st.chemin)}.${extension(st.nom)}`;
    plan.push({ ...st, dest: path.join(path.dirname(v.dest), nom), categorie: v.categorie, sousTitre: true });
  }
  return plan;
}
