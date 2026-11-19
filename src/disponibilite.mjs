// Disponibilité des liens et des fiches : les fichiers sont-ils encore en ligne ?
//
// Tout passe par AllDebrid, sans rien débrider : link/redirector ouvre un lien protégé, link/infos dit
// si le fichier est toujours chez l'hébergeur. Les protecteurs de liens sont derrière un captcha : seul
// AllDebrid sait les ouvrir, et il lui faut jusqu'à 40 s pour un lien qu'il n'a jamais vu (moins de
// 0,3 s ensuite). Ce module fait donc en sorte d'attendre le moins possible :
//   - les appels partent espacés (AllDebrid en accepte 12 par seconde et 600 par minute) mais restent
//     ouverts en même temps : une ouverture lente ne retarde pas les autres ;
//   - une fiche est « en ligne » dès qu'un de ses liens répond : ses autres liens ne sont pas testés ;
//   - un hébergeur qu'AllDebrid refuse à chaque fois n'est plus testé du tout ;
//   - l'erreur « REDIRECTOR_ERROR » est souvent passagère : on réessaie avant de dire que le lien est mort ;
//   - tout ce qui est appris est gardé sur le disque : la fois suivante, la réponse est immédiate.
//
// État d'un lien : { dispo: true, nom, noms, hote, taille, fichiers } | { dispo: false, message }
//                | { dispo: null, message } (on ne sait pas).
// Verdict d'une fiche : { etat: 'ok' | 'ko' | 'inconnu', total, dispo, morts, autres, episode, … }.
import fs from 'node:fs';
import path from 'node:path';
import { messageAllDebrid } from './alldebrid.mjs';
import { classerLien, hebergeursConnus, sourcesDe, ErreurRecherche } from './recherche.mjs';
import { normaliser } from './titres.mjs';

const H = 3600e3;

// Réglages (les tests les raccourcissent).
export const reglages = {
  espacement: 125, // ms entre deux appels à AllDebrid → 8 par seconde au plus
  parMinute: 360, // appels par minute au plus : les téléchargements utilisent la même clé
  minute: 60_000,
  ouvertsMax: 40, // appels en attente de réponse en même temps
  pauseSaturation: 5000, // AllDebrid a répondu 429 ou 503 : on ne lance plus rien pendant ce temps
  delaiOuverture: 70_000, // attente maximale pour l'ouverture d'un lien protégé
  pausesRedirecteur: [4000, 15_000], // nouveaux essais après un « REDIRECTOR_ERROR »
  attenteLot: 40, // ms pendant lesquelles on regroupe les liens d'un même link/infos
  decalage: 700, // ms avant de tester le lien suivant d'une fiche si le premier n'a pas répondu
  lecturesSite: 6, // pages du site lues en même temps
  delaiSauvegarde: 3000, // ms entre un changement et son écriture sur le disque
};
const PAR_APPEL = 25;
const DUREES = { enLigne: 6 * H, mort: 7 * 24 * H, nonGere: 24 * H, inutilisable: 6 * H, ficheOk: 6 * H, ficheKo: 12 * H, page: 10 * 60e3 };

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- mémoire (et fichier) ----------

const etats = new Map(); // lien → { etat, expire }
const verdicts = new Map(); // adresse de fiche → { verdict, expire }
const hotes = new Map(); // hébergeur annoncé → { ok, nonGere, dernierOk, dernierRefus }
const annonces = new Map(); // lien protégé → hébergeur annoncé par le site
let fichier = null;
let sauvegarde = null;

const frais = (carte, cle, champ) => {
  const c = carte.get(cle);
  if (!c) return null;
  if (Date.now() < c.expire) return c[champ];
  carte.delete(cle);
  return null;
};
const etatConnu = (lien) => frais(etats, lien, 'etat');

// Garde les résultats d'une fois sur l'autre dans <dossier>/disponibilite.json.
export function configurerDisponibilite({ dossier } = {}) {
  fichier = dossier ? path.join(dossier, 'disponibilite.json') : null;
  etats.clear();
  verdicts.clear();
  hotes.clear();
  if (!fichier) return;
  try {
    const d = JSON.parse(fs.readFileSync(fichier, 'utf8'));
    const maintenant = Date.now();
    for (const [lien, etat, expire] of d.liens || []) if (expire > maintenant) etats.set(lien, { etat, expire });
    for (const [url, verdict, expire] of d.fiches || []) if (expire > maintenant) verdicts.set(url, { verdict, expire });
    for (const [nom, h] of d.hotes || []) hotes.set(nom, h);
  } catch {}
}

function sauvegarderBientot() {
  if (!fichier || sauvegarde) return;
  sauvegarde = setTimeout(async () => {
    sauvegarde = null;
    const maintenant = Date.now();
    for (const carte of [etats, verdicts]) {
      for (const [cle, c] of carte) if (c.expire <= maintenant) carte.delete(cle);
      // Trop d'entrées : les plus anciennes partent.
      for (const cle of carte.keys()) {
        if (carte.size <= 20_000) break;
        carte.delete(cle);
      }
    }
    const contenu = JSON.stringify({
      liens: [...etats].map(([lien, c]) => [lien, c.etat, c.expire]),
      fiches: [...verdicts].map(([url, c]) => [url, c.verdict, c.expire]),
      hotes: [...hotes],
    });
    try {
      await fs.promises.mkdir(path.dirname(fichier), { recursive: true });
      await fs.promises.writeFile(`${fichier}.tmp`, contenu);
      await fs.promises.rename(`${fichier}.tmp`, fichier);
    } catch {}
  }, reglages.delaiSauvegarde);
  sauvegarde.unref?.();
}

function retenir(lien, etat, duree) {
  apprendre(lien, etat);
  if (etat.dispo === null) return;
  etats.set(lien, { etat, expire: Date.now() + (duree || (etat.dispo ? DUREES.enLigne : etat.nonGere ? DUREES.nonGere : DUREES.mort)) });
  sauvegarderBientot();
}

// ---------- hébergeurs annoncés par le site ----------
// « Rapidgator - Film.2024.mkv » : le site dit quel hébergeur se cache derrière chaque lien protégé.
// Un lien dont l'hébergeur annoncé n'est pas dans la liste d'AllDebrid ne servira à rien : il n'est
// pas ouvert du tout (c'est souvent les deux tiers des liens d'une fiche, et les plus longs à ouvrir).
// Et quand AllDebrid a refusé deux liens d'un hébergeur pourtant dans sa liste (« non pris en
// charge ») sans jamais en accepter un, les suivants ne sont plus testés pendant 24 h.

const RE_ETIQUETTE = /^[\p{L}\d][\p{L}\d.]{1,19}$/u;
const cleHote = (nom) => normaliser(nom).replace(/ /g, '');
const NON_GERE = { dispo: false, nonGere: true, message: messageAllDebrid('LINK_HOST_NOT_SUPPORTED') };

// On ne se fie aux annonces d'une fiche que si elle en a au moins deux différentes, en un seul mot :
// sinon c'est sans doute un titre (« Dune - Épisode 2 »), pas un hébergeur.
export function retenirAnnonces(sources) {
  const proteges = sources.filter((s) => s.type === 'protege' && RE_ETIQUETTE.test(s.annonce || ''));
  if (new Set(proteges.map((s) => cleHote(s.annonce))).size < 2) return;
  if (annonces.size > 50_000) annonces.clear();
  for (const s of proteges) annonces.set(s.url, cleHote(s.annonce));
}

function apprendre(lien, etat) {
  const nom = annonces.get(lien);
  if (!nom || !(etat.dispo || etat.nonGere)) return;
  const h = hotes.get(nom) || { ok: 0, nonGere: 0, dernierOk: 0, dernierRefus: 0 };
  const maintenant = Date.now();
  if (etat.dispo) Object.assign(h, { ok: h.ok + 1, nonGere: 0, dernierOk: maintenant });
  else {
    // Un hébergeur qui marchait et ne marche plus depuis un jour : on oublie ses anciens succès.
    if (maintenant - h.dernierOk > 24 * H) h.ok = 0;
    Object.assign(h, { nonGere: h.nonGere + 1, dernierRefus: maintenant });
  }
  hotes.set(nom, h);
  sauvegarderBientot();
}

function horsService(nom) {
  const h = nom && hotes.get(nom);
  return !!h && h.ok === 0 && h.nonGere >= 2 && Date.now() - h.dernierRefus < 24 * H;
}

// Noms sous lesquels AllDebrid connaît ses hébergeurs : « rapidgator », « rg » (rg.to), « 1fichier »…
const nomsParListe = new WeakMap();
function nomsGeres(hebergeurs) {
  let noms = nomsParListe.get(hebergeurs);
  if (!noms) {
    noms = new Set();
    for (const [domaine, nom] of hebergeurs.hebergeurs) noms.add(cleHote(nom)).add(cleHote(domaine.split('.')[0]));
    nomsParListe.set(hebergeurs, noms);
  }
  return noms;
}
// « Uptobox » annoncé, « uptobox » chez AllDebrid ; on tolère un nom raccourci ou allongé (4 lettres au moins).
function estGere(nom, noms) {
  if (noms.has(nom)) return true;
  return nom.length >= 4 && [...noms].some((n) => n.length >= 4 && (n.startsWith(nom) || nom.startsWith(n)));
}
// Lien protégé qu'il est inutile d'ouvrir : son hébergeur annoncé n'est pas géré par AllDebrid.
function inutile(lien, hebergeurs) {
  const nom = annonces.get(lien);
  return !!nom && (horsService(nom) || !estGere(nom, nomsGeres(hebergeurs)));
}

// Les hébergeurs qui ont déjà donné des fichiers en ligne passent devant.
function interet(s) {
  if (s.type === 'hebergeur') return 1000; // lien direct : pas de protecteur à ouvrir
  const h = hotes.get(annonces.get(s.url));
  return h ? Math.min(h.ok, 100) - 10 * h.nonGere : 0;
}

// ---------- rythme des appels à AllDebrid ----------

const departs = []; // heures de départ réservées (la dernière minute)
const fileOuverts = [];
let ouverts = 0;
let prochain = 0;

// Réserve l'heure du prochain départ : espacé du précédent, et jamais plus de « parMinute » en 60 s.
function reserver(ad) {
  const maintenant = Date.now();
  while (departs.length && maintenant - departs[0] >= reglages.minute) departs.shift();
  let t = Math.max(maintenant, prochain, (ad.derniereSaturation || 0) + reglages.pauseSaturation);
  if (departs.length >= reglages.parMinute) t = Math.max(t, departs[departs.length - reglages.parMinute] + reglages.minute);
  prochain = t + reglages.espacement;
  departs.push(t);
  return t - maintenant;
}

async function creneau(ad, travail, surDepart) {
  while (ouverts >= reglages.ouvertsMax) await new Promise((r) => fileOuverts.push(r));
  ouverts++;
  try {
    // Si AllDebrid a demandé de ralentir pendant l'attente, on reprend une place plus loin.
    do {
      const attente = reserver(ad);
      if (attente > 0) await pause(attente);
    } while (Date.now() < (ad.derniereSaturation || 0) + reglages.pauseSaturation);
    surDepart?.();
    return await travail();
  } finally {
    ouverts--;
    fileOuverts.shift()?.();
  }
}

// ---------- état d'un lien ----------

const TEMPORAIRES = new Set(['LINK_TEMPORARY_UNAVAILABLE', 'LINK_HOST_UNAVAILABLE', 'LINK_HOST_FULL', 'LINK_HOST_LIMIT_REACHED', 'LINK_TOO_MANY_DOWNLOADS']);
const erreurDeCompte = (e) => e?.code === 'NO_KEY' || /^AUTH_/.test(e?.code || '') || e?.code === 'NETWORK';

function etatDepuisInfo(info) {
  if (!info) return { dispo: null, message: "AllDebrid n'a rien répondu pour ce lien." };
  if (info.error) {
    const { code, message } = info.error;
    if (TEMPORAIRES.has(code)) return { dispo: null, message: messageAllDebrid(code, message) };
    return { dispo: false, message: messageAllDebrid(code, message), ...(code === 'LINK_HOST_NOT_SUPPORTED' ? { nonGere: true } : {}) };
  }
  const nom = info.filename || '';
  return { dispo: true, nom, noms: [nom], hote: info.host || info.hostDomain || '', taille: Number(info.size) || 0, fichiers: 1 };
}

// link/infos accepte plusieurs liens : ceux demandés au même moment partent dans le même appel.
let lotInfos = null;
function infosDe(ad, lien) {
  if (!lotInfos || lotInfos.ad !== ad) {
    const neuf = (lotInfos = { ad, attentes: new Map() });
    neuf.minuterie = setTimeout(() => envoyerLot(neuf), reglages.attenteLot);
  }
  const lot = lotInfos;
  const promesse = new Promise((ok, ko) => {
    if (!lot.attentes.has(lien)) lot.attentes.set(lien, []);
    lot.attentes.get(lien).push({ ok, ko });
  });
  if (lot.attentes.size >= PAR_APPEL) {
    clearTimeout(lot.minuterie);
    envoyerLot(lot);
  }
  return promesse;
}
async function envoyerLot(lot) {
  if (lotInfos === lot) lotInfos = null;
  const liens = [...lot.attentes.keys()];
  try {
    const infos = await creneau(lot.ad, () => lot.ad.infosLiens(liens));
    liens.forEach((lien, k) => {
      const etat = etatDepuisInfo(infos.find((x) => x.link === lien) || infos[k]);
      for (const a of lot.attentes.get(lien)) a.ok(etat);
    });
  } catch (e) {
    for (const attentes of lot.attentes.values()) for (const a of attentes) a.ko(e);
  }
}

// Ouvre un lien protégé : { caches: [liens] } ou { etat, duree } si on n'y arrive pas.
async function ouvrir(ad, lien, surDepart) {
  for (let essai = 0; ; essai++) {
    try {
      const caches = await creneau(ad, () => ad.redirecteur(lien, undefined, { delai: reglages.delaiOuverture }), essai ? null : surDepart);
      return caches.length ? { caches } : { etat: { dispo: false, message: 'Le lien protégé ne contient aucun fichier.' }, duree: DUREES.inutilisable };
    } catch (e) {
      if (erreurDeCompte(e)) throw e;
      if (e.code === 'REDIRECTOR_ERROR') {
        // Souvent passager : AllDebrid y arrive au deuxième essai. Trois échecs : le lien est inutilisable.
        if (essai < reglages.pausesRedirecteur.length) {
          await pause(reglages.pausesRedirecteur[essai]);
          continue;
        }
        return { etat: { dispo: false, message: "AllDebrid n'arrive pas à ouvrir ce lien protégé (lien supprimé ?)." }, duree: DUREES.inutilisable };
      }
      if (e.code === 'REDIRECTOR_NOT_SUPPORTED' || e.code === 'LINK_DOWN') return { etat: { dispo: false, message: e.message } };
      if (e.code === 'TIMEOUT') return { etat: { dispo: null, message: 'AllDebrid met trop de temps à ouvrir ce lien protégé.' } };
      return { etat: { dispo: null, message: e.message } };
    }
  }
}

// État d'un lien protégé d'après ses fichiers : le vrai hébergeur et les noms de fichiers
// (utile pour savoir quel épisode se cache derrière).
function etatProtege(liste) {
  const ok = liste.filter((e) => e.dispo);
  if (!ok.length) return liste.find((e) => e.dispo === null) || liste[0];
  return {
    dispo: true,
    nom: ok[0].nom + (ok.length > 1 ? ` (+${ok.length - 1})` : ''),
    noms: ok.map((e) => e.nom).slice(0, 30),
    hote: ok[0].hote,
    taille: ok.reduce((t, e) => t + e.taille, 0),
    fichiers: ok.length,
  };
}

// Un même lien demandé plusieurs fois en même temps (deux fiches qui le partagent, la liste et la
// fiche ouverte…) n'est vérifié qu'une fois. « surDepart » : rappelé quand l'appel part vraiment.
const enCours = new Map();
function verifierUn(ad, lien, type, surDepart) {
  const connu = etatConnu(lien);
  if (connu) return Promise.resolve(connu);
  if (enCours.has(lien)) {
    surDepart?.();
    return enCours.get(lien);
  }
  const promesse = (async () => {
    let etat;
    let duree;
    if (type === 'protege') {
      const o = await ouvrir(ad, lien, surDepart);
      duree = o.duree;
      etat = o.etat || etatProtege(await Promise.all(o.caches.map((c) => infosDe(ad, c))));
    } else {
      surDepart?.();
      etat = await infosDe(ad, lien);
    }
    retenir(lien, etat, duree);
    return etat;
  })().finally(() => enCours.delete(lien));
  promesse.catch(() => {}); // personne n'attend peut-être plus la réponse
  enCours.set(lien, promesse);
  return promesse;
}

// Vérifie des liens (fiche ouverte). « attente » (ms) : au-delà, les liens qu'AllDebrid est encore en
// train d'ouvrir reviennent avec « enCours » ; ils continuent en arrière-plan, il suffit de redemander.
export async function verifierLiens(ad, liens, { attente = 0 } = {}) {
  try {
    const hebergeurs = await hebergeursConnus(ad);
    const resultat = {};
    const taches = [];
    for (const l of new Set(liens)) {
      const connu = etatConnu(l);
      if (connu) {
        resultat[l] = connu;
        continue;
      }
      const type = classerLien(l, hebergeurs)?.type;
      if (type !== 'hebergeur' && type !== 'protege') resultat[l] = { dispo: null, message: "Ne peut pas être vérifié avant l'envoi." };
      else if (type === 'protege' && inutile(l, hebergeurs)) resultat[l] = NON_GERE;
      else {
        resultat[l] = null;
        taches.push(verifierUn(ad, l, type).then((etat) => (resultat[l] = etat)));
      }
    }
    const tout = Promise.all(taches);
    if (attente > 0) {
      tout.catch(() => {});
      let minuterie;
      await Promise.race([tout, new Promise((r) => (minuterie = setTimeout(r, attente)))]).finally(() => clearTimeout(minuterie));
    } else await tout;
    for (const l of Object.keys(resultat)) resultat[l] ||= { dispo: null, enCours: true, message: 'AllDebrid ouvre encore ce lien protégé…' };
    return resultat;
  } catch (e) {
    if (e instanceof ErreurRecherche) throw e;
    throw new ErreurRecherche(`Vérification impossible : ${e.message}`);
  }
}

// ---------- fiches ----------

// Page d'une fiche, gardée 10 min : la liste de résultats et la fiche ouverte lisent la même.
const pages = new Map();
export function sourcesFiche(site, adresse, { ad } = {}) {
  const cle = `${site}\n${adresse}`;
  const c = pages.get(cle);
  if (c && Date.now() < c.expire) return c.promesse;
  const promesse = sourcesDe(site, adresse, { ad }).then((r) => {
    retenirAnnonces(r.sources);
    return r;
  });
  pages.set(cle, { promesse, expire: Date.now() + DUREES.page });
  promesse.catch(() => pages.get(cle)?.promesse === promesse && pages.delete(cle));
  if (pages.size > 400) pages.delete(pages.keys().next().value);
  return promesse;
}

// Pas plus de quelques pages du site à la fois : on le ménage.
const fileLectures = [];
let lectures = 0;
async function lectureSite(travail) {
  while (lectures >= reglages.lecturesSite) await new Promise((r) => fileLectures.push(r));
  lectures++;
  try {
    return await travail();
  } finally {
    lectures--;
    fileLectures.shift()?.();
  }
}

// Liens qui résument une fiche : jamais le streaming ; pour une série, ceux du premier épisode
// (un par hébergeur) ; sinon 20 liens au plus.
export function echantillon(sources) {
  const dl = sources.filter((s) => (s.type === 'hebergeur' || s.type === 'protege') && !s.streaming);
  const avecEpisode = dl.filter((s) => s.episode != null);
  if (new Set(avecEpisode.map((s) => s.episode)).size > 1) {
    const premier = Math.min(...avecEpisode.map((s) => s.episode));
    return { liens: avecEpisode.filter((s) => s.episode === premier), episode: premier };
  }
  return { liens: dl.slice(0, 20), episode: null };
}

async function juger(site, adresse, ad, annule) {
  let fiche;
  let hebergeurs;
  try {
    [fiche, hebergeurs] = await Promise.all([lectureSite(() => sourcesFiche(site, adresse, { ad })), hebergeursConnus(ad)]);
  } catch (e) {
    return { etat: 'inconnu', erreur: e.message };
  }
  if (annule()) return null;
  const { liens, episode } = echantillon(fiche.sources);
  const autres = fiche.sources.filter((s) => s.type === 'magnet' || s.type === 'torrent').length;
  const connus = new Map();
  const aTester = [];
  for (const s of liens) {
    const connu = etatConnu(s.url);
    if (connu) connus.set(s.url, connu);
    else if (s.type === 'protege' && inutile(s.url, hebergeurs)) connus.set(s.url, NON_GERE);
    else aTester.push(s);
  }
  aTester.sort((a, b) => interet(b) - interet(a));
  const enLigne = () => [...connus.values()].find((e) => e.dispo);

  // Un lien après l'autre, le suivant partant si le précédent tarde ; on s'arrête au premier en ligne.
  let panne = null;
  if (!enLigne() && aTester.length) {
    await new Promise((fin) => {
      let i = 0;
      let enVol = 0;
      let fini = false;
      let minuterie = null;
      const terminer = () => {
        if (fini) return;
        fini = true;
        clearTimeout(minuterie);
        fin();
      };
      const suivant = () => {
        clearTimeout(minuterie);
        if (fini) return;
        if (enLigne()) return terminer();
        if (i >= aTester.length || annule()) return void (enVol || terminer());
        const s = aTester[i++];
        enVol++;
        let parti = false;
        const surDepart = () => {
          if (parti || fini) return;
          parti = true;
          minuterie = setTimeout(suivant, reglages.decalage);
        };
        verifierUn(ad, s.url, s.type, surDepart)
          .then(
            (etat) => connus.set(s.url, etat),
            (e) => (panne ||= e),
          )
          .finally(() => {
            enVol--;
            if (enLigne() || (!enVol && (i >= aTester.length || annule()))) terminer();
            else if (!enVol) suivant();
          });
      };
      suivant();
    });
  }

  const vus = liens.map((s) => connus.get(s.url)).filter(Boolean);
  const vivant = vus.find((e) => e.dispo);
  const morts = vus.filter((e) => e.dispo === false).length;
  const etat = vivant ? 'ok' : liens.length && morts === liens.length ? 'ko' : 'inconnu';
  if (etat === 'inconnu' && (annule() || panne)) return panne ? { etat, erreur: `Vérification impossible : ${panne.message}` } : null;
  const verdict = { etat, total: liens.length, dispo: vus.filter((e) => e.dispo).length, morts, autres, episode };
  if (vivant) Object.assign(verdict, { hote: vivant.hote, nom: vivant.nom, taille: vivant.taille });
  else if (etat === 'ko') verdict.message = vus.every((e) => e.nonGere) ? 'Aucun hébergeur de cette fiche n’est pris en charge par AllDebrid.' : 'Tous les liens sont morts.';
  else verdict.message = vus.find((e) => e.dispo === null)?.message || '';
  if (etat !== 'inconnu') {
    verdicts.set(adresse, { verdict, expire: Date.now() + (etat === 'ok' ? DUREES.ficheOk : DUREES.ficheKo) });
    sauvegarderBientot();
  }
  return verdict;
}

// Verdict d'une fiche (ou null si plus personne ne l'attend). Deux demandes en même temps pour la
// même fiche partagent le même travail, qui ne s'arrête que si toutes sont abandonnées.
const fichesEnCours = new Map();
export function etatFiche(site, adresse, { ad, annule = () => false } = {}) {
  const connu = frais(verdicts, adresse, 'verdict');
  if (connu) return Promise.resolve(connu);
  let travail = fichesEnCours.get(adresse);
  if (!travail) {
    travail = { demandeurs: [] };
    travail.promesse = juger(site, adresse, ad, () => travail.demandeurs.every((f) => f())).finally(() => fichesEnCours.delete(adresse));
    fichesEnCours.set(adresse, travail);
  }
  travail.demandeurs.push(annule);
  return travail.promesse;
}

// Vérifie des fiches en parallèle ; « surVerdict » reçoit chaque verdict ({ url, etat, … }) dès qu'il est connu.
// « attente » (ms) : au-delà, les fiches dont AllDebrid ouvre encore les liens reviennent avec « enCours » ;
// leur vérification continue en arrière-plan, il suffit de les redemander.
export async function verifierFiches(site, adresses, { ad, signal, surVerdict, attente = 0 } = {}) {
  let fini = false;
  const annule = () => !!signal?.aborted;
  const enAttente = new Set(adresses);
  const tout = Promise.all(
    [...enAttente].map(async (adresse) => {
      let verdict;
      try {
        verdict = await etatFiche(site, adresse, { ad, annule });
      } catch (e) {
        verdict = { etat: 'inconnu', erreur: e.message };
      }
      if (fini || !enAttente.delete(adresse) || !verdict || annule()) return;
      surVerdict({ url: adresse, ...verdict });
    }),
  );
  if (attente > 0) {
    let minuterie;
    await Promise.race([tout, new Promise((r) => (minuterie = setTimeout(r, attente)))]).finally(() => clearTimeout(minuterie));
  } else await tout;
  fini = true;
  if (!annule()) for (const adresse of enAttente) surVerdict({ url: adresse, enCours: true });
}
