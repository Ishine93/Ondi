import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Sources } from '../src/sources.mjs';
import { Envies, ErreurEnvie } from '../src/envies.mjs';
import { demarrerFauxSources, HASH_DUNE } from './faux-sources.mjs';

let site;
before(async () => {
  site = await demarrerFauxSources();
});
after(() => site.fermer());

const dossierTemp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'ondi-envies-'));

// Faux gestionnaire de téléchargements : note ce qu'on lui envoie, et laisse l'essai changer l'état des jobs.
function fauxGestionnaire() {
  const g = {
    jobs: [],
    envois: [],
    ajouterSources(magnet, mode) {
      const job = { id: `j${g.jobs.length + 1}`, etat: 'attente', message: '' };
      g.jobs.push(job);
      g.envois.push({ magnet, mode });
      return { ajoutes: [job.id], refuses: [] };
    },
    async ajouterTorrent(nom, donnees, mode) {
      const job = { id: `j${g.jobs.length + 1}`, etat: 'attente', message: '' };
      g.jobs.push(job);
      g.envois.push({ torrent: donnees.toString(), nom, mode });
      return job.id;
    },
    trouver: (id) => g.jobs.find((j) => j.id === id),
  };
  return g;
}

async function preparer({ actives = ['tableau', 'flux'], profil = null, valeurs = {} } = {}) {
  const dossier = dossierTemp();
  const sources = new Sources({ dossier, adresse: `${site.base}/catalogue.tar.gz`, local: true });
  for (const id of actives) await sources.enregistrer(id, { valeurs: valeurs[id] || {} });
  const gestionnaire = fauxGestionnaire();
  const horloge = { t: Date.UTC(2026, 10, 20, 12) };
  const journal = [];
  const envies = new Envies({ dossier, sources, gestionnaire, profil: () => profil, maintenant: () => horloge.t, journal: (...m) => journal.push(m.join(' ')) });
  return { dossier, sources, gestionnaire, envies, horloge, journal };
}

test('ajouter une envie : ce qui est gardé, ce qui est refusé', async () => {
  const { envies, dossier } = await preparer({ actives: [] });
  const dune = envies.ajouter({ type: 'film', titre: '  Dune  ', titreOriginal: 'Dune', annee: '2021', tmdb: 438631, affiche: 'https://image.tmdb.org/t/p/w342/abc.jpg', saison: 3 });
  assert.deepEqual({ ...dune, id: 'x' }, {
    id: 'x', type: 'film', titre: 'Dune', titreOriginal: '', annee: 2021, saison: null, affiche: 'https://image.tmdb.org/t/p/w342/abc.jpg',
    ajoutee: Date.UTC(2026, 10, 20, 12), etat: 'attente', message: '', essais: 0, verifiee: 0, prochaine: Date.UTC(2026, 10, 20, 12),
    version: null, job: null, telechargement: null, terminee: null, enRecherche: false,
  });
  const boys = envies.ajouter({ type: 'serie', titre: 'The Boys', affiche: 'https://ailleurs.test/x.jpg' });
  assert.deepEqual([boys.saison, boys.affiche, boys.annee], [1, '', null]);
  assert.equal(envies.ajouter({ type: 'serie', titre: 'The Boys', saison: 2 }).saison, 2);
  assert.throws(() => envies.ajouter({ type: 'film', titre: 'Autre', tmdb: 438631 }), /« Dune » est déjà dans ta liste/);
  assert.throws(() => envies.ajouter({ type: 'serie', titre: 'the boys', saison: 2 }), /\(saison 2\) est déjà dans ta liste/);
  // Écrite à la main (sans fiche TMDB ni année) : reconnue comme la même ; une autre année, non.
  assert.throws(() => envies.ajouter({ type: 'film', titre: 'dune' }), /« Dune » est déjà dans ta liste/);
  assert.equal(envies.ajouter({ type: 'film', titre: 'Dune', annee: 1984 }).annee, 1984);
  envies.retirer(envies.liste().find((e) => e.annee === 1984).id);
  assert.throws(() => envies.ajouter({ type: 'film', titre: '' }), ErreurEnvie);
  assert.throws(() => envies.ajouter({ type: 'livre', titre: 'Dune' }), ErreurEnvie);
  // Gardée d'un lancement à l'autre.
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dossier, 'envies.json'), 'utf8')).envies.map((e) => [e.titre, e.saison]), [['Dune', null], ['The Boys', 1], ['The Boys', 2]]);
  envies.retirer(dune.id);
  assert.deepEqual(envies.liste().map((e) => e.titre), ['The Boys', 'The Boys']);
  await assert.rejects(envies.verifier(dune.id), /n’est plus dans la liste/);
});

test('sans source activée : l’envie attend, avec le pourquoi', async () => {
  const { envies, gestionnaire } = await preparer({ actives: [] });
  const { id } = envies.ajouter({ type: 'film', titre: 'Dune', annee: 2021 });
  const e = await envies.verifier(id);
  assert.deepEqual([e.etat, e.message, e.essais], ['attente', 'Aucune source de recherche n’est activée (Réglages → Sources de recherche).', 1]);
  assert.equal(gestionnaire.envois.length, 0);
});

test('film : la meilleure version qui convient part au débrideur ; ratée, une autre est tentée ; arrivée, c’est fini', async () => {
  const { envies, gestionnaire, horloge, journal } = await preparer();
  const { id } = envies.ajouter({ type: 'film', titre: 'Dune', titreOriginal: 'Dune', annee: 2021 });
  let e = await envies.verifier(id);
  // Deux versions 4K MULTi existent : celle avec HDR est mieux notée.
  assert.deepEqual([e.etat, e.version.nom, e.version.source, e.job, e.telechargement], ['envoyee', 'Dune.2021.MULTi.2160p.WEB-DL.DV.HDR.x265-GRP', 'Flux', 'j1', 'attente']);
  assert.equal(gestionnaire.envois[0].mode, 'film');
  assert.match(gestionnaire.envois[0].magnet, new RegExp(`^magnet:\\?xt=urn:btih:${HASH_DUNE}`));
  assert.match(journal.at(-1), /Envies : « Dune » → Dune\.2021\.MULTi\.2160p\.WEB-DL\.DV\.HDR\.x265-GRP \(Flux\)/);
  // Déjà envoyée : une nouvelle vérification ne renvoie rien.
  await envies.verifier(id);
  assert.equal(gestionnaire.envois.length, 1);
  // Le téléchargement échoue : l'envie repart en attente, cette version est écartée, nouvel essai dix minutes après.
  Object.assign(gestionnaire.jobs[0], { etat: 'erreur', message: 'Torrent sans partageur' });
  await envies.tour();
  e = envies.liste()[0];
  assert.deepEqual([e.etat, e.job, e.prochaine - horloge.t], ['attente', null, 600_000]);
  assert.match(e.message, /Le téléchargement de « Dune\.2021\.MULTi\.2160p\.WEB-DL\.DV\.HDR\.x265-GRP » a échoué \(Torrent sans partageur\) : Ondi cherchera une autre version\./);
  assert.equal(gestionnaire.envois.length, 1);
  horloge.t += 11 * 60_000;
  await envies.tour();
  e = envies.liste()[0];
  assert.deepEqual([e.etat, e.version.nom, e.version.source], ['envoyee', 'Dune 2021 MULTi 2160p WEB x265', 'Tableau']);
  assert.equal(gestionnaire.envois[1].magnet, `magnet:?xt=urn:btih:${HASH_DUNE}&dn=fiche1`);
  // Arrivé : terminé. Même si la ligne est ensuite retirée des téléchargements, ça le reste.
  gestionnaire.jobs[1].etat = 'telechargement';
  await envies.tour();
  assert.deepEqual([envies.liste()[0].etat, envies.liste()[0].telechargement], ['envoyee', 'telechargement']);
  gestionnaire.jobs[1].etat = 'termine';
  await envies.tour();
  e = envies.liste()[0];
  assert.deepEqual([e.etat, e.terminee, e.message], ['terminee', horloge.t, '']);
  // Un mois plus tard, elle quitte la liste.
  horloge.t += 29 * 86400_000;
  await envies.tour();
  assert.equal(envies.liste().length, 1);
  horloge.t += 2 * 86400_000;
  await envies.tour();
  assert.equal(envies.liste().length, 0);
});

test('téléchargement annulé ou retiré avant la fin : une autre version sera cherchée', async () => {
  const { envies, gestionnaire } = await preparer();
  const { id } = envies.ajouter({ type: 'film', titre: 'Dune', annee: 2021 });
  await envies.verifier(id);
  gestionnaire.jobs.length = 0; // la ligne a été retirée des téléchargements
  await envies.tour();
  const e = envies.liste()[0];
  assert.equal(e.etat, 'attente');
  assert.match(e.message, /a été annulé : Ondi cherchera une autre version\./);
});

test('rien qui convienne : l’envie attend et dit pourquoi ; la recherche ne repart qu’à l’heure prévue', async () => {
  const { envies, gestionnaire, horloge } = await preparer();
  // Un film que les sources n'ont pas (elles ont « Dune », pas « Dune : Deuxième partie »).
  const suite = envies.ajouter({ type: 'film', titre: 'Dune : Deuxième partie', titreOriginal: 'Dune: Part Two', annee: 2024 });
  let e = await envies.verifier(suite.id);
  assert.deepEqual([e.etat, e.message, e.essais, e.prochaine - horloge.t], ['attente', 'Pas encore de version sur tes sources.', 1, 6 * 3600_000]);
  // Une saison qui existe, mais pas en 4K.
  const boys = envies.ajouter({ type: 'serie', titre: 'The Boys', saison: 1 });
  e = await envies.verifier(boys.id);
  assert.deepEqual([e.etat, e.message], ['attente', '1 version vue, aucune ne convient encore (1080p au lieu de 4K).']);
  // L'autre saison n'existe pas du tout.
  const saison2 = envies.ajouter({ type: 'serie', titre: 'The Boys', saison: 2 });
  assert.equal((await envies.verifier(saison2.id)).message, 'Pas encore de version sur tes sources.');
  assert.equal(gestionnaire.envois.length, 0);
  // Les tours suivants ne redemandent rien aux sites avant l'heure.
  const avant = site.etat.demandes.length;
  horloge.t += 5 * 3600_000;
  await envies.tour();
  assert.equal(site.etat.demandes.length, avant);
  horloge.t += 2 * 3600_000;
  await envies.tour();
  assert.ok(site.etat.demandes.length > avant);
  assert.deepEqual(envies.liste().map((x) => x.essais), [2, 2, 2]);
});

test('série : la saison part en « série » quand le profil l’accepte', async () => {
  const { envies, gestionnaire } = await preparer({ profil: { definitions: [1080], langue: 'vf+vo' } });
  const { id } = envies.ajouter({ type: 'serie', titre: 'The Boys', saison: 1 });
  const e = await envies.verifier(id);
  assert.deepEqual([e.etat, e.version.nom], ['envoyee', 'The.Boys.S01.MULTi.1080p.WEB.x264-GRP']);
  assert.equal(gestionnaire.envois[0].mode, 'serie');
});

test('site privé : c’est son fichier .torrent qui part au débrideur', async () => {
  const { envies, gestionnaire } = await preparer({ actives: ['api'], valeurs: { api: { apikey: 'bonne' } }, profil: { definitions: [2160], langue: 'vf+vo', poids: 'maximum' } });
  const { id } = envies.ajouter({ type: 'film', titre: 'Dune', annee: 2021 });
  const e = await envies.verifier(id);
  assert.deepEqual([e.etat, e.version.nom, e.version.source], ['envoyee', 'Dune.2021.MULTi.VFF.2160p.UHD.BluRay.REMUX.HEVC-GRP', 'Api privée']);
  assert.deepEqual(gestionnaire.envois[0], { torrent: 'd8:announce20:http://x.test/annonce4:infod4:name2:41ee', nom: 'Dune.2021.MULTi.VFF.2160p.UHD.BluRay.REMUX.HEVC-GRP.torrent', mode: 'film' });
});

test('toutes les sources en panne : le message le dit', async () => {
  const { envies } = await preparer({ actives: ['flux'] });
  const { id } = envies.ajouter({ type: 'film', titre: 'Dune', annee: 2021 });
  site.etat.panne = true;
  const e = await envies.verifier(id);
  site.etat.panne = false;
  assert.deepEqual([e.etat, e.message], ['attente', 'Flux a répondu « HTTP 500 ».']);
});
