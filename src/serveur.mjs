// Ondi : petit serveur web local (PC, téléphone, télé du réseau).
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Gestionnaire } from './gestionnaire.mjs';
import { ClientAllDebrid } from './alldebrid.mjs';
import { estVideo, estEchantillon } from './classer.mjs';
import { rechercher, nouveautes, viderCacheRecherche, ErreurRecherche } from './recherche.mjs';
import { configurerDisponibilite, sourcesFiche, verifierLiens, verifierFiches } from './disponibilite.mjs';
import { tendances } from './tendances.mjs';
import { verifierCleTmdb, chercherTitres, saisonsSerie, afficheDe, ficheTmdb, ErreurMeta } from './metadonnees.mjs';
import { Profils, ErreurProfil } from './profils.mjs';
import { Bibliotheque } from './bibliotheque.mjs';
import { Lecture } from './lecture.mjs';
import { Generiques } from './generiques.mjs';
import { Avatars } from './avatars.mjs';
import { encodeurMateriel, OUTILS } from './video.mjs';
import * as miseAJour from './miseajour.mjs';
import { Sources, ErreurSource } from './sources.mjs';
import { lireProfil } from './versions.mjs';
import { Envies, ErreurEnvie } from './envies.mjs';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DONNEES = process.env.DEBRIDEUR_DONNEES || path.join(RACINE, 'donnees');
const FICHIER_CONFIG = path.join(DONNEES, 'config.json');
const PAGE = path.join(RACINE, 'public', 'index.html');

const journal = (...m) => console.log(new Date().toLocaleString('fr-FR'), ...m);

// ---------- configuration ----------

// Lit les bibliothèques Films et Séries déclarées dans Jellyfin.
function detecterJellyfin() {
  const base = path.join(process.env.ProgramData || 'C:\\ProgramData', 'Jellyfin', 'Server', 'root', 'default');
  const trouve = {};
  try {
    for (const lib of fs.readdirSync(base, { withFileTypes: true })) {
      if (!lib.isDirectory()) continue;
      const dossier = path.join(base, lib.name);
      const contenu = fs.readdirSync(dossier);
      const type = contenu.includes('movies.collection') ? 'films' : contenu.includes('tvshows.collection') ? 'series' : null;
      const lien = contenu.find((f) => f.endsWith('.mblink'));
      if (type && lien && !trouve[type]) trouve[type] = fs.readFileSync(path.join(dossier, lien), 'utf8').replace(/^\uFEFF/, '').trim();
    }
  } catch {}
  return trouve;
}

let brut = {};
try {
  brut = JSON.parse(fs.readFileSync(FICHIER_CONFIG, 'utf8'));
} catch {}
const jellyfin = detecterJellyfin();
// Sans réglage : Vidéos/Ondi/Films et …/Séries (Windows), ~/Movies/Ondi/… (Mac). Une installation d'avant le
// changement de nom garde son dossier « Débrideur » s'il existe (sinon sa bibliothèque paraîtrait vide).
const dossierParDefaut = (nom) => {
  const base = path.join(os.homedir(), process.platform === 'darwin' ? 'Movies' : 'Videos');
  const ancien = path.join(base, 'Débrideur', nom);
  return fs.existsSync(ancien) ? ancien : path.join(base, 'Ondi', nom);
};
const config = {
  port: Number(process.env.DEBRIDEUR_PORT) || brut.port || 8097,
  cleApi: brut.cleApi || '',
  dossiers: {
    films: brut.dossiers?.films || jellyfin.films || dossierParDefaut('Films'),
    series: brut.dossiers?.series || jellyfin.series || dossierParDefaut('Séries'),
    // Facultatif : vide = les mangas vont avec les séries.
    mangas: brut.dossiers?.mangas || '',
  },
  // Assistant de premier lancement terminé (une installation déjà réglée n'en a pas besoin).
  assistantFini: brut.assistantFini ?? !!brut.cleApi,
  dossierTempPerso: brut.dossierTemp || '',
  connexions: brut.connexions || 4,
  simultanes: brut.simultanes || 1,
  siteRecherche: brut.siteRecherche || '',
  tmdb: brut.tmdb || '',
  // Version voulue quand plusieurs existent (définition, langues dans le fichier, poids) : voir versions.mjs.
  profilVersions: lireProfil(brut.profilVersions),
  // Menu sous la recherche : chaque choix ajoute « &<parametre>=<valeur> » à l'adresse de recherche.
  categoriesRecherche: brut.categoriesRecherche || {
    parametre: 'p',
    choix: [
      ['films', 'Films'],
      ['series', 'Séries'],
      ['mangas', 'Mangas'],
    ],
  },
};
// Dossiers par défaut créés au premier lancement (une installation neuve chez un ami).
for (const [k, nom] of [['films', 'Films'], ['series', 'Séries']]) {
  if (config.dossiers[k] === dossierParDefaut(nom)) fs.mkdirSync(config.dossiers[k], { recursive: true });
}
const calculerTemp = () => config.dossierTempPerso || path.join(path.dirname(config.dossiers.films), '.debrideur');
config.dossierTemp = calculerTemp();

function sauverConfig() {
  fs.mkdirSync(DONNEES, { recursive: true });
  const { port, cleApi, dossiers, connexions, simultanes, dossierTempPerso, siteRecherche, categoriesRecherche, tmdb, assistantFini, profilVersions } = config;
  const sortie = { port, cleApi, dossiers, connexions, simultanes, tmdb, assistantFini, profilVersions };
  if (dossierTempPerso) sortie.dossierTemp = dossierTempPerso;
  if (siteRecherche) sortie.siteRecherche = siteRecherche;
  sortie.categoriesRecherche = categoriesRecherche;
  fs.writeFileSync(FICHIER_CONFIG, JSON.stringify(sortie, null, 2));
}
if (!fs.existsSync(FICHIER_CONFIG)) sauverConfig();

// ---------- bibliothèque, profils, lecture ----------

const bibliotheque = new Bibliotheque({ config, dossierDonnees: DONNEES, journal });
const profils = new Profils({ journal });
const lecture = new Lecture({ bibliotheque, dossierCache: path.join(DONNEES, 'cache'), journal });
const avatars = new Avatars({ dossier: path.join(DONNEES, 'avatars'), journal });

// Intro et générique de fin des épisodes : repérés sur le PC juste après l'arrivée d'un épisode (chaque relecture
// de la bibliothèque relance l'analyse des saisons qui ont changé). Pendant une lecture, le disque est lu plus
// doucement pour ne pas la gêner.
let derniereLecture = 0;
const generiques = new Generiques({
  bibliotheque,
  dossierDonnees: DONNEES,
  journal,
  occupe: () => Date.now() - derniereLecture < 90_000 || [...lecture.sessions.values()].some((s) => s.processus),
});
bibliotheque.reperes = (id) => generiques.reperes(id);
bibliotheque.surChangement = () => {
  try {
    generiques.planifier();
  } catch (e) {
    journal('Génériques : analyse non lancée', e);
  }
};

const scanner = (options) => bibliotheque.scanner(options).catch((e) => journal('Bibliothèque : scan raté', e));
// Après un téléchargement terminé, la bibliothèque est relue presque tout de suite (2 s après le dernier :
// les épisodes d'une saison qui finissent ensemble ne déclenchent qu'une lecture). Si une lecture est déjà
// en cours, on attend sa fin et on relit : le fichier qui vient d'arriver ne doit pas lui échapper.
let minuterieRescan = null;
function planifierRescan() {
  clearTimeout(minuterieRescan);
  minuterieRescan = setTimeout(async () => {
    if (bibliotheque.scan.enCours) await Promise.resolve(bibliotheque.scan.promesse).catch(() => {});
    scanner();
  }, 2000);
}
setTimeout(() => {
  scanner();
  avatars.completer();
  encodeurMateriel().then((e) => journal(`Lecture : ffmpeg ${OUTILS.ffmpeg} · encodeur ${e.nom}`));
}, 2000);
setInterval(() => scanner(), 30 * 60_000).unref();

// Sous-titres préparés à l'avance, un fichier à la fois, quand rien n'est en lecture (lecture du disque).
setInterval(() => {
  if ([...lecture.sessions.values()].some((s) => s.processus) || lecture.extractions.size || bibliotheque.scan.enCours) return;
  for (const [id, f] of Object.entries(bibliotheque.fichiers)) {
    if ((lecture.echecs.get(id) || 0) >= 2) continue;
    const pistes = (f.sonde?.sousTitres || []).filter((x) => x.texte);
    if (pistes.some((x) => !fs.existsSync(lecture.cheminVtt(id, x.index)))) {
      lecture.extraire(id);
      return;
    }
  }
}, 90_000).unref();

const gestionnaire = new Gestionnaire({ config, dossierDonnees: DONNEES, journal, surTermine: planifierRescan });
// États des liens déjà vérifiés, gardés d'un lancement à l'autre (donnees/disponibilite.json).
configurerDisponibilite({ dossier: DONNEES });
// Sources de recherche : catalogue public de descriptions de sites, sources activées, recherche groupée.
// DEBRIDEUR_CATALOGUE (essais) : une autre adresse de catalogue, avec des sites en adresse locale.
const sources = new Sources({
  dossier: DONNEES,
  journal,
  // Titre officiel d'un film ou d'une série (TMDB) : réunit les versions nommées en français et en anglais.
  identifier: async (quoi) => {
    if (!config.tmdb) return null;
    const f = await ficheTmdb(config.tmdb, quoi);
    return f.titre ? { titre: f.titre, annee: f.annee } : null;
  },
  ...(process.env.DEBRIDEUR_CATALOGUE ? { adresse: process.env.DEBRIDEUR_CATALOGUE, local: true } : {}),
});

// Liste d'envies : films et saisons voulus, cherchés régulièrement sur les sources et téléchargés tout seuls.
const envies = new Envies({ dossier: DONNEES, sources, gestionnaire, profil: () => config.profilVersions, journal });
envies.demarrer();
setTimeout(() => envies.tour(), 30_000).unref();
// Après un ajout ou « chercher maintenant » : on attend la réponse des sources, mais pas plus de quelques secondes.
const verifierEnvie = (id) => Promise.race([envies.verifier(id), new Promise((r) => setTimeout(r, 9000))]).then(() => envies.liste().find((e) => e.id === id));

let compteCache = null;
async function compte(forcer = false) {
  if (!config.cleApi) return { erreur: 'Clé API à configurer', code: 'NO_KEY' };
  if (!forcer && compteCache && Date.now() - compteCache.t < 5 * 60_000) return compteCache.v;
  let v;
  try {
    const u = await gestionnaire.ad.utilisateur();
    v = { pseudo: u.username, premium: !!u.isPremium, essai: !!u.isTrial, jusqua: u.premiumUntil ? u.premiumUntil * 1000 : null };
  } catch (e) {
    v = { erreur: e.message, code: e.code };
  }
  compteCache = { t: Date.now(), v };
  return v;
}

// ---------- profils et historique ----------

const profilDe = (req) => profils.profilDuJeton(String(req.headers['x-profil'] || ''));
function exigerProfil(req, res) {
  const moi = profilDe(req);
  if (!moi) json(res, 401, { erreur: 'Choisis un profil.' });
  return moi;
}
const langueDe = (url) => (url.searchParams.get('langue') === 'en' ? 'en' : 'fr');

// Infos en anglais demandées pour la première fois : on les récupère en arrière-plan.
const languesCompletees = new Set(['fr']);
function completerLangue(langue) {
  if (languesCompletees.has(langue) || !config.tmdb) return;
  languesCompletees.add(langue);
  bibliotheque.completerInfos({ langues: [langue] }).catch(() => languesCompletees.delete(langue));
}

// Rangée « Reprendre la lecture » : ce qui est commencé, puis l'épisode suivant des séries en cours.
function reprendre(idProfil, langue) {
  const h = profils.historique(idProfil);
  const liste = [];
  const seriesVues = new Set();
  for (const [cle, e] of Object.entries(h)) {
    if (e.vu || !e.duree || e.position < 30) continue;
    const d = bibliotheque.decrireLecture(cle, langue);
    if (!d) continue;
    liste.push({ ...d, cleLecture: cle, position: e.position, duree: e.duree, fichier: e.fichier, maj: e.maj });
    seriesVues.add(d.cle);
  }
  const vus = Object.entries(h)
    .filter(([cle, e]) => e.vu && cle.startsWith('e:'))
    .sort((a, b) => (b[1].vuLe || b[1].maj) - (a[1].vuLe || a[1].maj));
  for (const [cle, e] of vus) {
    const cleSerie = `s:${cle.split(':')[1]}`;
    if (seriesVues.has(cleSerie)) continue;
    seriesVues.add(cleSerie);
    const suivant = bibliotheque.episodeSuivant(cle);
    if (!suivant || h[suivant]?.vu) continue;
    const d = bibliotheque.decrireLecture(suivant, langue);
    if (d) liste.push({ ...d, cleLecture: suivant, position: 0, duree: 0, aSuivre: true, maj: e.vuLe || e.maj });
  }
  return liste.sort((a, b) => b.maj - a.maj).slice(0, 20);
}

// ---------- HTTP ----------

function estLocal(ip = '') {
  ip = ip.replace(/^::ffff:/, '');
  return (
    ip === '::1' ||
    /^127\./.test(ip) ||
    /^10\./.test(ip) ||
    /^192\.168\./.test(ip) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ||
    /^169\.254\./.test(ip) ||
    /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(ip) ||
    /^f[cd]/i.test(ip) ||
    /^fe80/i.test(ip)
  );
}

function adressesReseau() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((a) => a && a.family === 'IPv4' && !a.internal && !a.address.startsWith('169.254.'))
    .map((a) => a.address);
}

function json(res, statut, donnees) {
  res.writeHead(statut, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(donnees));
}

function lireCorps(req, max) {
  return new Promise((ok, ko) => {
    const morceaux = [];
    let n = 0;
    req.on('data', (c) => {
      n += c.length;
      if (n > max) {
        ko(new Error('Contenu trop gros.'));
        req.destroy();
      } else morceaux.push(c);
    });
    req.on('end', () => ok(Buffer.concat(morceaux)));
    req.on('error', ko);
  });
}

async function lireJson(req) {
  const b = await lireCorps(req, 1e6);
  try {
    return JSON.parse(b.toString('utf8') || '{}');
  } catch {
    throw new Error('JSON invalide.');
  }
}

// Bloque les requêtes envoyées par un autre site ouvert dans le navigateur.
function requeteAutorisee(req) {
  const origine = req.headers.origin;
  if (origine) {
    try {
      if (new URL(origine).host !== req.headers.host) return false;
    } catch {
      return false;
    }
  }
  const type = (req.headers['content-type'] || '').split(';')[0].trim();
  return type === 'application/json' || type === 'application/x-bittorrent';
}

const nombreDe = (v) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 && n < 10000 ? n : null;
};

function configPublique() {
  return {
    cle: !!config.cleApi,
    cleFin: config.cleApi ? config.cleApi.slice(-4) : '',
    dossiers: config.dossiers,
    dossierTemp: config.dossierTemp,
    connexions: config.connexions,
    simultanes: config.simultanes,
    siteRecherche: config.siteRecherche,
    categoriesRecherche: config.categoriesRecherche,
    tmdb: !!config.tmdb,
    tmdbFin: config.tmdb ? config.tmdb.slice(-4) : '',
    profilVersions: config.profilVersions,
    // Nombre de sources de recherche activées (la page n'interroge les sources que s'il y en a).
    sources: sources.etat.sources.length,
    assistantFini: !!config.assistantFini,
    version: miseAJour.VERSION,
    systeme: process.platform,
  };
}

// ---------- dossiers du serveur (choix des dossiers depuis la page, même à la télécommande) ----------

function racinesDisques() {
  const raccourcis = [];
  const maison = os.homedir();
  const ajouter = (nom, chemin) => {
    try {
      if (chemin && fs.statSync(chemin).isDirectory() && !raccourcis.some((r) => r.chemin === chemin)) raccourcis.push({ nom, chemin });
    } catch {}
  };
  ajouter('Dossier personnel', maison);
  ajouter('Vidéos', path.join(maison, process.platform === 'darwin' ? 'Movies' : 'Videos'));
  ajouter('Bureau', path.join(maison, 'Desktop'));
  if (process.platform === 'win32') for (const l of 'CDEFGHIJKLMNOPQRSTUVWXYZ') ajouter(`Disque ${l}:`, `${l}:${path.sep}`);
  else if (process.platform === 'darwin') {
    try {
      for (const v of fs.readdirSync('/Volumes')) ajouter(v, path.join('/Volumes', v));
    } catch {}
  } else ajouter('Racine', '/');
  return raccourcis;
}

function listerDossier(chemin) {
  const d = path.resolve(chemin || os.homedir());
  const dossiers = fs
    .readdirSync(d, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !/^[.$]/.test(e.name) && !/^(System Volume Information|Windows|ProgramData|Program Files.*|AppData|node_modules)$/i.test(e.name))
    .map((e) => ({ nom: e.name, chemin: path.join(d, e.name) }))
    .sort((a, b) => a.nom.localeCompare(b.nom, 'fr', { sensitivity: 'base' }));
  const parent = path.dirname(d);
  return { chemin: d, parent: parent !== d ? parent : null, dossiers, racines: racinesDisques() };
}

// Erreurs prévues (site injoignable, rien trouvé…) → 400 ; bugs → journal + 500.
async function repondreRecherche(res, travail) {
  try {
    return json(res, 200, await travail());
  } catch (e) {
    const prevue = e instanceof ErreurRecherche || e instanceof ErreurSource || e instanceof ErreurEnvie || e instanceof ErreurMeta;
    if (!prevue) journal('Erreur recherche', e);
    return json(res, prevue ? 400 : 500, { erreur: e.message });
  }
}

const serveur = http.createServer(async (req, res) => {
  if (!estLocal(req.socket.remoteAddress)) {
    res.writeHead(403);
    return res.end('Accès réservé au réseau local.');
  }
  const url = new URL(req.url, 'http://local');
  const p = url.pathname;
  try {
    if (req.method === 'GET' && (p === '/' || p === '/index.html')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
      return fs.createReadStream(PAGE).pipe(res);
    }
    // Scripts, styles, icônes et manifeste de la page (public/).
    const fichierPage = req.method === 'GET' && p.match(/^\/app\/([a-z0-9-]+\.(js|css|png|svg|webmanifest))$/);
    if (fichierPage && fs.existsSync(path.join(RACINE, 'public', fichierPage[1]))) {
      const types = { js: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8', png: 'image/png', svg: 'image/svg+xml', webmanifest: 'application/manifest+json' };
      res.writeHead(200, { 'Content-Type': types[fichierPage[2]], 'Cache-Control': 'no-cache' });
      return fs.createReadStream(path.join(RACINE, 'public', fichierPage[1])).pipe(res);
    }
    const avatar = req.method === 'GET' && p.match(/^\/avatars\/([a-z-]+-\d+)\.svg$/);
    if (avatar) return avatars.envoyer(avatar[1], res);
    // Vidéo : flux converti, fichier direct (avec avance rapide), sous-titres.
    const flux = req.method === 'GET' && p.match(/^\/api\/flux\/([\w-]+)\.mp4$/);
    if (flux) {
      derniereLecture = Date.now();
      return lecture.flux(flux[1], req, res);
    }
    const direct = (req.method === 'GET' || req.method === 'HEAD') && p.match(/^\/api\/direct\/([a-f0-9]+)$/);
    if (direct) {
      derniereLecture = Date.now();
      return lecture.direct(direct[1], req, res);
    }
    const vtt = req.method === 'GET' && p.match(/^\/api\/soustitres\/([a-f0-9]+)\/(\d+|ext\d+)\.vtt$/);
    if (vtt) return lecture.sousTitres(vtt[1], vtt[2], res);
    if (!p.startsWith('/api/')) {
      res.writeHead(404);
      return res.end();
    }
    if (req.method === 'GET') {
      // Ouvert à toutes les origines : l'application télé (locale) s'en sert pour trouver le serveur.
      if (p === '/api/ping') {
        res.setHeader('Access-Control-Allow-Origin', '*');
        return json(res, 200, { app: 'debrideur', ok: true });
      }
      if (p === '/api/etat') {
        // Téléchargement fini et rangé : où le lire, pour le lancer depuis la recherche sans passer par la bibliothèque.
        const jobs = gestionnaire.instantane().map((j) =>
          j.etat !== 'termine' ? j : { ...j, fichiers: j.fichiers.map((f) => ({ ...f, lecture: f.dest ? bibliotheque.lectureDeChemin(f.dest) : null })) },
        );
        return json(res, 200, { jobs, config: configPublique(), adresses: adressesReseau(), port: config.port });
      }
      if (p === '/api/compte') return json(res, 200, await compte(url.searchParams.has('frais')));
      if (p === '/api/recherche') {
        const q = (url.searchParams.get('q') || '').trim().slice(0, 200);
        if (!q) return json(res, 400, { erreur: 'Tape ce que tu cherches.' });
        const page = Math.min(500, Math.max(1, parseInt(url.searchParams.get('page'), 10) || 1));
        const { parametre, choix = [] } = config.categoriesRecherche || {};
        const cat = url.searchParams.get('cat');
        const categorie = parametre && choix.some(([v]) => v === cat) ? { nom: parametre, valeur: cat } : null;
        return repondreRecherche(res, () => rechercher(config.siteRecherche, q, { page, categorie }));
      }
      if (p === '/api/tendances') {
        const type = url.searchParams.get('type') === 'series' ? 'series' : 'films';
        return json(res, 200, { rangees: await tendances(type) });
      }
      if (p === '/api/accueil') {
        const { parametre, choix = [] } = config.categoriesRecherche || {};
        const cat = url.searchParams.get('cat');
        const categorie = parametre && choix.some(([v]) => v === cat) ? { nom: parametre, valeur: cat } : null;
        return repondreRecherche(res, () => nouveautes(config.siteRecherche, { categorie }));
      }
      if (p === '/api/recherche/sources') {
        return repondreRecherche(res, () => sourcesFiche(config.siteRecherche, url.searchParams.get('url') || '', { ad: gestionnaire.ad }));
      }
      // Sources de recherche : celles qui sont activées, le catalogue, le formulaire d'une source, la recherche groupée.
      if (p === '/api/sources') return repondreRecherche(res, async () => ({ actives: await sources.actives(), profil: config.profilVersions }));
      if (p === '/api/sources/catalogue') return repondreRecherche(res, () => sources.catalogue({ frais: url.searchParams.has('frais') }));
      if (p === '/api/sources/reglages') return repondreRecherche(res, () => sources.formulaire(url.searchParams.get('id') || ''));
      if (p === '/api/sources/recherche') {
        const q = (url.searchParams.get('q') || '').trim().slice(0, 200);
        if (!q) return json(res, 400, { erreur: 'Tape ce que tu cherches.' });
        const nombre = (cle) => {
          const n = parseInt(url.searchParams.get(cle), 10);
          return Number.isFinite(n) && n >= 0 && n < 10000 ? n : null;
        };
        const type = { film: 'film', serie: 'serie' }[url.searchParams.get('type')] || null;
        const demande = { q, type, saison: nombre('saison'), episode: nombre('episode'), annee: nombre('annee') };
        if (!url.searchParams.has('flux')) return repondreRecherche(res, () => sources.rechercher(demande, { profil: config.profilVersions }));
        // En flux : une ligne JSON dès qu'une source a répondu (la page affiche sans attendre les plus lentes),
        // la dernière avec « fini ». Page fermée ou nouvelle recherche : on arrête.
        const abandon = new AbortController();
        let termine = false;
        res.on('close', () => termine || abandon.abort());
        res.writeHead(200, { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' });
        try {
          const final = await sources.rechercher(demande, { profil: config.profilVersions, signal: abandon.signal, surProgres: (r) => res.write(`${JSON.stringify(r)}\n`) });
          res.write(`${JSON.stringify({ ...final, fini: true })}\n`);
        } catch (e) {
          if (!abandon.signal.aborted) {
            if (!(e instanceof ErreurSource)) journal('Erreur recherche sur les sources', e);
            res.write(`${JSON.stringify({ erreur: e instanceof ErreurSource ? e.message : 'La recherche sur les sources a échoué.', fini: true })}\n`);
          }
        }
        termine = true;
        return res.end();
      }
      // Les versions d'un film ou d'une série précis (onglet « Sources » de sa fiche) : cherché sous son titre
      // affiché et, si TMDB le connaît, sous ses titres français et original.
      if (p === '/api/sources/contenu') {
        const titre = (url.searchParams.get('titre') || '').trim().slice(0, 200);
        if (!titre) return json(res, 400, { erreur: 'Titre manquant.' });
        const type = url.searchParams.get('type') === 'serie' ? 'serie' : 'film';
        const annee = nombreDe(url.searchParams.get('annee'));
        return repondreRecherche(res, async () => {
          let connus = [];
          try {
            const fiche = await ficheTmdb(config.tmdb, { titre, annee, type });
            connus = [fiche.titre, fiche.titreOriginal];
          } catch {}
          const titres = [...new Set([titre, ...connus].filter(Boolean))];
          return { ...(await sources.contenu({ titres, annee, type }, { profil: config.profilVersions })), titres };
        });
      }
      // Dernières sorties des sources (pour l'accueil), gardées une demi-heure.
      if (p === '/api/sources/nouveautes') {
        const type = { film: 'film', serie: 'serie' }[url.searchParams.get('type')] || null;
        return repondreRecherche(res, () => sources.nouveautes(type, { profil: config.profilVersions }));
      }
      // Affiche d'un film ou d'une série trouvés sur les sources : renvoi vers l'image de TMDB (404 si inconnue).
      if (p === '/api/sources/affiche') {
        let adresse = '';
        try {
          adresse = await afficheDe(config.tmdb, { titre: (url.searchParams.get('titre') || '').slice(0, 200), annee: nombreDe(url.searchParams.get('annee')), type: url.searchParams.get('type') === 'serie' ? 'serie' : 'film' });
        } catch {}
        if (!adresse) {
          res.writeHead(404, { 'Cache-Control': 'max-age=600' });
          return res.end();
        }
        res.writeHead(302, { Location: adresse, 'Cache-Control': 'max-age=86400' });
        return res.end();
      }
      // Liste d'envies : la liste, les films et séries qui portent un nom, les saisons d'une série.
      if (p === '/api/envies') return json(res, 200, { envies: envies.liste(), sources: sources.etat.sources.length, tmdb: !!config.tmdb, profil: config.profilVersions });
      if (p === '/api/envies/titres') {
        const q = (url.searchParams.get('q') || '').trim().slice(0, 200);
        if (!q) return json(res, 400, { erreur: 'Tape un titre.' });
        return repondreRecherche(res, async () => ({ tmdb: !!config.tmdb, titres: await chercherTitres(config.tmdb, q, langueDe(url) === 'en' ? 'en-US' : 'fr-FR') }));
      }
      if (p === '/api/envies/saisons') {
        const id = parseInt(url.searchParams.get('tmdb'), 10);
        if (!config.tmdb || !(id > 0)) return json(res, 200, { saisons: [] });
        return repondreRecherche(res, async () => ({ saisons: await saisonsSerie(config.tmdb, id, langueDe(url) === 'en' ? 'en-US' : 'fr-FR') }));
      }
      if (p === '/api/magnets') {
        try {
          const liste = await gestionnaire.ad.magnetsPrets();
          let fichiers = new Map();
          try {
            fichiers = await gestionnaire.ad.fichiersDeMagnets(liste.map((m) => m.id));
          } catch {}
          const magnets = liste
            .map((m) => {
              const f = fichiers.get(String(m.id));
              return {
                id: m.id,
                nom: m.filename,
                taille: Number(m.size) || 0,
                date: (m.completionDate || m.uploadDate || 0) * 1000,
                videos: f ? f.filter((x) => estVideo(x.nom) && !estEchantillon(x.chemin)).length : null,
              };
            })
            .sort((a, b) => b.date - a.date);
          return json(res, 200, { magnets });
        } catch (e) {
          return json(res, 400, { erreur: e.message });
        }
      }
      if (p === '/api/version') return json(res, 200, await miseAJour.etat({ forcer: url.searchParams.has('frais') }));
      if (p === '/api/dossiers') {
        try {
          return json(res, 200, listerDossier(url.searchParams.get('chemin')));
        } catch (e) {
          return json(res, 400, { erreur: `Dossier illisible : ${e.message}` });
        }
      }
      // ----- profils, bibliothèque, historique -----
      if (p === '/api/profils') return json(res, 200, { profils: profils.liste(), avatars: avatars.disponibles() });
      if (p === '/api/moi') {
        const moi = profilDe(req);
        return moi ? json(res, 200, { profil: moi }) : json(res, 401, { erreur: 'Choisis un profil.' });
      }
      if (p === '/api/bibliotheque') {
        const langue = langueDe(url);
        completerLangue(langue);
        return json(res, 200, bibliotheque.catalogue(langue));
      }
      if (p === '/api/bibliotheque/element') {
        const langue = langueDe(url);
        const fiche = bibliotheque.element(url.searchParams.get('cle') || '', langue);
        if (!fiche) return json(res, 404, { erreur: 'Introuvable dans la bibliothèque.' });
        const moi = profilDe(req);
        if (moi) {
          const h = profils.historique(moi.id);
          const cles = fiche.type === 'film' ? [fiche.cleLecture] : fiche.saisons.flatMap((s) => s.episodes.map((e) => e.cleLecture));
          fiche.historique = Object.fromEntries(cles.filter((c) => h[c]).map((c) => [c, h[c]]));
        }
        return json(res, 200, fiche);
      }
      if (p === '/api/historique') {
        const moi = exigerProfil(req, res);
        if (!moi) return;
        return json(res, 200, { historique: profils.historique(moi.id) });
      }
      if (p === '/api/reprendre') {
        const moi = exigerProfil(req, res);
        if (!moi) return;
        return json(res, 200, { elements: reprendre(moi.id, langueDe(url)) });
      }
      return json(res, 404, { erreur: 'Inconnu.' });
    }
    if (!requeteAutorisee(req)) return json(res, 403, { erreur: 'Requête refusée.' });

    if (req.method === 'POST' && p.startsWith('/api/profils')) {
      const b = await lireJson(req);
      try {
        if (p === '/api/profils') return json(res, 200, { profil: profils.creer(b) });
        if (p === '/api/profils/connexion') return json(res, 200, profils.connecter(String(b.id || ''), b.motDePasse));
        const moi = exigerProfil(req, res);
        if (!moi) return;
        if (p === '/api/profils/deconnexion') {
          profils.deconnecter(req.headers['x-profil']);
          return json(res, 200, { ok: true });
        }
        if (p === '/api/profils/modifier') return json(res, 200, { profil: profils.modifier(moi.id, b) });
        if (p === '/api/profils/supprimer') {
          profils.supprimer(moi.id);
          return json(res, 200, { ok: true });
        }
      } catch (e) {
        if (e instanceof ErreurProfil) return json(res, e.statut, { erreur: e.message });
        throw e;
      }
    }
    if (req.method === 'POST' && p === '/api/historique/position') {
      const moi = exigerProfil(req, res);
      if (!moi) return;
      const b = await lireJson(req);
      if (typeof b.cle !== 'string' || !/^[fe]:/.test(b.cle)) return json(res, 400, { erreur: 'Clé de lecture invalide.' });
      return json(res, 200, { entree: profils.enregistrerPosition(moi.id, b.cle, b), suivant: bibliotheque.episodeSuivant(b.cle) });
    }
    if (req.method === 'POST' && p === '/api/historique/vu') {
      const moi = exigerProfil(req, res);
      if (!moi) return;
      const b = await lireJson(req);
      const cles = [].concat(b.cles || []).filter((c) => typeof c === 'string' && /^[fe]:/.test(c)).slice(0, 500);
      profils.marquerVu(moi.id, cles, b.vu !== false);
      return json(res, 200, { ok: true });
    }
    if (req.method === 'POST' && p === '/api/lecture') {
      const b = await lireJson(req);
      try {
        return json(res, 200, await lecture.preparer(b));
      } catch (e) {
        return json(res, 400, { erreur: e.message });
      }
    }
    // Le lecteur signale ce qu'il a dû rattraper (position figée, flux coupé avant la fin) : noté dans le journal
    // pour comprendre ce qui se passe sur une télé qu'on ne peut pas observer.
    if (req.method === 'POST' && p === '/api/lecture/journal') {
      const b = await lireJson(req);
      const texte = (x, n) => String(x ?? '').replace(/[^\p{L}\p{N} .,:;'()/+-]/gu, ' ').slice(0, n);
      const h = Math.max(0, Math.round(Number(b.position) || 0));
      const heure = `${Math.floor(h / 3600)}:${String(Math.floor(h / 60) % 60).padStart(2, '0')}:${String(h % 60).padStart(2, '0')}`;
      journal(`Lecteur${b.tele ? ' (télé)' : ''} : ${texte(b.quoi, 120)} à ${heure} (${texte(b.mode, 12)})`);
      return json(res, 200, { ok: true });
    }
    if (req.method === 'POST' && p === '/api/bibliotheque/scanner') {
      const b = await lireJson(req);
      scanner({ forcerMeta: !!b.infos });
      return json(res, 200, { ok: true });
    }

    if (req.method === 'POST' && p === '/api/jobs') {
      const b = await lireJson(req);
      if (b.magnetId) return json(res, 200, { ajoutes: [gestionnaire.ajouterMagnetExistant(b.magnetId, b.titre, b.mode)], refuses: [] });
      if (Array.isArray(b.liens)) return json(res, 200, gestionnaire.ajouterLiens(b.liens, b.mode));
      return json(res, 200, gestionnaire.ajouterSources(b.sources, b.mode));
    }
    if (req.method === 'POST' && p === '/api/recherche/verifier') {
      const b = await lireJson(req);
      const liens = (Array.isArray(b.liens) ? b.liens : []).filter((l) => typeof l === 'string' && /^https?:\/\//i.test(l)).slice(0, 80);
      // 12 s au plus : les liens qu'AllDebrid ouvre encore reviennent « enCours », la page les redemande.
      return repondreRecherche(res, async () => ({ etats: await verifierLiens(gestionnaire.ad, liens, { attente: 12_000 }) }));
    }
    // État des fiches (au moins un lien en ligne ? tous morts ?) : une ligne JSON par fiche, envoyée
    // dès que son verdict est connu, pour que la liste se mette à jour au fil de l'eau.
    if (req.method === 'POST' && p === '/api/recherche/fiches') {
      const b = await lireJson(req);
      const urls = [...new Set((Array.isArray(b.urls) ? b.urls : []).filter((u) => typeof u === 'string' && /^https?:\/\//i.test(u)))].slice(0, 60);
      // Page fermée avant la fin : on arrête. Sinon 20 s au plus par demande : les fiches dont AllDebrid
      // ouvre encore les liens reviennent « enCours » (elles continuent ici), la page les redemande.
      const abandon = new AbortController();
      let termine = false;
      res.on('close', () => termine || abandon.abort());
      res.writeHead(200, { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' });
      try {
        await verifierFiches(config.siteRecherche, urls, {
          ad: gestionnaire.ad,
          signal: abandon.signal,
          attente: 20_000,
          surVerdict: (verdict) => res.write(`${JSON.stringify(verdict)}\n`),
        });
      } catch (e) {
        journal('Erreur vérification des fiches', e);
      }
      termine = true;
      return res.end();
    }
    // Activer une source ou changer ses réglages : elle est essayée tout de suite, pour dire si ça marche.
    if (req.method === 'POST' && p === '/api/sources') {
      const b = await lireJson(req);
      return repondreRecherche(res, async () => {
        const id = String(b.id || '');
        await sources.enregistrer(id, { valeurs: b.valeurs && typeof b.valeurs === 'object' ? b.valeurs : {}, lien: typeof b.lien === 'string' ? b.lien : '' });
        let essai;
        try {
          essai = await sources.essayer(id);
        } catch (e) {
          if (!(e instanceof ErreurSource)) journal(`Sources : essai de ${id}`, e);
          essai = { erreur: e instanceof ErreurSource ? e.message : 'La réponse du site n’a pas été comprise.' };
        }
        journal(`Sources : ${id} activée (${essai.erreur || `${essai.versions} versions à l'essai`})`);
        return { ok: true, essai, actives: await sources.actives() };
      });
    }
    if (req.method === 'POST' && p === '/api/sources/retirer') {
      const b = await lireJson(req);
      sources.retirer(String(b.id || ''));
      return repondreRecherche(res, async () => ({ ok: true, actives: await sources.actives() }));
    }
    if (req.method === 'POST' && p === '/api/sources/essayer') {
      const b = await lireJson(req);
      return repondreRecherche(res, () => sources.essayer(String(b.id || '')));
    }
    // Envoyer une version trouvée par la recherche groupée : son magnet ou son fichier .torrent part au débrideur.
    if (req.method === 'POST' && p === '/api/sources/envoyer') {
      const b = await lireJson(req);
      return repondreRecherche(res, async () => {
        const idVersion = String(b.id || '');
        const lien = await sources.lienDe(idVersion);
        let r;
        if (lien.magnet) r = gestionnaire.ajouterSources(lien.magnet, b.mode || undefined);
        else {
          try {
            r = { ajoutes: [await gestionnaire.ajouterTorrent(lien.nom, lien.torrent, b.mode || undefined)], refuses: [] };
          } catch (e) {
            throw new ErreurSource(e.message);
          }
        }
        if (r.ajoutes[0]) sources.noterEnvoi(idVersion, r.ajoutes[0]);
        return r;
      });
    }
    // Liste d'envies : ajouter (la recherche part tout de suite), chercher maintenant, retirer.
    if (req.method === 'POST' && p === '/api/envies') {
      const b = await lireJson(req);
      return repondreRecherche(res, async () => ({ envie: await verifierEnvie(envies.ajouter(b).id), envies: envies.liste() }));
    }
    if (req.method === 'POST' && p === '/api/envies/verifier') {
      const b = await lireJson(req);
      return repondreRecherche(res, async () => {
        const e = envies.trouver(String(b.id || ''));
        if (e.etat === 'attente') e.prochaine = Date.now();
        return { envie: await verifierEnvie(e.id), envies: envies.liste() };
      });
    }
    if (req.method === 'POST' && p === '/api/envies/retirer') {
      const b = await lireJson(req);
      envies.retirer(String(b.id || ''));
      return json(res, 200, { ok: true, envies: envies.liste() });
    }
    if (req.method === 'POST' && p === '/api/torrent') {
      const donnees = await lireCorps(req, 10e6);
      const nom = url.searchParams.get('nom') || 'fichier.torrent';
      try {
        const id = await gestionnaire.ajouterTorrent(nom, donnees, url.searchParams.get('mode'));
        return json(res, 200, { ajoutes: [id], refuses: [] });
      } catch (e) {
        return json(res, 400, { erreur: e.message });
      }
    }
    // Bouton « Arrêter Ondi » des Réglages : on répond, puis on s'arrête proprement
    // (état sauvegardé : les téléchargements reprendront au prochain lancement).
    if (req.method === 'POST' && p === '/api/mise-a-jour') {
      try {
        const r = await miseAJour.installer({ journal, arreter });
        return json(res, 200, { ok: true, ...r });
      } catch (e) {
        journal(`Mise à jour impossible : ${e.message}`);
        return json(res, 400, { erreur: `Mise à jour impossible : ${e.message}` });
      }
    }
    if (req.method === 'POST' && p === '/api/dossiers/creer') {
      const b = await lireJson(req);
      const nom = String(b.nom || '').trim();
      if (!nom || /[\\/:*?"<>|]/.test(nom) || nom === '.' || nom === '..') return json(res, 400, { erreur: 'Nom de dossier invalide.' });
      try {
        const d = path.join(path.resolve(String(b.parent || '')), nom);
        fs.mkdirSync(d, { recursive: true });
        return json(res, 200, listerDossier(d));
      } catch (e) {
        return json(res, 400, { erreur: `Création impossible : ${e.message}` });
      }
    }
    if (req.method === 'POST' && p === '/api/arreter') {
      journal('Arrêt demandé depuis la page');
      json(res, 200, { ok: true });
      setTimeout(arreter, 300);
      return;
    }
    if (req.method === 'POST' && p === '/api/nettoyer') {
      await gestionnaire.retirerTermines();
      return json(res, 200, { ok: true });
    }
    if (req.method === 'POST' && p === '/api/config') {
      const b = await lireJson(req);
      if (typeof b.cleApi === 'string' && b.cleApi.trim()) {
        const cle = b.cleApi.trim();
        try {
          await new ClientAllDebrid(() => cle).utilisateur();
        } catch (e) {
          return json(res, 400, { erreur: e.message });
        }
        config.cleApi = cle;
        compteCache = null;
      }
      if (typeof b.mangas === 'string' && !b.mangas.trim()) config.dossiers.mangas = '';
      for (const k of ['films', 'series', 'mangas']) {
        if (typeof b[k] !== 'string' || !b[k].trim()) continue;
        const d = path.resolve(b[k].trim());
        if (!fs.existsSync(d) || !fs.statSync(d).isDirectory()) return json(res, 400, { erreur: `Dossier introuvable : ${d}` });
        config.dossiers[k] = d;
      }
      if (typeof b.siteRecherche === 'string') {
        let s = b.siteRecherche.trim();
        if (s && !/^https?:\/\//i.test(s)) s = `https://${s}`;
        if (s) {
          let u = null;
          try {
            u = new URL(s.replace(/\{q\}/g, 'x'));
          } catch {}
          if (!u || !/^https?:$/.test(u.protocol) || (!u.hostname.includes('.') && u.hostname !== 'localhost')) {
            return json(res, 400, { erreur: `Adresse du site de recherche invalide : ${s}` });
          }
        }
        if (s !== config.siteRecherche) viderCacheRecherche();
        config.siteRecherche = s;
      }
      // AllDebrid ne publie pas de limite de connexions par fichier : si un serveur en refuse,
      // le téléchargeur ferme les connexions en trop tout seul.
      const dossiersAvant = JSON.stringify(config.dossiers);
      const tmdbAvant = config.tmdb;
      if (typeof b.tmdb === 'string' && b.tmdb.trim()) {
        const cle = b.tmdb.trim().replace(/^Bearer\s+/i, '');
        try {
          await verifierCleTmdb(cle);
        } catch (e) {
          return json(res, 400, { erreur: /refusée/.test(e.message) ? e.message : `TMDB injoignable : ${e.message}` });
        }
        config.tmdb = cle;
        journal('Clé TMDB enregistrée');
      }
      if (b.connexions) config.connexions = Math.min(16, Math.max(1, parseInt(b.connexions, 10) || 4));
      if (b.simultanes) {
        config.simultanes = Math.min(8, Math.max(1, parseInt(b.simultanes, 10) || 1));
        gestionnaire.ajusterCreneaux();
      }
      if (b.assistantFini === true) config.assistantFini = true;
      if (b.profilVersions && typeof b.profilVersions === 'object') config.profilVersions = lireProfil(b.profilVersions);
      config.dossierTemp = calculerTemp();
      sauverConfig();
      // Nouveaux dossiers ou nouvelle clé TMDB : la bibliothèque est relue (et ses infos complétées).
      if (JSON.stringify(config.dossiers) !== dossiersAvant || config.tmdb !== tmdbAvant) scanner({ forcerMeta: config.tmdb !== tmdbAvant });
      return json(res, 200, { ok: true, config: configPublique() });
    }
    const m = p.match(/^\/api\/jobs\/([a-f0-9]+)(?:\/(annuler|relancer))?$/);
    if (m && req.method === 'POST' && m[2] === 'annuler') return json(res, 200, { ok: gestionnaire.annuler(m[1]) });
    if (m && req.method === 'POST' && m[2] === 'relancer') return json(res, 200, { ok: gestionnaire.relancer(m[1]) });
    if (m && req.method === 'DELETE' && !m[2]) return json(res, 200, { ok: await gestionnaire.retirer(m[1]) });
    return json(res, 404, { erreur: 'Inconnu.' });
  } catch (e) {
    journal('Erreur requête', req.method, p, e);
    if (!res.headersSent) json(res, 500, { erreur: e.message });
  }
});

serveur.on('error', (e) => {
  journal(e.code === 'EADDRINUSE' ? `Le port ${config.port} est déjà pris (Ondi déjà lancé ?)` : e);
  process.exit(1);
});

serveur.listen(config.port, () => {
  journal(`Ondi prêt : http://localhost:${config.port}`);
  for (const a of adressesReseau()) journal(`  sur le réseau : http://${a}:${config.port}`);
  journal(`Films → ${config.dossiers.films} | Séries → ${config.dossiers.series} | temporaire → ${config.dossierTemp}`);
  // Lancé tel quel depuis l'appli de bureau Claude (pas par lancer.mjs) : %APPDATA% y est une copie
  // privée, donc ces profils ne sont pas ceux du serveur lancé au démarrage de Windows.
  const e = process.env;
  if (process.platform === 'win32' && !e.DEBRIDEUR_PROFILS && !e.DEBRIDEUR_HORS_BULLE && (e.CLAUDECODE || e.CLAUDE_CODE_DESKTOP_APP_VERSION)) {
    journal(`Attention : Ondi tourne dans l'appli Claude, qui voit une copie privée de ${profils.dossier} : les profils peuvent différer. Relance-le avec « node lancer.mjs ».`);
  }
});

const arreter = () => {
  try {
    gestionnaire.sauverMaintenant();
  } catch {}
  try {
    profils.sauverTout();
    lecture.arreterTout();
    generiques.arreter();
  } catch {}
  process.exit(0);
};
process.on('SIGINT', arreter);
process.on('SIGTERM', arreter);
process.on('SIGBREAK', arreter);
