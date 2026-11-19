// Fabrique les paquets d'une version dans dist/ :
//   Ondi-Windows-<v>.zip, Ondi-Mac-<v>.zip (+ .sha256, utilisés par la mise à jour automatique) ;
//   Ondi-TV-Samsung-<v>.zip, -LG-, -AndroidTV-, -FireTV-, -Autres- (l'appli, son mode d'emploi, ses scripts, un prompt IA) ;
//   Ondi.wgt / .ipk / .apk sous un nom fixe (liens directs « dernière version », ex. pour Downloader sur Fire TV) ;
//   jusqu'à la 2.1.x seulement, les mêmes sous l'ancien nom (Débrideur, jusqu'à la 2.0.3) : Debrideur-Windows-<v>.zip,
//   Debrideur-Mac-<v>.zip (+ .sha256), que les anciennes installations cherchent pour se mettre à jour, et Debrideur.apk
//   (anciens liens de Downloader). Plus à partir de la 2.2.0 (voir avecCopiesAncienNom).
// Seuls les fichiers suivis par git entrent dans les paquets : rien de personnel (réglages, clés, historique).
//   node outils/construire-paquets.mjs
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ecrireZip } from '../src/zip.mjs';
import { avecCopiesAncienNom } from '../src/miseajour.mjs';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(RACINE, 'dist');
const VERSION = JSON.parse(fs.readFileSync(path.join(RACINE, 'package.json'), 'utf8')).version;
const ANCIEN_NOM = avecCopiesAncienNom(VERSION);

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
// outils/logo.py ne sert qu'à redessiner les icônes : inutile dans les paquets.
const communs = suivis.filter((f) => !/^(tests|\.github)\//.test(f) && !/^tele\/(android|lg)\/(src|res|build)\//.test(f) && f !== 'outils/logo.py');
const pourWindows = communs.filter((f) => !/\.(command|sh)$/.test(f));
const pourMac = communs.filter((f) => !/\.(bat|vbs|ps1)$/.test(f));
for (const [systeme, liste] of [['Windows', pourWindows], ['Mac', pourMac]]) {
  ecrire(`Ondi-${systeme}-${VERSION}.zip`, liste.map((f) => ({ nom: `Ondi/${f}`, donnees: lire(f) })), { empreinte: true });
  // Même contenu sous l'ancien nom : une installation d'avant le changement de nom le cherche pour se mettre à jour.
  if (ANCIEN_NOM) ecrire(`Debrideur-${systeme}-${VERSION}.zip`, liste.map((f) => ({ nom: `Debrideur/${f}`, donnees: lire(f) })), { empreinte: true });
}

// ---------- télés ----------
// [nom du paquet, dossier des docs et scripts, fichier de l'appli (construit avant), nom de l'appli dans le zip]
const TELES = [
  ['Samsung', 'tele/samsung', 'tele/Ondi.wgt', 'Ondi.wgt'],
  ['LG', 'tele/lg', 'tele/lg/build/Ondi.ipk', 'Ondi.ipk'],
  ['AndroidTV', 'tele/android', 'tele/android/build/Ondi.apk', 'Ondi.apk'],
  ['FireTV', 'tele/firetv', 'tele/android/build/Ondi.apk', 'Ondi.apk'],
  ['Autres', 'tele/autres', null, null],
];
for (const [nom, dossier, appli, nomAppli] of TELES) {
  if (appli && !fs.existsSync(path.join(RACINE, appli))) {
    console.log(`… ${nom} : ${appli} absent (construit par GitHub Actions), paquet ignoré`);
    continue;
  }
  // Docs et scripts du dossier (pas les sources de l'appli).
  const docs = suivis.filter((f) => f.startsWith(`${dossier}/`) && !f.slice(dossier.length + 1).includes('/') && /\.(md|bat|command|ps1|sh)$/.test(f) && !/construire\.sh$/.test(f));
  const entrees = docs.map((f) => ({ nom: `Ondi-TV-${nom}/${path.basename(f)}`, donnees: lire(f) }));
  // Scripts partagés éventuels (outils/ du dossier).
  for (const f of suivis.filter((x) => x.startsWith(`${dossier}/outils/`))) entrees.push({ nom: `Ondi-TV-${nom}/${f.slice(dossier.length + 1)}`, donnees: lire(f) });
  if (appli) {
    entrees.push({ nom: `Ondi-TV-${nom}/${nomAppli}`, donnees: lire(appli) });
    if (!fs.existsSync(path.join(DIST, nomAppli))) fs.copyFileSync(path.join(RACINE, appli), path.join(DIST, nomAppli));
  }
  ecrire(`Ondi-TV-${nom}-${VERSION}.zip`, entrees);
}
// Ancien lien direct de l'appli Android TV / Fire TV (…/releases/latest/download/Debrideur.apk).
if (ANCIEN_NOM && fs.existsSync(path.join(DIST, 'Ondi.apk'))) fs.copyFileSync(path.join(DIST, 'Ondi.apk'), path.join(DIST, 'Debrideur.apk'));
console.log(`\nVersion ${VERSION} prête dans ${DIST}`);
