// Donne aux applis télé (Samsung, LG, Android TV / Fire TV) le numéro de version d'Ondi.
//   node .github/version-tele.mjs 2.0.2
// À lancer seulement quand une appli télé change : les télés déjà installées voient alors le message
// « Nouvelle version de l'appli télé » (le serveur compare avec le numéro envoyé par l'appli).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const version = String(process.argv[2] || '').replace(/^v/, '');
const m = version.match(/^(\d+)\.(\d+)\.(\d+)$/);
if (!m || +m[1] > 255 || +m[2] > 255 || +m[3] > 65535) {
  console.error('Usage : node .github/version-tele.mjs X.Y.Z (X et Y ≤ 255, Z ≤ 65535, limites de Samsung)');
  process.exit(1);
}
// Android : un nombre entier qui doit toujours augmenter (2.0.2 → 20002).
const code = +m[1] * 10000 + +m[2] * 100 + +m[3];

function modifier(fichier, remplacements) {
  const chemin = path.join(RACINE, fichier);
  let texte = fs.readFileSync(chemin, 'utf8');
  for (const [motif, valeur] of remplacements) {
    if (!motif.test(texte)) throw new Error(`${fichier} : motif introuvable ${motif}`);
    texte = texte.replace(motif, valeur);
  }
  fs.writeFileSync(chemin, texte);
  console.log(`✓ ${fichier}`);
}

modifier('tele/samsung/app/config.xml', [[/(<widget\b[^>]*\sversion=")[^"]+"/, `$1${version}"`]]);
modifier('tele/samsung/app/index.html', [[/(var VERSION = ')[^']+'/, `$1${version}'`]]);
modifier('tele/lg/app/appinfo.json', [[/("version"\s*:\s*")[^"]+"/, `$1${version}"`]]);
modifier('tele/lg/app/index.html', [[/(var VERSION = ')[^']+'/, `$1${version}'`]]);
modifier('tele/android/app.json', [
  [/("version"\s*:\s*")[^"]+"/, `$1${version}"`],
  [/("versionCode"\s*:\s*)\d+/, `$1${code}`],
]);
modifier('tele/android/AndroidManifest.xml', [
  [/(android:versionCode=")\d+"/, `$1${code}"`],
  [/(android:versionName=")[^"]+"/, `$1${version}"`],
]);
console.log(`Applis télé : ${version} (Android versionCode ${code})`);
