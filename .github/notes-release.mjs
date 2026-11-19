// Texte complet de la page d'une version GitHub : nouveautés (notes/<version>.md) + guide de téléchargement
// et d'installation (.github/modele-release.md), en anglais puis en français.
//   node .github/notes-release.mjs 2.0.1 > notes.md
// La fenêtre de mise à jour de l'appli lit les parties « ## English » et « ## Français » : elles ne contiennent
// que les nouveautés, le guide est sous d'autres titres (« ## English · … »), qu'elle ignore.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { versionsApplisTele } from '../src/miseajour.mjs';

const RACINE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const paquet = JSON.parse(fs.readFileSync(path.join(RACINE, 'package.json'), 'utf8'));
const version = (process.argv[2] || paquet.version).replace(/^v/, '');
const depot = paquet.debrideur?.depot || 'Ishine93/Debrideur';

// Nouveautés : les parties « ## English » et « ## Français » du fichier de la version.
const fichier = path.join(RACINE, 'notes', `${version}.md`);
const notes = fs.existsSync(fichier) ? fs.readFileSync(fichier, 'utf8').replace(/\r/g, '') : '';
function partie(titre) {
  const m = notes.match(new RegExp(`^##\\s*${titre}\\s*\\n([\\s\\S]*?)(?=^##\\s|(?![\\s\\S]))`, 'm'));
  return m ? m[1].trim() : '';
}
const en = partie('English') || '- Bug fixes and improvements.';
const fr = partie('Français') || '- Corrections et améliorations.';

// Version des applis télé (une seule si elles sont toutes pareilles).
const tele = versionsApplisTele();
const valeurs = [...new Set(Object.values(tele).filter(Boolean))];
const versionTele =
  valeurs.length === 1 ? valeurs[0] : `Samsung ${tele.samsung} · LG ${tele.lg} · Android TV / Fire TV ${tele.android}`;

const remplacer = {
  VERSION: version,
  DEPOT: depot,
  URL: `https://github.com/${depot}/releases/download/v${version}`,
  TELE: versionTele,
  NOUVEAUTES_EN: en,
  NOUVEAUTES_FR: fr,
};
const modele = fs.readFileSync(path.join(RACINE, '.github', 'modele-release.md'), 'utf8').replace(/\r/g, '');
const texte = modele.replace(/\{\{([A-Z_]+)\}\}/g, (tout, cle) => (cle in remplacer ? remplacer[cle] : tout));
const reste = texte.match(/\{\{[A-Z_]+\}\}/);
if (reste) throw new Error(`Repère inconnu dans le modèle : ${reste[0]}`);
process.stdout.write(texte);
