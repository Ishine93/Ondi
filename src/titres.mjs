// Lecture des titres de résultats : le contenu d'un côté, et ce qui varie d'une fiche à l'autre
// de l'autre (langue, qualité, saison, épisodes), plus les infos de fiche (genres, note, année).
//   « Spider-Man MULTI (TRUEFRENCH) HD-LIGHT 1080p Action, Animation 6.7 /10 2018 »
//   « One Piece S01 VOSTFR (+E1180) Action, Aventure »
// La fin d'un titre est lue à rebours : d'abord les infos de fiche, puis la version, puis le titre.

export const sansAccents = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '');
const propre = (t) => String(t || '').replace(/\s+/g, ' ').trim();

export function normaliser(s) {
  return sansAccents(String(s || '').replace(/œ/gi, 'oe').replace(/æ/gi, 'ae'))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// ---------- vocabulaire ----------

const liste = (famille, mots) => mots.map((m) => [m, famille]);
// Langue → famille : multi (VF + VO), vf (doublé en français), vostfr (sous-titré), vo.
const LANGUES = new Map([
  ...liste('multi', ['multi', 'multi-vf', 'multivf', 'multi-vff', 'multi-vfq', 'multi-vfi', 'multi-truefrench', 'multilang', 'multi-lang']),
  ...liste('vf', ['french', 'truefrench', 'vf', 'vff', 'vfq', 'vfi', 'vf2', 'vof', 'francais']),
  ...liste('vostfr', ['vostfr', 'vost', 'vost-fr', 'vostf', 'subfrench', 'stfr']),
  ...liste('vo', ['vo', 'vosta', 'vosten', 'english', 'eng']),
]);
const LANGUES_FAIBLES = new Set(['eng', 'francais']); // trop courants seuls : il faut un mot « fort » à côté

const QUALITES_FORTES = new Set([
  '4k', '8k', 'uhd', 'fhd', 'qhd', 'hdlight', 'hd-light', '4klight', '4k-light', 'bluray', 'blu-ray', 'bdrip', 'brrip', 'bdremux', 'remux',
  'webrip', 'webdl', 'web-dl', 'hdtv', 'dvdrip', 'dvdscr', 'dvd', 'hdrip', 'hdcam', 'tvrip', 'hdr', 'hdr10', 'hdr10+', 'x264', 'x265',
  'h264', 'h265', 'h.264', 'h.265', 'hevc', 'avc', 'xvid', 'divx', '10bit', '10bits', 'imax', 'dts', 'dts-hd', 'ac3', 'eac3', 'aac',
  'atmos', 'truehd', 'ddp', 'mhd', 'fullhd', 'full-hd',
]);
const QUALITES_FAIBLES = new Set(['light', 'web', 'hd', 'sd', 'ts', 'cam', 'dv', 'ultra', 'dl', '5.1', '7.1', '2.0']);

const GENRES = new Set([
  'action', 'aventure', 'aventures', 'animation', 'comedie', 'drame', 'dramatique', 'thriller', 'horreur', 'epouvante',
  'science-fiction', 'sci-fi', 'fantastique', 'fantasy', 'policier', 'crime', 'criminel', 'romance', 'romantique', 'guerre',
  'western', 'documentaire', 'biopic', 'biographie', 'historique', 'histoire', 'musical', 'musicale', 'musique', 'famille',
  'familial', 'jeunesse', 'enfants', 'mystere', 'suspense', 'espionnage', 'martiaux', 'sport', 'sports', 'catastrophe',
  'judiciaire', 'erotique', 'divers', 'anime', 'manga', 'mangas', 'shonen', 'seinen', 'shojo', 'isekai', 'mecha', 'telefilm',
  'spectacle', 'drama', 'kids', 'war', 'history', 'horror', 'comedy', 'adventure', 'mystery', 'family', 'music', 'documentary',
  'reality', 'sitcom', 'politique', 'film', 'films', 'serie', 'series', 'science', 'fiction', 'super', 'heros', 'arts',
]);
// Étiquettes de mise en avant collées en fin de titre sur les pages d'accueil (« New 18-11-2026 05:27 »).
const BADGES = new Set(['new', 'nouveau', 'nouveaute', 'nouveautes', 'exclu', 'exclusivite', 'hot', 'maj', 'update', 'updated']);
// Mots qui ne sont des genres qu'à l'intérieur d'un mot composé (« Science-Fiction », « Super-Héros »).
const GENRES_PARTIELS = new Set(['science', 'fiction', 'super', 'heros', 'arts']);

// ---------- mots ----------

const ep = (debut, fin) => (fin ? `E${Number(debut)}-E${Number(fin)}` : `E${Number(debut)}`);

// Un mot → { type, valeur, fort, … } ; type : contenu, sep, annee, note, genre, langue, qualite, saison, episode.
function classerMot(brut, { partie = false } = {}) {
  const mot = brut.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}+]+$/gu, '');
  if (!mot) return { type: 'sep' };
  const m = sansAccents(mot.toLowerCase());
  let x;
  if (/^(19|20)\d\d$/.test(m)) return { type: 'annee', valeur: m };
  if (/^\d{1,2}[-/.]\d{1,2}[-/.](\d{2}|\d{4})$/.test(m) || /^\d{1,2}[:h]\d{2}$/.test(m)) return { type: 'date' };
  if (BADGES.has(m)) return { type: 'badge' };
  if ((x = m.match(/^s(\d{1,2})e(\d{1,4})(?:-?e(\d{1,4}))?$/))) {
    return { type: 'saison', saison: Number(x[1]), episode: ep(x[2], x[3]), fort: true };
  }
  if ((x = m.match(/^s(\d{1,2})(?:-s?(\d{1,2}))?$/))) return { type: 'saison', saison: Number(x[1]), fin: x[2] ? Number(x[2]) : null, fort: true };
  if ((x = m.match(/^e(\d{1,4})(?:-e?(\d{1,4}))?$/))) return { type: 'episode', valeur: ep(x[1], x[2]), fort: true };
  if (m === 'integrale') return { type: 'saison', integrale: true, fort: true };
  if (LANGUES.has(m)) return { type: 'langue', famille: LANGUES.get(m), valeur: mot, fort: !LANGUES_FAIBLES.has(m) };
  if (/^\d{3,4}[pi]$/.test(m) || QUALITES_FORTES.has(m) || /^(dd\+?|ddp|e?ac3|dts|aac)\d\.\d$/.test(m)) return { type: 'qualite', valeur: mot, fort: true };
  if (QUALITES_FAIBLES.has(m)) return { type: 'qualite', valeur: mot, fort: false };
  if (GENRES.has(m) && (partie || !GENRES_PARTIELS.has(m))) return { type: 'genre', valeur: mot };
  const parties = m.split(/[._\-+]/).filter(Boolean);
  if (parties.length > 1) {
    const sous = parties.map((p) => classerMot(p, { partie: true }));
    if (sous.every((a) => a.type === 'genre')) return { type: 'genre', valeur: mot };
    if (sous.every((a) => a.type === 'qualite')) return { type: 'qualite', valeur: mot, fort: sous.some((a) => a.fort) };
    if (sous.every((a) => a.type === 'langue')) return { type: 'langue', famille: sous[0].famille, valeur: mot, fort: true };
  }
  return { type: 'contenu' };
}

// Découpe en morceaux : groupes entre crochets/parenthèses, « Saison 1 », « (+E13) », « 6.7 /10 », mots.
const RE_MORCEAU = new RegExp(
  [
    String.raw`\(\s*\+?\s*(?:e|ep|[ée]p(?:isodes?)?)\.?\s*\d{1,4}(?:\s*(?:-|à|a)\s*(?:e|ep)?\s*\d{1,4})?\s*\)`,
    String.raw`(?:saisons?|seasons?)\s*\d{1,2}(?:\s*(?:-|à|a|et|&)\s*\d{1,2})?(?![\p{L}\p{N}])`,
    String.raw`(?:[ée]pisodes?|ep\.?|[ée]p\.?)\s*\d{1,4}(?:\s*(?:-|à|a)\s*\d{1,4})?(?![\p{L}\p{N}])`,
    String.raw`(?:(?:note|imdb|tmdb)\s*:?\s*)?\d{1,2}(?:[.,]\d{1,2})?\s*\/\s*(?:10|5|100)(?!\d)`,
    String.raw`\[[^\]]*\]`,
    String.raw`\([^)]*\)`,
    String.raw`\{[^}]*\}`,
    String.raw`[^\s[\](){}]+`,
  ].join('|'),
  'giu',
);
const NATURES_META = new Set(['sep', 'annee', 'note', 'genre', 'date', 'badge']);
const NATURES_VERSION = new Set(['sep', 'annee', 'langue', 'qualite', 'saison', 'episode']);

function atomesDe(brut) {
  let x;
  if ((x = brut.match(/^\(\s*(\+)?\s*(?:e|ep|[ée]p(?:isodes?)?)\.?\s*(\d{1,4})(?:\s*(?:-|à|a)\s*(?:e|ep)?\s*(\d{1,4}))?\s*\)$/iu))) {
    return [{ type: 'episode', valeur: x[1] ? `+${ep(x[2])}` : ep(x[2], x[3]), fort: true }];
  }
  if ((x = brut.match(/^(?:saisons?|seasons?)\s*(\d{1,2})(?:\s*(?:-|à|a|et|&)\s*(\d{1,2}))?$/iu))) {
    return [{ type: 'saison', saison: Number(x[1]), fin: x[2] ? Number(x[2]) : null, fort: true }];
  }
  if ((x = brut.match(/^(?:[ée]pisodes?|ep\.?|[ée]p\.?)\s*(\d{1,4})(?:\s*(?:-|à|a)\s*(\d{1,4}))?$/iu))) {
    return [{ type: 'episode', valeur: ep(x[1], x[2]), fort: true }];
  }
  if ((x = brut.match(/(\d{1,2}(?:[.,]\d{1,2})?)\s*\/\s*(10|5|100)\)?$/))) return [{ type: 'note', valeur: `${x[1].replace(',', '.')}/${x[2]}` }];
  if (/^[[({]/.test(brut)) {
    const dedans = brut.slice(1, -1);
    if (/^\s*(19|20)\d\d\s*$/.test(dedans)) return [{ type: 'annee', valeur: dedans.trim(), entreParentheses: true }];
    const atomes = dedans.split(/[\s,;|/]+/).filter(Boolean).map((m) => classerMot(m));
    return atomes.length ? atomes : [{ type: 'sep' }];
  }
  return [classerMot(brut)];
}

function morceaux(texte) {
  return [...texte.matchAll(RE_MORCEAU)].map(([brut]) => {
    const atomes = atomesDe(brut);
    const types = atomes.map((a) => a.type);
    let nature = 'contenu';
    if (types.every((t) => t === 'sep')) nature = 'sep';
    else if (types.every((t) => NATURES_META.has(t))) nature = 'meta';
    else if (types.every((t) => NATURES_VERSION.has(t))) nature = 'version';
    return { brut, atomes, nature };
  });
}

const estFort = (m) => m.atomes.some((a) => a.fort);
const estAnnee = (m) => m.atomes.every((a) => a.type === 'annee' || a.type === 'sep') && m.atomes.some((a) => a.type === 'annee');

// ---------- lecture d'un titre ----------

const vide = () => ({ langues: [], familles: [], qualites: [], saison: null, episodes: [], annee: '', genres: [], note: '' });

function rassembler(atomes, champs = vide()) {
  const ajouter = (tab, v) => {
    if (v && !tab.some((x) => x.toLowerCase() === v.toLowerCase())) tab.push(v);
  };
  for (const a of atomes) {
    if (a.type === 'langue') {
      ajouter(champs.langues, a.valeur.toUpperCase());
      if (!champs.familles.includes(a.famille)) champs.familles.push(a.famille);
    } else if (a.type === 'qualite') ajouter(champs.qualites, a.valeur);
    else if (a.type === 'saison') {
      champs.saison ||= a;
      if (a.episode) ajouter(champs.episodes, a.episode);
    } else if (a.type === 'episode') ajouter(champs.episodes, a.valeur);
    else if (a.type === 'annee') champs.annee ||= a.valeur;
    else if (a.type === 'genre') ajouter(champs.genres, a.valeur);
    else if (a.type === 'note') champs.note ||= a.valeur;
  }
  return champs;
}

// Genres absents du vocabulaire (« Psychologique, Tournois », « Tranche de vie », « Téléréalité ») :
// juste après la version (langue, qualité, épisodes…), une fin faite seulement de mots séparés par des
// virgules, suivie au plus d'une note et d'une année, est une liste de genres.
function genresInconnus(tous) {
  let k = tous.length - 1;
  while (k >= 0 && !(tous[k].nature === 'version' && estFort(tous[k]))) k--;
  if (k < 0 || k === tous.length - 1) return;
  const queue = tous.slice(k + 1);
  if (queue.some((m) => m.nature === 'version')) return;
  const liste = queue.filter((m) => m.nature === 'contenu' || (m.nature === 'meta' && m.atomes.every((a) => a.type === 'genre' || a.type === 'sep')));
  if (!liste.some((m) => m.nature === 'contenu') || !liste.every((m) => /^[\p{L}'’-]+,?$/u.test(m.brut))) return;
  const genres = liste
    .map((m) => m.brut)
    .join(' ')
    .split(/\s*,\s*/)
    .map((g) => g.trim())
    .filter(Boolean);
  if (genres.length > 6 || genres.some((g) => g.split(/\s+/).length > 4)) return;
  for (const m of liste) Object.assign(m, { nature: 'meta', atomes: [{ type: 'sep' }] });
  liste[0].atomes = genres.map((g) => ({ type: 'genre', valeur: g }));
}

// Titre → { base (le titre du contenu), langues, familles, qualites, saison, episodes, annee, genres, note }.
export function analyserTitre(titre) {
  const original = propre(titre);
  let t = original;
  // Nom de release (« Film.2023.MULTi.2160p.WEB ») : les points séparent les mots, sauf « 5.1 ».
  if (!/\s/.test(t) && /[._].*[._]/.test(t)) t = t.replace(/_|(?<!\d)\.|\.(?!\d)/g, ' ');
  const tous = morceaux(t);
  genresInconnus(tous);
  let i = tous.length - 1;
  const meta = [];
  while (i >= 0 && (tous[i].nature === 'meta' || tous[i].nature === 'sep')) meta.unshift(tous[i--]);
  const version = [];
  while (i >= 0 && (tous[i].nature === 'version' || tous[i].nature === 'sep' || estAnnee(tous[i]))) version.unshift(tous[i--]);
  // La version commence au premier mot « fort » : un « Light » placé avant, ou l'année nue d'un titre
  // (« Blade Runner 2049 »), restent dans le titre ; une année entre parenthèses est extraite.
  let debut = 0;
  while (debut < version.length && !estFort(version[debut]) && !version[debut].atomes.some((a) => a.entreParentheses)) debut++;
  const rendus = version.splice(0, debut);
  const atomesMeta = meta.flatMap((m) => m.atomes);
  const fort = version.some(estFort);
  const note = atomesMeta.some((a) => a.type === 'note');
  const anneeMeta = atomesMeta.some((a) => a.type === 'annee');
  const genres = atomesMeta.some((a) => a.type === 'genre');
  // Un genre seul en fin de titre (« The Last Action ») ou une année nue (« Blade Runner 2049 ») font partie du titre.
  const infosValables = note || (genres && (anneeMeta || fort)) || (anneeMeta && fort) || meta.some((m) => m.atomes.some((a) => a.entreParentheses));
  if (!fort && !infosValables) return { base: original, ...vide() };
  const garde = [...tous.slice(0, i + 1), ...rendus, ...(fort ? [] : version)];
  const base = garde
    .map((m) => m.brut)
    .join(' ')
    .replace(/[\s\-–—|:,/·.]+$/, '')
    .trim();
  if (!base) return { base: original, ...vide() };
  // Une année entre parenthèses juste avant la saison distingue deux séries de même nom :
  // « The Game (2021) S01 » n'est pas « The Game S01 » (2025).
  const avantSaison = version.slice(0, Math.max(0, version.findIndex((m) => m.atomes.some((a) => a.type === 'saison' || a.type === 'episode'))));
  const anneeTitre = avantSaison.flatMap((m) => m.atomes).find((a) => a.entreParentheses)?.valeur || '';
  // Les années de la version (« (2021) ») passent avant celle des infos, plus fiable.
  return { base, anneeTitre, ...rassembler([...(fort ? version : []), ...(infosValables ? meta : [])].flatMap((m) => m.atomes)) };
}

// Étiquettes trouvées n'importe où dans un texte libre (le texte qui suit un résultat, par ex.).
export function analyserTexte(texte) {
  const atomes = morceaux(propre(texte))
    .filter((m) => m.nature !== 'contenu' || m.atomes.some((a) => a.type !== 'contenu'))
    .flatMap((m) => m.atomes)
    .filter((a) => a.type !== 'contenu' && a.type !== 'sep');
  const fort = atomes.some((a) => a.fort);
  return rassembler(atomes.filter((a) => a.fort !== false || fort));
}

// Saison et épisode d'après un nom de fichier ou de lien :
// « The Boys - Saison 1 Épisode 12 - [VF HD] », « Serie.S01E12.mkv », « Episode 12 ».
export function episodeDuNom(nom) {
  const t = sansAccents(String(nom || ''));
  let m = t.match(/S(\d{1,2})[ ._-]?E(\d{1,4})(?!\d)/i);
  if (m) return { saison: Number(m[1]), episode: Number(m[2]) };
  m = t.match(/(?:^|[^a-z])(?:episodes?|ep\.?|e)\s*(\d{1,4})(?!\d)/i);
  if (!m) return null;
  const saison = t.match(/(?:saison|season)\s*(\d{1,2})(?!\d)/i)?.[1];
  return { saison: saison ? Number(saison) : null, episode: Number(m[1]) };
}

const libelleSaison = (s) => {
  if (!s) return '';
  if (s.integrale) return 'Intégrale';
  return s.fin ? `Saisons ${s.saison} à ${s.fin}` : `Saison ${s.saison}`;
};

// Résultat complet : titre + texte autour (pour les étiquettes absentes du titre). Renvoie aussi
// la clé de regroupement : même titre (et même année pour un film) = même contenu.
export function decrireResultat(titre, autour = '') {
  const a = analyserTitre(titre);
  const b = analyserTexte(autour);
  if (!a.langues.length) Object.assign(a, { langues: b.langues, familles: b.familles });
  if (!a.qualites.length) a.qualites = b.qualites;
  if (!a.saison && !a.episodes.length) Object.assign(a, { saison: b.saison, episodes: b.episodes });
  a.annee ||= b.annee;
  if (!a.genres.length) a.genres = b.genres;
  a.note ||= b.note;
  const serie = !!(a.saison || a.episodes.length);
  // Les saisons d'une série sont regroupées ; un film garde son année (Dune 1984 ≠ Dune 2021),
  // une série seulement l'année écrite dans son titre (« The Game (2021) »).
  const annee = serie ? a.anneeTitre : a.annee;
  const titreAffiche = annee && !a.base.includes(annee) ? `${a.base} (${annee})` : a.base;
  return {
    titre: titreAffiche,
    cle: normaliser(titreAffiche) || normaliser(titre),
    serie,
    langue: a.langues.join(' '),
    familles: a.familles,
    qualite: a.qualites.join(' '),
    saison: libelleSaison(a.saison),
    saisonNum: a.saison?.integrale ? 999 : (a.saison?.saison ?? null),
    episodes: a.episodes.join(' '),
    annee: a.annee,
    genres: a.genres.join(', '),
    note: a.note,
  };
}
