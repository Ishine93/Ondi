// Ondi de démo pour essayer la recherche sans compte ni Internet :
// faux AllDebrid + faux site + Ondi sur des dossiers temporaires (ta config n'est pas touchée).
//   node tests/demo-recherche.mjs   → http://localhost:18097
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const PORTS = { debrideur: 18097, alldebrid: 18098, site: 18099 };

const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'debrideur-demo-'));
const donnees = path.join(dossier, 'donnees');
const films = path.join(dossier, 'Films');
const series = path.join(dossier, 'Séries');
for (const d of [donnees, films, series]) fs.mkdirSync(d, { recursive: true });
fs.writeFileSync(
  path.join(donnees, 'config.json'),
  JSON.stringify({ port: PORTS.debrideur, cleApi: 'cle-de-test', dossiers: { films, series }, connexions: 2, simultanes: 1, siteRecherche: `http://127.0.0.1:${PORTS.site}/` }, null, 2),
);

const lancer = (script, args = [], env = {}) =>
  spawn(process.execPath, [path.join(ICI, script), ...args], { stdio: 'inherit', env: { ...process.env, ...env } });

const enfants = [
  lancer('faux-alldebrid.mjs', [String(PORTS.alldebrid), '20']),
  lancer('faux-site.mjs', [String(PORTS.site)]),
  lancer('../src/serveur.mjs', [], {
    DEBRIDEUR_DONNEES: donnees,
    DEBRIDEUR_PROFILS: path.join(dossier, 'profils'),
    DEBRIDEUR_PORT: String(PORTS.debrideur),
    DEBRIDEUR_AD_BASE: `http://127.0.0.1:${PORTS.alldebrid}`,
  }),
];
console.log(`Démo : http://localhost:${PORTS.debrideur} · fichiers rangés dans ${dossier}`);

const arreter = () => {
  for (const e of enfants) e.kill();
  setTimeout(() => {
    try {
      fs.rmSync(dossier, { recursive: true, force: true });
    } catch {}
    process.exit(0);
  }, 300);
};
process.on('SIGINT', arreter);
process.on('SIGTERM', arreter);
process.on('SIGBREAK', arreter);
