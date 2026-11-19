// Fabrique l'application télé Samsung : tele/Debrideur.wgt (une archive zip du dossier tele/samsung/app).
// Elle n'est pas signée : Apps2Samsung la signe avec ton certificat Samsung en l'installant
// (onglet Install → « Install a file… »).
//   node tele/construire.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ecrireZip } from '../src/zip.mjs';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const SOURCE = path.join(ICI, 'samsung', 'app');
const SORTIE = path.join(ICI, 'Debrideur.wgt');

function fichiers(dossier, prefixe = '') {
  return fs.readdirSync(dossier, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? fichiers(path.join(dossier, e.name), `${prefixe}${e.name}/`) : [{ nom: `${prefixe}${e.name}`, chemin: path.join(dossier, e.name) }],
  );
}

const liste = fichiers(SOURCE).sort((a, b) => (a.nom === 'config.xml' ? -1 : b.nom === 'config.xml' ? 1 : a.nom.localeCompare(b.nom)));
fs.writeFileSync(SORTIE, ecrireZip(liste.map((f) => ({ nom: f.nom, donnees: fs.readFileSync(f.chemin) }))));
console.log(`Application télé prête : ${SORTIE} (${liste.length} fichiers, ${Math.round(fs.statSync(SORTIE).size / 1024)} Ko)`);
