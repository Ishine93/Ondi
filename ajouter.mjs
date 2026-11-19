// Ajoute un ou plusieurs liens depuis un terminal, sans ouvrir la page.
//   node ajouter.mjs "magnet:?xt=..."                  (Auto : devine film ou série)
//   node ajouter.mjs --serie https://1fichier.com/?xxx
//   node ajouter.mjs --film C:\chemin\fichier.torrent
//   node ajouter.mjs --suivre "magnet:?xt=..."         (affiche la progression jusqu'à la fin)
import fs from 'node:fs';
import path from 'node:path';
import { demarrer } from './lancer.mjs';

let port = 8097;
try {
  port = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'donnees', 'config.json'), 'utf8')).port || port;
} catch {}
const base = `http://127.0.0.1:${port}`;
const args = process.argv.slice(2);
const mode = args.includes('--serie') ? 'serie' : args.includes('--film') ? 'film' : 'auto';
const suivre = args.includes('--suivre');
const sources = args.filter((a) => !a.startsWith('--'));

if (!sources.length) {
  console.log('Usage : node ajouter.mjs [--film|--serie] [--suivre] <magnet | lien | fichier.torrent> ...');
  process.exit(1);
}
if (!(await demarrer())) {
  console.error("Ondi n'a pas démarré.");
  process.exit(1);
}

const ids = [];
const liens = [];
for (const s of sources) {
  if (/\.torrent$/i.test(s) && fs.existsSync(s)) {
    const r = await fetch(`${base}/api/torrent?mode=${mode}&nom=${encodeURIComponent(path.basename(s))}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-bittorrent' },
      body: fs.readFileSync(s),
    });
    const j = await r.json();
    if (!r.ok) console.error(`${s} : ${j.erreur}`);
    else ids.push(...j.ajoutes);
  } else liens.push(s);
}
if (liens.length) {
  const r = await fetch(`${base}/api/jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sources: liens.join('\n'), mode }),
  });
  const j = await r.json();
  if (!r.ok) console.error(j.erreur);
  else {
    ids.push(...j.ajoutes);
    for (const x of j.refuses) console.error(`Pas reconnu : ${x}`);
  }
}
console.log(`${ids.length} ajouté(s). Suivi : http://localhost:${port}`);

if (suivre && ids.length) {
  const fmt = (o) => (o >= 1024 ** 3 ? `${(o / 1024 ** 3).toFixed(1)} Go` : `${(o / 1024 ** 2).toFixed(0)} Mo`);
  const finaux = new Set(['termine', 'erreur', 'annule']);
  let precedent = '';
  for (;;) {
    const { jobs } = await (await fetch(`${base}/api/etat`)).json();
    const miens = jobs.filter((j) => ids.includes(j.id));
    const ligne = miens
      .map((j) => {
        const pct = j.total ? ` ${Math.floor((j.fait / j.total) * 100)} %` : '';
        const vit = j.vitesse ? ` ${fmt(j.vitesse)}/s` : '';
        return `[${j.etat}${pct}${vit}] ${j.titre}${j.message ? ` — ${j.message}` : ''}`;
      })
      .join('\n');
    if (ligne !== precedent) console.log(ligne);
    precedent = ligne;
    if (miens.every((j) => finaux.has(j.etat))) {
      for (const j of miens) for (const f of j.fichiers) console.log(`  ${f.etat === 'ok' || f.etat === 'deja' ? '✓' : '✗'} ${f.dest}`);
      process.exit(miens.every((j) => j.etat === 'termine') ? 0 : 1);
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
}
