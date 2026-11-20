// Les sources de recherche vues depuis la page : un vrai serveur Ondi (dossiers temporaires),
// un faux AllDebrid et de faux sites de recherche, le tout sans Internet.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { demarrerFauxSources } from './faux-sources.mjs';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const portLibre = () =>
  new Promise((ok) => {
    const s = net.createServer().listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => ok(port));
    });
  });

let site;
let base;
const enfants = [];

before(async () => {
  site = await demarrerFauxSources();
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'ondi-sources-serveur-'));
  const donnees = path.join(dossier, 'donnees');
  const films = path.join(dossier, 'Films');
  const series = path.join(dossier, 'Séries');
  for (const d of [donnees, films, series]) fs.mkdirSync(d, { recursive: true });
  const [portOndi, portAd] = [await portLibre(), await portLibre()];
  fs.writeFileSync(path.join(donnees, 'config.json'), JSON.stringify({ port: portOndi, cleApi: 'cle-de-test', tmdb: 'cle-de-test', dossiers: { films, series }, connexions: 2, simultanes: 1 }));
  const lancer = (script, args, env = {}) => enfants.push(spawn(process.execPath, [path.join(ICI, script), ...args], { stdio: 'ignore', env: { ...process.env, ...env } }));
  lancer('faux-alldebrid.mjs', [String(portAd)]);
  lancer('../src/serveur.mjs', [], {
    DEBRIDEUR_DONNEES: donnees,
    DEBRIDEUR_PROFILS: path.join(dossier, 'profils'),
    DEBRIDEUR_PORT: String(portOndi),
    DEBRIDEUR_AD_BASE: `http://127.0.0.1:${portAd}`,
    DEBRIDEUR_CATALOGUE: `${site.base}/catalogue.tar.gz`,
    DEBRIDEUR_TMDB_BASE: `${site.base}/tmdb`,
  });
  base = `http://127.0.0.1:${portOndi}`;
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(`${base}/api/ping`)).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('Le serveur Ondi ne répond pas.');
});

after(async () => {
  for (const e of enfants) e.kill();
  await site.fermer();
});

const lire = async (chemin) => {
  const r = await fetch(base + chemin);
  return [r.status, await r.json()];
};
const envoyer = async (chemin, corps) => {
  const r = await fetch(base + chemin, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) });
  return [r.status, await r.json()];
};

test('sources depuis la page : catalogue, activation avec essai, recherche, profil, envoi', async () => {
  // Rien d'activé, profil par défaut : 4K avec français et version originale.
  assert.deepEqual(await lire('/api/sources'), [200, { actives: [], profil: { definitions: [2160], langue: 'vf+vo', poids: 'equilibre', tailleMax: 0, dolbyVisionSeul: false } }]);
  const [, catalogue] = await lire('/api/sources/catalogue');
  assert.deepEqual(catalogue.sources.map((s) => [s.id, s.acces, s.utilisable]), [['api', 'prive', true], ['captcha', 'prive', false], ['flux', 'libre', true], ['flux2', 'libre', true], ['formulaire', 'inscription', true], ['tableau', 'libre', true]]);
  const [, formulaire] = await lire('/api/sources/reglages?id=api');
  assert.deepEqual(formulaire.reglages.map((r) => [r.nom, r.type]), [['apikey', 'secret'], ['gratuit', 'case']]);
  assert.deepEqual(await lire('/api/sources/reglages?id=nimporte'), [400, { erreur: 'Source inconnue du catalogue.' }]);

  // Activation : la source est essayée tout de suite ; une mauvaise clé se voit.
  let [statut, r] = await envoyer('/api/sources', { id: 'api', valeurs: { apikey: 'fausse' } });
  assert.deepEqual([statut, r.essai], [200, { erreur: 'Api privée : cle invalide' }]);
  [statut, r] = await envoyer('/api/sources', { id: 'api', valeurs: { apikey: 'bonne' } });
  assert.deepEqual([statut, r.essai.versions, r.actives.map((s) => s.id)], [200, 3, ['api']]);
  assert.equal((await envoyer('/api/sources', { id: 'captcha' }))[0], 400);
  await envoyer('/api/sources', { id: 'flux' });
  [, r] = await envoyer('/api/sources', { id: 'tableau' });
  assert.deepEqual([r.essai.versions, r.actives.map((s) => s.nom)], [4, ['Api privée', 'Flux', 'Tableau']]);
  assert.ok(!JSON.stringify(await lire('/api/sources/reglages?id=api')).includes('bonne'));

  // Recherche groupée avec le profil par défaut.
  assert.equal((await lire('/api/sources/recherche'))[0], 400);
  let [, recherche] = await lire('/api/sources/recherche?q=Dune&type=film');
  assert.deepEqual(recherche.sources.map((s) => [s.nom, s.versions]), [['Api privée', 2], ['Flux', 2], ['Tableau', 3]]);
  assert.deepEqual(recherche.versions.map((v) => [v.nom, v.sourceNom, v.autres, v.convient, v.refus]), [
    // La même version existe sur le site privé et sur Flux : une seule ligne, prise où il y a le plus de monde.
    ['Dune.2021.MULTi.2160p.WEB-DL.DV.HDR.x265-GRP', 'Flux', ['Api privée'], true, ''],
    ['Dune 2021 MULTi 2160p WEB x265', 'Tableau', [], true, ''],
    ['Dune.2021.FRENCH.1080p.WEB.x264-GRP', 'Api privée', [], false, '1080p au lieu de 4K'],
    ['Dune Prophecy S01 VOSTFR 1080p', 'Tableau', [], false, '1080p au lieu de 4K'],
  ]);

  // Autre profil, gardé dans les réglages : 1080p avec au moins le français.
  [statut, r] = await envoyer('/api/config', { profilVersions: { definitions: [1080], langue: 'vf' } });
  assert.deepEqual([statut, r.config.profilVersions], [200, { definitions: [1080], langue: 'vf', poids: 'equilibre', tailleMax: 0, dolbyVisionSeul: false }]);
  [, recherche] = await lire('/api/sources/recherche?q=Dune&type=film');
  assert.deepEqual(recherche.versions.filter((v) => v.convient).map((v) => v.nom), ['Dune.2021.FRENCH.1080p.WEB.x264-GRP']);

  // Envoi au débrideur : un magnet (pris sur la fiche du site), puis un fichier .torrent (site privé).
  const parNom = (nom) => recherche.versions.find((v) => v.nom === nom).id;
  [statut, r] = await envoyer('/api/sources/envoyer', { id: parNom('Dune 2021 MULTi 2160p WEB x265') });
  assert.deepEqual([statut, r.ajoutes.length, r.refuses], [200, 1, []]);
  [statut, r] = await envoyer('/api/sources/envoyer', { id: parNom('Dune.2021.FRENCH.1080p.WEB.x264-GRP') });
  assert.deepEqual([statut, r.ajoutes.length], [200, 1]);
  assert.deepEqual(await envoyer('/api/sources/envoyer', { id: 'inconnu' }), [400, { erreur: 'Cette version ne vient pas d’une recherche récente : relance la recherche.' }]);
  const [, etat] = await lire('/api/etat');
  assert.deepEqual(etat.jobs.map((j) => j.type).sort(), ['magnet', 'torrent']);
  assert.equal(etat.config.profilVersions.langue, 'vf');

  // Retrait.
  [, r] = await envoyer('/api/sources/retirer', { id: 'flux' });
  assert.deepEqual(r.actives.map((s) => s.id), ['api', 'tableau']);
});

test('liste d’envies depuis la page : titres, ajout avec recherche immédiate, attente, retrait', async () => {
  // Profil par défaut, et les sources Tableau, Flux et Api privée.
  await envoyer('/api/config', { profilVersions: { definitions: [2160], langue: 'vf+vo' } });
  await envoyer('/api/sources', { id: 'flux' });
  const [, depart] = await lire('/api/envies');
  assert.deepEqual([depart.envies, depart.sources, depart.tmdb], [[], 3, true]);
  const [, t] = await lire('/api/envies/titres?q=dune');
  assert.deepEqual(t.titres.map((x) => [x.type, x.titre, x.titreOriginal, x.annee, x.tmdb]), [
    ['film', 'Dune', 'Dune', 2021, 438631],
    ['film', 'Dune : Deuxième partie', 'Dune: Part Two', 2024, 693134],
    ['serie', 'Dune : Prophecy', 'Dune: Prophecy', 2024, 90228],
  ]);
  assert.deepEqual((await lire('/api/envies/saisons?tmdb=76479'))[1].saisons.map((s) => [s.numero, s.episodes]), [[1, 8], [2, 8], [3, 8], [4, 8]]);
  assert.equal((await lire('/api/envies/titres'))[0], 400);
  const jobsAvant = (await lire('/api/etat'))[1].jobs.length;

  // « Dune » (2021) existe en 4K avec VF et VO sur les sources : il part tout de suite au débrideur.
  let [statut, r] = await envoyer('/api/envies', t.titres[0]);
  assert.deepEqual([statut, r.envie.etat, r.envie.version.nom, r.envie.version.source], [200, 'envoyee', 'Dune.2021.MULTi.2160p.WEB-DL.DV.HDR.x265-GRP', 'Flux']);
  assert.equal((await lire('/api/etat'))[1].jobs.length, jobsAvant + 1);
  // La suite n'est sur aucune source : elle attend.
  [statut, r] = await envoyer('/api/envies', t.titres[1]);
  const attente = r.envie;
  assert.deepEqual([statut, attente.etat, attente.message, attente.essais], [200, 'attente', 'Pas encore de version sur tes sources.', 1]);
  assert.deepEqual(r.envies.map((e) => [e.titre, e.etat]), [['Dune : Deuxième partie', 'attente'], ['Dune', 'envoyee']]);
  assert.deepEqual(await envoyer('/api/envies', t.titres[1]), [400, { erreur: '« Dune : Deuxième partie » est déjà dans ta liste d’envies.' }]);
  assert.equal((await envoyer('/api/envies', { type: 'film' }))[0], 400);
  // Une saison de série, ajoutée à la main (sans passer par TMDB).
  [statut, r] = await envoyer('/api/envies', { type: 'serie', titre: 'The Boys', saison: 1 });
  assert.deepEqual([statut, r.envie.saison, r.envie.message], [200, 1, '1 version vue, aucune ne convient encore (1080p au lieu de 4K).']);

  // « Chercher maintenant », puis retrait.
  [statut, r] = await envoyer('/api/envies/verifier', { id: attente.id });
  assert.deepEqual([statut, r.envie.essais, r.envie.etat], [200, 2, 'attente']);
  assert.equal((await envoyer('/api/envies/verifier', { id: 'inconnu' }))[0], 400);
  [, r] = await envoyer('/api/envies/retirer', { id: attente.id });
  assert.deepEqual(r.envies.map((e) => e.titre), ['The Boys', 'Dune']);
});
