// Lecture d'un nom de version (« Dune.2021.MULTi.VFF.2160p.WEB-DL.DV.HDR.x265-GRP ») et note d'une
// version selon le profil voulu : définition, langues présentes dans le fichier, poids, origine.
// Sert à la recherche sur les sources et à la liste d'envies (choisir toute seule la bonne version).
import { normaliser, sansAccents } from './titres.mjs';

const LANGUE = /^(multi|multilang|dual|vff|vfq|vf2|vfi|vf|vof|truefrench|french|francais|fr|vostfr|vost|subfrench|stfr|vo|voa|vosta|english|eng)$/;
// Mots qui marquent sûrement la fin du titre (définition, origine, codec…).
const TECHNIQUE =
  /^(\d{3,4}[pi]|4k|uhd|fhd|sd|remux|bdremux|bluray|blu-ray|bdrip|brrip|web|web-dl|webdl|webrip|web-rip|hdtv|hdrip|dvdrip|dvdscr|hdlight|hd-light|4klight|4k-light|mhd|x26[45]|h26[45]|hevc|avc|av1|xvid|divx|hdr|hdr10|hdr10\+|hdr10plus|dv|dovi|10bit|10bits|atmos|truehd|dts|dts-hd|ac3|eac3|ddp\d?(\.\d)?|aac|cam|hdcam|ts|hdts|telesync|imax|proper|repack|integrale|complete|custom)$/;
const ANNEE = /^(19\d\d|20\d\d)$/;
const SAISON = /^s(\d{1,2})(?:e(\d{1,4})(?:-?e?(\d{1,4}))?|-s?(\d{1,2}))?$/;

// Le nom découpé en mots : les points et tirets bas séparent, sauf dans « 5.1 » et « H.265 ».
function decouper(nom) {
  let t = String(nom || '').replace(/\.(mkv|mp4|avi|m2ts|iso|torrent)$/i, '');
  let groupe = '';
  const g = t.match(/-([A-Za-z0-9]{2,25})$/);
  if (g && !/^(dl|hd|ma|x|rip|ray|light|es|fr|vf|vff|vfq|vo)$/i.test(g[1]) && !ANNEE.test(g[1])) {
    groupe = g[1];
    t = t.slice(0, g.index);
  }
  t = t
    .replace(/[[\](){}]/g, ' ')
    .replace(/\b([hx])[ .]?(26[45])\b/gi, '$1$2')
    .replace(/_/g, ' ')
    // Un point sépare les mots, sauf dans un nombre de canaux (« 5.1 », « DDP5.1 », « AAC2.0 »).
    .replace(/\./g, (p, k, s) => (/(^|\D)[1-9]$/.test(s.slice(Math.max(0, k - 2), k)) && /^[0-2]($|[^\dA-Za-z])/.test(s.slice(k + 1, k + 3)) ? '.' : ' '));
  return { mots: t.split(/\s+/).filter(Boolean), groupe };
}

const bas = (m) => sansAccents(m).toLowerCase();

export function lireVersion(nom) {
  const { mots, groupe } = decouper(nom);
  const m = mots.map(bas);
  // Fin du titre : la dernière année placée avant le premier mot technique (« Blade Runner 2049 2017 »),
  // sinon la saison, sinon le premier mot technique ; à défaut, le premier mot de langue.
  const estSaison = (k) => SAISON.test(m[k]) || /^\d{1,2}x\d{2,3}$/.test(m[k]) || ((m[k] === 'saison' || m[k] === 'season') && /^\d{1,2}$/.test(m[k + 1] || '')) || m[k] === 'integrale';
  let technique = m.findIndex((x, k) => k > 0 && (TECHNIQUE.test(x) || estSaison(k)));
  if (technique < 0) technique = m.length;
  let fin = technique;
  let annee = null;
  for (let k = technique - 1; k >= 1; k--) {
    if (ANNEE.test(m[k])) {
      annee = Number(m[k]);
      fin = k;
      break;
    }
  }
  // Une année placée après la saison ou la langue (« Titre FRENCH 1995 1080p ») compte aussi.
  if (annee === null) {
    const k = m.findIndex((x, i) => i >= technique && ANNEE.test(x));
    if (k > 0 && k <= technique + 3) annee = Number(m[k]);
  }
  while (fin > 1 && LANGUE.test(m[fin - 1]) && (m[fin - 1].length > 2 || mots[fin - 1] === mots[fin - 1].toUpperCase())) fin--;
  if (fin === m.length && technique === m.length) {
    const k = m.findIndex((x, i) => i > 0 && LANGUE.test(x) && x.length > 2);
    if (k > 0) fin = k;
  }
  const titre = mots.slice(0, fin).join(' ').replace(/[\s\-–:,]+$/, '');
  const queueMots = m.slice(fin);
  const q = ` ${queueMots.join(' ').replace(/-/g, ' ')} `;
  const a = (re) => re.test(q);

  // ----- saison, épisodes -----
  let saison = null;
  let saisonFin = null;
  let episode = null;
  let episodeFin = null;
  let integrale = a(/ (integrale|complete series|serie complete|the complete series) /);
  queueMots.forEach((x, k) => {
    let s;
    if ((s = x.match(SAISON))) {
      saison ??= Number(s[1]);
      if (s[2]) episode ??= Number(s[2]);
      if (s[3]) episodeFin ??= Number(s[3]);
      if (s[4]) saisonFin ??= Number(s[4]);
    } else if ((s = x.match(/^(\d{1,2})x(\d{2,3})$/))) {
      saison ??= Number(s[1]);
      episode ??= Number(s[2]);
    } else if ((x === 'saison' || x === 'season') && /^\d{1,2}$/.test(queueMots[k + 1] || '')) saison ??= Number(queueMots[k + 1]);
    else if (/^e(\d{1,4})$/.test(x) && saison !== null) episode ??= Number(x.slice(1));
  });
  if (saisonFin !== null) integrale = true;

  // ----- définition -----
  const precise = q.match(/ (2160|1080|720|576|480)[pi] /);
  const definition = precise ? (Number(precise[1]) <= 576 ? 480 : Number(precise[1])) : a(/ (4k|uhd|4klight) /) ? 2160 : a(/ (fhd|full ?hd) /) ? 1080 : a(/ (sd|dvdrip|dvd|xvid) /) ? 480 : null;

  // ----- origine -----
  const origine = a(/ (cam|hdcam|camrip|hdts|ts|telesync|tc|telecine|scr|screener|dvdscr|r5|workprint) /)
    ? 'salle'
    : a(/ (complete (uhd )?blu ?ray|full (uhd )?blu ?ray|bd(25|50|66|100)|uhd ?bd|iso|bdmv) /)
      ? 'disque'
      : a(/ (bd)?remux /)
        ? 'remux'
        : a(/ (hd ?light|4k ?light|4klight|hdlight|mhd|light) /)
          ? 'hdlight'
          : a(/ web ?rip /)
            ? 'webrip'
            : a(/ (web ?dl|web) /)
              ? 'webdl'
              : a(/ (blu ?ray|bdrip|brrip|uhdrip|hdrip) /)
                ? 'bluray'
                : a(/ (hdtv|pdtv|tvrip) /)
                  ? 'hdtv'
                  : a(/ dvd(rip)? /)
                    ? 'dvd'
                    : null;

  // ----- image et son -----
  const codec = a(/ (x265|h265|hevc) /) ? 'hevc' : a(/ (x264|h264|avc) /) ? 'avc' : a(/ av1 /) ? 'av1' : a(/ (xvid|divx) /) ? 'xvid' : null;
  const hdr = [];
  if (a(/ (dv|dovi|dolby ?vision) /)) hdr.push('dv');
  if (a(/ hdr10(\+|plus|p) /)) hdr.push('hdr10+');
  if (a(/ hdr(10)? /)) hdr.push('hdr');
  const audio = [];
  if (a(/ atmos /)) audio.push('atmos');
  if (a(/ true ?hd/)) audio.push('truehd');
  if (a(/ dts ?(hd|x|ma) /)) audio.push('dts-hd');
  else if (a(/ dts/)) audio.push('dts');
  if (a(/ (ddp|dd\+|e ?ac3)/)) audio.push('eac3');
  else if (a(/ (ac3|dd\d) /) || a(/ dd /)) audio.push('ac3');
  if (a(/ aac/)) audio.push('aac');

  // ----- langues présentes dans le fichier -----
  const detail = [];
  const noter = (re, nomLangue) => {
    if (a(re)) detail.push(nomLangue);
  };
  noter(/ (multi|multilang) /, 'MULTI');
  noter(/ dual /, 'DUAL');
  noter(/ vf2 /, 'VF2');
  noter(/ (vff|truefrench) /, 'VFF');
  noter(/ vfq /, 'VFQ');
  noter(/ vfi /, 'VFI');
  noter(/ (french|vf|vof|francais) /, 'VF');
  noter(/ (vostfr|vost|subfrench|stfr) /, 'VOSTFR');
  noter(/ (vo|voa|vosta|english|eng) /, 'VO');
  // « FR » ne compte que tout en majuscules (ce n'est pas le mot d'un titre).
  if (!detail.length && mots.slice(fin).includes('FR')) detail.push('VF');
  const francais = detail.some((d) => ['VF2', 'VFF', 'VFQ', 'VFI', 'VF'].includes(d));
  const plusieurs = detail.includes('MULTI') || detail.includes('DUAL');
  const sousTitre = detail.includes('VOSTFR');
  const langues = {
    // MULTI = version française + version originale dans le même fichier.
    vf: francais || detail.includes('MULTI') || (detail.includes('DUAL') && !sousTitre),
    vo: plusieurs || sousTitre || detail.includes('VO') || !detail.length,
    stfr: sousTitre,
    connue: detail.length > 0,
    detail,
  };

  return {
    nom: String(nom || ''), titre, annee, saison, saisonFin, episode, episodeFin, integrale,
    definition, origine, codec, hdr, audio, langues, groupe,
    troisD: a(/ (3d|hsbs|sbs|hou) /),
    corrigee: a(/ (proper|repack|rerip) /),
  };
}

// ---------- profil ----------

// Ce que l'utilisateur veut : la définition (vide = toutes), les langues dans le fichier
// (« vf+vo » : les deux ; « vf » : au moins le français ; « toutes »), le poids des fichiers
// (« leger », « equilibre », « maximum »), une taille maximale en Go (0 = sans limite), et
// si une image seulement en Dolby Vision est acceptée (non par défaut : sur une télé qui ne
// le gère pas, les couleurs sont fausses).
export const PROFIL_DEFAUT = { definitions: [2160], langue: 'vf+vo', poids: 'equilibre', tailleMax: 0, dolbyVisionSeul: false };

export function lireProfil(p) {
  const brut = p && typeof p === 'object' ? p : {};
  const definitions = Array.isArray(brut.definitions) ? [...new Set(brut.definitions.map(Number).filter((d) => [2160, 1080, 720, 480].includes(d)))] : PROFIL_DEFAUT.definitions;
  return {
    definitions,
    langue: ['vf+vo', 'vf', 'toutes'].includes(brut.langue) ? brut.langue : PROFIL_DEFAUT.langue,
    poids: ['leger', 'equilibre', 'maximum'].includes(brut.poids) ? brut.poids : PROFIL_DEFAUT.poids,
    tailleMax: Math.max(0, Number(brut.tailleMax) || 0),
    dolbyVisionSeul: brut.dolbyVisionSeul === true,
  };
}

const ORIGINES = {
  maximum: { remux: 100, bluray: 82, webdl: 72, webrip: 58, hdlight: 42, hdtv: 30, dvd: 10 },
  equilibre: { webdl: 100, bluray: 94, webrip: 80, hdlight: 70, remux: 58, hdtv: 40, dvd: 10 },
  leger: { hdlight: 100, webrip: 90, webdl: 84, bluray: 68, hdtv: 50, remux: 15, dvd: 10 },
};

// Rend { ok, refus (pourquoi la version ne convient pas), note (plus c'est haut, mieux c'est) }.
// « taille » en octets et « sources » (nombre de personnes qui partagent) viennent de la recherche.
export function noterVersion(v, profil = PROFIL_DEFAUT, { taille = null, sources = null } = {}) {
  const refuser = (refus) => ({ ok: false, refus, note: 0 });
  if (v.origine === 'salle') return refuser('filmé en salle');
  if (v.origine === 'disque') return refuser('disque complet, pas un simple fichier vidéo');
  if (v.troisD) return refuser('version 3D');
  if (profil.definitions.length && !profil.definitions.includes(v.definition)) {
    return refuser(v.definition ? `${v.definition === 2160 ? '4K' : `${v.definition}p`} au lieu de ${profil.definitions.map((d) => (d === 2160 ? '4K' : `${d}p`)).join(' ou ')}` : 'définition non précisée');
  }
  if (profil.langue === 'vf+vo' && !(v.langues.vf && v.langues.vo)) {
    return refuser(!v.langues.connue ? 'langue non précisée (sans doute sans français)' : v.langues.vf ? 'français seul, sans version originale' : 'pas de version française');
  }
  if (profil.langue === 'vf' && !v.langues.vf) return refuser(v.langues.connue ? 'pas de version française' : 'langue non précisée (sans doute sans français)');
  if (v.hdr.includes('dv') && v.hdr.length === 1 && !profil.dolbyVisionSeul) return refuser('image en Dolby Vision seul');
  if (profil.tailleMax && taille && taille > profil.tailleMax * 1024 ** 3) return refuser(`plus de ${profil.tailleMax} Go`);
  if (sources === 0) return refuser('plus personne ne la partage');
  let note = ORIGINES[profil.poids][v.origine] ?? 50;
  if (v.hdr.includes('hdr') || v.hdr.includes('hdr10+')) note += 6;
  if (v.codec === 'hevc' && v.definition === 2160) note += 4;
  if (v.codec === 'av1') note -= 6;
  if (profil.langue !== 'toutes') {
    // Doublage de France avant le doublage québécois.
    if (v.langues.detail.some((d) => d === 'VFF' || d === 'VF2')) note += 5;
    else if (v.langues.detail.includes('VFQ')) note -= 8;
  }
  if (v.corrigee) note += 2;
  if (sources !== null) note += Math.min(10, Math.log2(sources + 1) * 1.5);
  return { ok: true, refus: '', note: Math.round(note * 10) / 10 };
}

// ---------- correspondance avec ce qu'on cherche ----------

// Sans article de tête ni espaces : « D'Artagnan » et « DArtagnan » se valent.
const sansArticle = (t) => normaliser(t).replace(/^(the|le|la|les|l|un|une|a|an) /, '').replace(/ /g, '');

// La version est-elle bien celle du film ou de la série voulus ?
// voeu : { titres (titre français, titre original…), annee, type ('film' | 'serie'), saison, episode }
export function correspondAuVoeu(v, voeu) {
  const titre = sansArticle(v.titre);
  if (!titre || !voeu.titres.some((t) => sansArticle(t) === titre)) return false;
  if (voeu.type === 'serie') {
    if (v.saison === null && !v.integrale) return false;
    if (voeu.saison !== undefined && voeu.saison !== null) {
      const dedans = v.integrale && v.saisonFin === null ? true : v.saison !== null && voeu.saison >= v.saison && voeu.saison <= (v.saisonFin ?? v.saison);
      if (!dedans) return false;
      if (voeu.episode !== undefined && voeu.episode !== null && v.episode !== null) {
        if (voeu.episode < v.episode || voeu.episode > (v.episodeFin ?? v.episode)) return false;
      }
    }
    return true;
  }
  if (v.saison !== null || v.integrale) return false;
  // L'année, quand la version la donne, départage deux films de même titre (à un an près : sorties décalées).
  return !(voeu.annee && v.annee && Math.abs(v.annee - voeu.annee) > 1);
}

// ---------- regroupement par film ou série ----------

// Réunit les versions d'un même film, ou d'une même série (toutes saisons confondues) : c'est ce que la page
// montre sous forme d'affiche. « versions » : celles que rend la recherche groupée (src/sources.mjs).
// Avec « q » (ce qu'on a cherché), les contenus dont le titre correspond le mieux viennent d'abord ;
// sans, les plus récents.
export function regrouperVersions(versions, q = '') {
  const groupes = new Map();
  const ranger = (cle, type, base, v) => {
    if (!groupes.has(cle)) groupes.set(cle, { cle, type, base, versions: [] });
    groupes.get(cle).versions.push(v);
  };
  const sansAnnee = [];
  for (const v of versions) {
    const base = sansArticle(v.titre);
    if (!base) continue;
    if (v.saison !== null || v.integrale) ranger(`s|${base}`, 'serie', base, v);
    else if (v.annee) ranger(`f|${base}|${v.annee}`, 'film', base, v);
    else sansAnnee.push({ base, v });
  }
  // Un film sans année dans son nom rejoint le film de même titre déjà vu (le plus fourni), s'il y en a un.
  for (const { base, v } of sansAnnee) {
    const meme = [...groupes.values()].filter((g) => g.type === 'film' && g.base === base).sort((a, b) => b.versions.length - a.versions.length)[0];
    ranger(meme ? meme.cle : `f|${base}|`, 'film', base, v);
  }
  const voulu = sansArticle(q);
  const contenus = [...groupes.values()].map((g) => {
    const vs = g.versions;
    const bonnes = vs.filter((v) => v.convient);
    // Le titre affiché : celui de la version la plus partagée (souvent la mieux nommée).
    const reference = [...vs].sort((a, b) => (b.sources ?? 0) - (a.sources ?? 0))[0];
    const montrees = bonnes.length ? bonnes : vs;
    const familles = [];
    const noter = (nom, test) => vs.some(test) && familles.push(nom);
    noter('multi', (v) => v.langues.includes('MULTI') || v.langues.includes('DUAL'));
    noter('vf', (v) => v.vf && !v.langues.includes('MULTI') && !v.langues.includes('DUAL'));
    noter('vostfr', (v) => v.langues.includes('VOSTFR'));
    noter('vo', (v) => !v.vf && !v.langues.includes('VOSTFR'));
    const annee = g.type === 'film' ? vs.find((v) => v.annee)?.annee ?? null : null;
    // Même titre affiché et même clé que les résultats du site (titres.mjs) : « Dune (2021) » pour un film,
    // le titre seul pour une série. Un contenu vu des deux côtés n'a ainsi qu'une carte.
    const titreAffiche = annee && !reference.titre.includes(String(annee)) ? `${reference.titre} (${annee})` : reference.titre;
    return {
      cle: g.cle,
      cleSite: normaliser(titreAffiche),
      titreAffiche,
      type: g.type,
      titre: reference.titre,
      annee,
      saisons: g.type === 'serie' ? [...new Set(vs.map((v) => v.saison).filter((s) => s !== null))].sort((a, b) => a - b) : [],
      versions: vs.map((v) => v.id),
      conviennent: bonnes.length,
      definitions: [...new Set(montrees.map((v) => v.definition).filter(Boolean))].sort((a, b) => b - a),
      familles,
      note: Math.max(0, ...bonnes.map((v) => v.note)),
      date: Math.max(0, ...vs.map((v) => v.date || 0)),
      pertinence: !voulu ? 0 : g.base === voulu ? 3 : g.base.startsWith(voulu) || voulu.startsWith(g.base) ? 2 : 1,
    };
  });
  contenus.sort((a, b) => (voulu ? b.pertinence - a.pertinence || (b.conviennent > 0) - (a.conviennent > 0) || b.note - a.note || b.versions.length - a.versions.length : (b.conviennent > 0) - (a.conviennent > 0) || b.date - a.date || b.versions.length - a.versions.length));
  return contenus;
}
