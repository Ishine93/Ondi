// Fabrique les paquets d'une version dans dist/ :
//   Debrideur-Windows-<v>.zip, Debrideur-Mac-<v>.zip (+ .sha256, utilisés par la mise à jour automatique) ;
//   Debrideur-TV-Samsung-<v>.zip, -LG-, -AndroidTV-, -FireTV-, -Autres- (l'appli, son mode d'emploi, ses scripts, un prompt IA) ;
//   Debrideur.wgt / .ipk / .apk sous un nom fixe (liens directs « dernière version », ex. pour Downloader sur Fire TV).
// Seuls les fichiers suivis par git entrent dans les paquets : rien de personnel (réglages, clés, historique).
//   node outils/construire-paquets.mjs
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ecrireZip } from '../src/zip.mjs';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(RACINE, 'dist');
const VERSION = JSON.parse(fs.readFileSync(path.join(RACINE, 'package.json'), 'utf8')).version;

function fichiersSuivis() {
  try {
    return execFileSync('git', ['ls-files'], { cwd: RACINE, encoding: 'utf8' }).split('\n').filter(Boolean);
  } catch {
    throw new Error('git ls-files a échoué : lance ce script depuis le dépôt git.');
  }
}

const lire = (rel) => fs.readFileSync(path.join(RACINE, rel));
function ecrire(nom, entrees, { empreinte = false } = {}) {
  const zip = ecrireZip(entrees);
  fs.writeFileSync(path.join(DIST, nom), zip);
  if (empreinte) fs.writeFileSync(path.join(DIST, `${nom}.sha256`), `${crypto.createHash('sha256').update(zip).digest('hex')}  ${nom}\n`);
  console.log(`✓ ${nom} (${entrees.length} fichiers, ${(zip.length / 1e6).toFixed(1)} Mo)`);
}

fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });
const suivis = fichiersSuivis().filter((f) => fs.existsSync(path.join(RACINE, f)));

// ---------- serveur : Windows et Mac ----------
const communs = suivis.filter((f) => !/^(tests|\.github)\//.test(f) && !/^tele\/(android|lg)\/(src|res|build)\//.test(f));
const pourWindows = communs.filter((f) => !/\.(command|sh)$/.test(f));
const pourMac = communs.filter((f) => !/\.(bat|vbs|ps1)$/.test(f));
ecrire(`Debrideur-Windows-${VERSION}.zip`, pourWindows.map((f) => ({ nom: `Debrideur/${f}`, donnees: lire(f) })), { empreinte: true });
ecrire(`Debrideur-Mac-${VERSION}.zip`, pourMac.map((f) => ({ nom: `Debrideur/${f}`, donnees: lire(f) })), { empreinte: true });

// ---------- télés ----------
// [nom du paquet, dossier des docs et scripts, fichier de l'appli (construit avant), nom de l'appli dans le zip]
const TELES = [
  ['Samsung', 'tele/samsung', 'tele/Debrideur.wgt', 'Debrideur.wgt'],
  ['LG', 'tele/lg', 'tele/lg/build/Debrideur.ipk', 'Debrideur.ipk'],
  ['AndroidTV', 'tele/android', 'tele/android/build/Debrideur.apk', 'Debrideur.apk'],
  ['FireTV', 'tele/firetv', 'tele/android/build/Debrideur.apk', 'Debrideur.apk'],
  ['Autres', 'tele/autres', null, null],
];
for (const [nom, dossier, appli, nomAppli] of TELES) {
  if (appli && !fs.existsSync(path.join(RACINE, appli))) {
    console.log(`… ${nom} : ${appli} absent (construit par GitHub Actions), paquet ignoré`);
    continue;
  }
  // Docs et scripts du dossier (pas les sources de l'appli).
  const docs = suivis.filter((f) => f.startsWith(`${dossier}/`) && !f.slice(dossier.length + 1).includes('/') && /\.(md|bat|command|ps1|sh)$/.test(f) && !/construire\.sh$/.test(f));
  const entrees = docs.map((f) => ({ nom: `Debrideur-TV-${nom}/${path.basename(f)}`, donnees: lire(f) }));
  // Scripts partagés éventuels (outils/ du dossier).
  for (const f of suivis.filter((x) => x.startsWith(`${dossier}/outils/`))) entrees.push({ nom: `Debrideur-TV-${nom}/${f.slice(dossier.length + 1)}`, donnees: lire(f) });
  if (appli) {
    entrees.push({ nom: `Debrideur-TV-${nom}/${nomAppli}`, donnees: lire(appli) });
    if (!fs.existsSync(path.join(DIST, nomAppli))) fs.copyFileSync(path.join(RACINE, appli), path.join(DIST, nomAppli));
  }
  ecrire(`Debrideur-TV-${nom}-${VERSION}.zip`, entrees);
}
console.log(`\nVersion ${VERSION} prête dans ${DIST}`);
