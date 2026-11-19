// Mise à jour automatique depuis GitHub (dernière « release » du dépôt public).
//   - installation par paquet (chez un ami) : télécharge le zip de la plateforme, vérifie son empreinte SHA-256,
//     remplace les fichiers du programme (jamais donnees/, runtime/), puis redémarre ;
//   - dossier de développement (avec .git) : « git pull » si rien n'est modifié.
// Les applications télé n'ont presque jamais besoin d'être réinstallées : leur interface vient du serveur.
import { spawn, execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lireZip } from './zip.mjs';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PAQUET = JSON.parse(fs.readFileSync(path.join(RACINE, 'package.json'), 'utf8'));
export const VERSION = PAQUET.version;
const DEPOT = process.env.DEBRIDEUR_DEPOT || PAQUET.debrideur?.depot || 'Ishine93/Debrideur';
// Jamais touchés par une mise à jour : réglages, clés, historique, Node.js et ffmpeg installés.
const PROTEGES = [/^donnees\//, /^runtime\//, /^outils\/ffmpeg\//, /^\.git\//];

export function comparerVersions(a, b) {
  const pa = String(a).replace(/^v/, '').split(/[.-]/).map((x) => Number(x) || 0);
  const pb = String(b).replace(/^v/, '').split(/[.-]/).map((x) => Number(x) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0) ? 1 : -1;
  }
  return 0;
}

// Versions des applications télé fournies avec ce serveur (pour dire à une télé qu'il faut la réinstaller).
export function versionsApplisTele() {
  const lire = (f, extraire) => {
    try {
      return extraire(fs.readFileSync(path.join(RACINE, f), 'utf8'));
    } catch {
      return null;
    }
  };
  return {
    samsung: lire('tele/samsung/app/config.xml', (x) => x.match(/<widget[^>]*\sversion="([^"]+)"/)?.[1]),
    lg: lire('tele/lg/app/appinfo.json', (x) => JSON.parse(x).version),
    android: lire('tele/android/app.json', (x) => JSON.parse(x).version),
  };
}

let cache = null;
export async function derniereVersion({ forcer = false } = {}) {
  if (!forcer && cache && Date.now() - cache.t < 3600e3) return cache.valeur;
  const r = await fetch(`https://api.github.com/repos/${DEPOT}/releases/latest`, {
    headers: { 'User-Agent': `Debrideur/${VERSION}`, Accept: 'application/vnd.github+json' },
    signal: AbortSignal.timeout(12_000),
  });
  let valeur;
  if (r.status === 404) valeur = { version: null };
  else if (!r.ok) throw new Error(`GitHub a répondu HTTP ${r.status}`);
  else {
    const j = await r.json();
    valeur = {
      version: String(j.tag_name || '').replace(/^v/, ''),
      notes: j.body || '',
      date: j.published_at || '',
      page: j.html_url || `https://github.com/${DEPOT}/releases`,
      fichiers: (j.assets || []).map((a) => ({ nom: a.name, url: a.browser_download_url, taille: a.size })),
    };
  }
  cache = { t: Date.now(), valeur };
  return valeur;
}

export const modeInstallation = () => (fs.existsSync(path.join(RACINE, '.git')) ? 'git' : 'paquet');

export async function etat({ forcer = false } = {}) {
  const base = { actuelle: VERSION, mode: modeInstallation(), depot: `https://github.com/${DEPOT}`, applisTele: versionsApplisTele() };
  try {
    const d = await derniereVersion({ forcer });
    return { ...base, derniere: d.version, disponible: !!d.version && comparerVersions(d.version, VERSION) > 0, notes: d.notes, page: d.page, date: d.date };
  } catch (e) {
    return { ...base, derniere: null, disponible: false, erreur: `Vérification impossible (${e.message}).` };
  }
}

const nomPaquet = (version) => `Debrideur-${process.platform === 'win32' ? 'Windows' : 'Mac'}-${version}.zip`;

async function telecharger(url) {
  const r = await fetch(url, { headers: { 'User-Agent': `Debrideur/${VERSION}` }, signal: AbortSignal.timeout(300_000) });
  if (!r.ok) throw new Error(`téléchargement impossible (HTTP ${r.status})`);
  return Buffer.from(await r.arrayBuffer());
}

let enCours = false;
// Installe la dernière version puis relance le Débrideur. « arreter » sauvegarde l'état avant de quitter.
export async function installer({ journal = () => {}, arreter }) {
  if (enCours) throw new Error('Mise à jour déjà en cours.');
  enCours = true;
  try {
    const d = await derniereVersion({ forcer: true });
    if (!d.version || comparerVersions(d.version, VERSION) <= 0) throw new Error('Le Débrideur est déjà à jour.');
    if (modeInstallation() === 'git') {
      const modifie = execFileSync('git', ['status', '--porcelain'], { cwd: RACINE, encoding: 'utf8' }).trim();
      if (modifie) throw new Error('Dossier de développement modifié : mets-le à jour avec git.');
      execFileSync('git', ['pull', '--ff-only'], { cwd: RACINE, stdio: 'ignore', timeout: 120_000 });
    } else {
      const nom = nomPaquet(d.version);
      const paquet = d.fichiers.find((f) => f.nom === nom);
      if (!paquet) throw new Error(`paquet ${nom} absent de la version ${d.version}`);
      const zip = await telecharger(paquet.url);
      const empreinte = d.fichiers.find((f) => f.nom === `${nom}.sha256`);
      if (empreinte) {
        const attendue = (await telecharger(empreinte.url)).toString('utf8').trim().split(/\s+/)[0].toLowerCase();
        const obtenue = crypto.createHash('sha256').update(zip).digest('hex');
        if (attendue !== obtenue) throw new Error('empreinte SHA-256 incorrecte : mise à jour annulée');
      }
      const entrees = lireZip(zip);
      // Tout est écrit dans un dossier à côté d'abord, puis mis en place : une coupure ne laisse pas un mélange.
      const prepa = path.join(RACINE, 'donnees', 'mise-a-jour');
      fs.rmSync(prepa, { recursive: true, force: true });
      const aPlacer = [];
      for (const e of entrees) {
        const rel = e.nom.replace(/^[^/]+\//, ''); // dossier « Debrideur/ » de l'archive
        if (!rel || rel.includes('..') || PROTEGES.some((re) => re.test(rel))) continue;
        const cible = path.join(prepa, rel);
        fs.mkdirSync(path.dirname(cible), { recursive: true });
        fs.writeFileSync(cible, e.donnees, { mode: e.executable ? 0o755 : 0o644 });
        aPlacer.push(rel);
      }
      if (!aPlacer.includes('package.json') || !aPlacer.includes('src/serveur.mjs')) throw new Error('paquet incomplet : mise à jour annulée');
      for (const rel of aPlacer) {
        const cible = path.join(RACINE, rel);
        fs.mkdirSync(path.dirname(cible), { recursive: true });
        fs.copyFileSync(path.join(prepa, rel), cible);
        if (process.platform !== 'win32' && /\.(command|sh)$/.test(rel)) fs.chmodSync(cible, 0o755);
      }
      fs.rmSync(prepa, { recursive: true, force: true });
    }
    journal(`Mise à jour ${VERSION} → ${d.version} installée : redémarrage`);
    redemarrer(arreter);
    return { version: d.version };
  } finally {
    enCours = false;
  }
}

// Relance : un petit lanceur attend que ce serveur soit arrêté, puis démarre la nouvelle version.
export function redemarrer(arreter) {
  const p = spawn(process.execPath, [path.join(RACINE, 'lancer.mjs'), '--redemarrer', '--sans-navigateur'], {
    cwd: RACINE,
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    env: process.env,
  });
  p.unref();
  setTimeout(() => (arreter ? arreter() : process.exit(0)), 800);
}
