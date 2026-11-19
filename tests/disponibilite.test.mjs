import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { reglages, configurerDisponibilite, verifierLiens, verifierFiches, retenirAnnonces, echantillon } from '../src/disponibilite.mjs';

// Rythme accéléré : les tests ne doivent pas attendre comme avec le vrai AllDebrid.
Object.assign(reglages, { espacement: 2, attenteLot: 5, pausesRedirecteur: [5, 5], decalage: 60, delaiSauvegarde: 20, pauseSaturation: 80 });

const HEBERGEURS = {
  hebergeurs: new Map([['1fichier.com', '1fichier'], ['uptobox.com', 'uptobox'], ['rapidgator.net', 'rapidgator'], ['turbobit.net', 'turbobit']]),
  redirecteurs: new Map([['dl-protect.link', 'dl-protect']]),
};
const erreur = (code) => Object.assign(new Error(code), { code });
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

// Faux AllDebrid. Dans l'adresse d'un lien : « mort » = supprimé, « refus » = hébergeur non géré,
// « capricieux » = REDIRECTOR_ERROR au premier essai, « casse » = REDIRECTOR_ERROR à chaque fois,
// « lent » = ouverture en 300 ms.
function fauxAllDebrid() {
  const appels = [];
  const essais = new Map();
  const ad = {
    appels,
    hebergeurs: async () => HEBERGEURS,
    infosLiens: async (liens) => {
      appels.push(`infos×${liens.length}`);
      return liens.map((link) => {
        if (link.includes('mort')) return { link, error: { code: 'LINK_DOWN', message: 'This link is not available' } };
        if (link.includes('refus')) return { link, error: { code: 'LINK_HOST_NOT_SUPPORTED', message: 'This host or link is not supported' } };
        return { link, filename: `${link.split(/[/?]/).pop()}.mkv`, size: 1000, host: 'uptobox' };
      });
    },
    redirecteur: async (lien) => {
      const n = (essais.get(lien) || 0) + 1;
      essais.set(lien, n);
      appels.push(`ouvre ${lien.split('/').pop()}`);
      if (lien.includes('lent')) await pause(300);
      if (lien.includes('casse') || (lien.includes('capricieux') && n === 1)) throw erreur('REDIRECTOR_ERROR');
      return [`https://uptobox.com/${lien.split('/').pop()}`];
    },
  };
  return ad;
}

test('verifierLiens : liens directs par lots, protégés ouverts, liens morts, cache', async () => {
  configurerDisponibilite();
  const ad = fauxAllDebrid();
  const liens = ['https://1fichier.com/?film', 'https://uptobox.com/mortabc', 'https://dl-protect.link/serie-s1-e2'];
  const etats = await verifierLiens(ad, liens);
  assert.deepEqual(etats['https://1fichier.com/?film'], { dispo: true, nom: 'film.mkv', noms: ['film.mkv'], hote: 'uptobox', taille: 1000, fichiers: 1 });
  assert.equal(etats['https://uptobox.com/mortabc'].dispo, false);
  assert.match(etats['https://uptobox.com/mortabc'].message, /mort/);
  // Derrière le protecteur : le vrai hébergeur et le nom du fichier (donc l'épisode).
  assert.deepEqual([etats['https://dl-protect.link/serie-s1-e2'].hote, etats['https://dl-protect.link/serie-s1-e2'].noms], ['uptobox', ['serie-s1-e2.mkv']]);
  // Un seul link/infos pour les liens directs et les fichiers cachés derrière le protecteur.
  assert.deepEqual(ad.appels.sort(), ['infos×3', 'ouvre serie-s1-e2']);
  // Deuxième demande : tout vient du cache, aucun appel à AllDebrid.
  ad.appels.length = 0;
  await verifierLiens(ad, liens);
  assert.deepEqual(ad.appels, []);
});

test('verifierLiens : REDIRECTOR_ERROR passager réessayé, définitif au bout de trois échecs', async () => {
  configurerDisponibilite();
  const ad = fauxAllDebrid();
  const etats = await verifierLiens(ad, ['https://dl-protect.link/capricieux', 'https://dl-protect.link/casse']);
  assert.equal(etats['https://dl-protect.link/capricieux'].dispo, true);
  assert.equal(etats['https://dl-protect.link/casse'].dispo, false);
  assert.equal(ad.appels.filter((a) => a === 'ouvre capricieux').length, 2);
  assert.equal(ad.appels.filter((a) => a === 'ouvre casse').length, 3);
});

test('verifierLiens : un lien long à ouvrir revient « enCours », puis son état à la demande suivante', async () => {
  configurerDisponibilite();
  const ad = fauxAllDebrid();
  const liens = ['https://dl-protect.link/lent-1', 'https://1fichier.com/?vite'];
  const premiers = await verifierLiens(ad, liens, { attente: 100 });
  assert.equal(premiers['https://1fichier.com/?vite'].dispo, true);
  assert.deepEqual([premiers['https://dl-protect.link/lent-1'].dispo, premiers['https://dl-protect.link/lent-1'].enCours], [null, true]);
  const suivants = await verifierLiens(ad, liens, { attente: 2000 });
  assert.equal(suivants['https://dl-protect.link/lent-1'].dispo, true);
  // Le lien n'a été ouvert qu'une fois : la deuxième demande a rejoint la première.
  assert.equal(ad.appels.filter((a) => a === 'ouvre lent-1').length, 1);
});

test('verifierLiens : erreur de compte → vérification impossible', async () => {
  configurerDisponibilite();
  const ad = fauxAllDebrid();
  ad.redirecteur = async () => {
    throw erreur('AUTH_BAD_APIKEY');
  };
  await assert.rejects(verifierLiens(ad, ['https://dl-protect.link/x']), /Vérification impossible/);
});

test('hébergeur de la liste refusé deux fois par AllDebrid : plus testé ensuite', async () => {
  configurerDisponibilite();
  const ad = fauxAllDebrid();
  const source = (id, annonce) => ({ url: `https://dl-protect.link/${id}`, type: 'protege', annonce });
  retenirAnnonces([source('refus-1', 'Uptobox'), source('bon-1', 'Rapidgator')]);
  retenirAnnonces([source('refus-2', 'Uptobox'), source('bon-2', 'Rapidgator')]);
  retenirAnnonces([source('refus-3', 'Uptobox'), source('bon-3', 'Rapidgator')]);
  await verifierLiens(ad, ['https://dl-protect.link/refus-1', 'https://dl-protect.link/bon-1']);
  await verifierLiens(ad, ['https://dl-protect.link/refus-2']);
  ad.appels.length = 0;
  const etats = await verifierLiens(ad, ['https://dl-protect.link/refus-3', 'https://dl-protect.link/bon-3']);
  assert.deepEqual([etats['https://dl-protect.link/refus-3'].dispo, etats['https://dl-protect.link/refus-3'].nonGere], [false, true]);
  assert.equal(etats['https://dl-protect.link/bon-3'].dispo, true);
  assert.deepEqual(ad.appels.filter((a) => a.startsWith('ouvre')), ['ouvre bon-3']);
});

test('hébergeur annoncé absent de la liste d’AllDebrid : jamais ouvert', async () => {
  configurerDisponibilite();
  const ad = fauxAllDebrid();
  retenirAnnonces([{ url: 'https://dl-protect.link/hors-liste', type: 'protege', annonce: 'Uploady' }, { url: 'https://dl-protect.link/en-liste', type: 'protege', annonce: 'Rapidgator' }]);
  const etats = await verifierLiens(ad, ['https://dl-protect.link/hors-liste', 'https://dl-protect.link/en-liste']);
  assert.deepEqual([etats['https://dl-protect.link/hors-liste'].dispo, etats['https://dl-protect.link/hors-liste'].nonGere], [false, true]);
  assert.equal(etats['https://dl-protect.link/en-liste'].dispo, true);
  assert.deepEqual(ad.appels.filter((a) => a.startsWith('ouvre')), ['ouvre en-liste']);
});

test('annonces : ignorées si la fiche n’en a qu’une (un titre, pas un hébergeur)', async () => {
  configurerDisponibilite();
  const ad = fauxAllDebrid();
  const source = (id) => ({ url: `https://dl-protect.link/${id}`, type: 'protege', annonce: 'Dune' });
  for (const n of [1, 2, 3]) retenirAnnonces([source(`refus-a${n}`), source(`refus-b${n}`)]);
  await verifierLiens(ad, ['https://dl-protect.link/refus-a1', 'https://dl-protect.link/refus-b1', 'https://dl-protect.link/refus-a2']);
  ad.appels.length = 0;
  await verifierLiens(ad, ['https://dl-protect.link/refus-a3']);
  assert.deepEqual(ad.appels.filter((a) => a.startsWith('ouvre')), ['ouvre refus-a3']);
});

test('rythme : espacement entre les appels, plafond par minute, pause après un 503', async () => {
  configurerDisponibilite();
  const ad = fauxAllDebrid();
  const heures = [];
  ad.infosLiens = async (liens) => {
    heures.push(Date.now());
    return liens.map((link) => ({ link, filename: 'x.mkv', size: 1, host: 'uptobox' }));
  };
  const avant = { ...reglages };
  Object.assign(reglages, { espacement: 30, attenteLot: 0, parMinute: 3, minute: 400 });
  try {
    // Un link/infos par lien (demandes espacées de 15 ms). Cinq appels : jamais plus de trois par « minute » de 400 ms.
    await pause(450);
    const debut = Date.now();
    for (let i = 0; i < 5; i++) {
      verifierLiens(ad, [`https://1fichier.com/?rythme${i}`]);
      await pause(15);
    }
    await pause(700);
    assert.equal(heures.length, 5);
    for (let i = 1; i < 5; i++) assert.ok(heures[i] - heures[i - 1] >= 25, `appels ${i - 1} et ${i} trop rapprochés`);
    assert.ok(heures[3] - heures[0] >= 390, 'le 4e appel doit attendre la « minute » suivante');
    assert.ok(heures[2] - debut < 300, 'les trois premiers partent tout de suite');
    // AllDebrid demande de ralentir : rien ne part pendant la pause.
    ad.derniereSaturation = Date.now();
    const t = Date.now();
    await verifierLiens(ad, ['https://1fichier.com/?apres-saturation']);
    assert.ok(Date.now() - t >= reglages.pauseSaturation - 5);
  } finally {
    Object.assign(reglages, avant);
  }
});

// ---------- fiches ----------

// Petit site : chaque fiche liste des liens protégés « Hébergeur - Fichier.mkv ».
function fauxSite(fiches) {
  const serveur = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    const liens = fiches[url.pathname];
    res.writeHead(liens ? 200 : 404, { 'Content-Type': 'text/html; charset=utf-8' });
    const page = (liens || [])
      .map(([hote, id]) => (hote === 'magnet' ? `<a href="magnet:?xt=urn:btih:${id}&dn=Film">Magnet</a>` : `<a href="https://dl-protect.link/${id}"><strong>${hote}</strong> - Film.2024.mkv</a><br>`))
      .join('\n');
    res.end(`<html><body><h1>Fiche</h1>${page}</body></html>`);
  });
  return new Promise((ok) => serveur.listen(0, '127.0.0.1', () => ok({ serveur, site: `http://127.0.0.1:${serveur.address().port}/` })));
}
async function verdictsDe(site, chemins, ad) {
  const recus = new Map();
  await verifierFiches(site, chemins.map((c) => new URL(c, site).href), { ad, surVerdict: (v) => recus.set(new URL(v.url).pathname, v) });
  return recus;
}

test('verifierFiches : en ligne dès le premier lien vivant, KO si tout est mort, cache ensuite', async () => {
  configurerDisponibilite();
  const ad = fauxAllDebrid();
  const { serveur, site } = await fauxSite({
    '/vivante': [['Rapidgator', 'v-bon'], ['Turbobit', 'v-autre'], ['Uploady', 'v-encore']],
    '/morte': [['Rapidgator', 'm-mort-1'], ['Turbobit', 'm-mort-2']],
    '/torrent': [['Rapidgator', 't-mort-1'], ['Turbobit', 't-mort-2'], ['magnet', 'abcdef0123']],
    '/vide': [],
  });
  try {
    const v = await verdictsDe(site, ['/vivante', '/morte', '/torrent', '/vide', '/absente'], ad);
    assert.deepEqual([v.get('/vivante').etat, v.get('/vivante').total, v.get('/vivante').hote], ['ok', 3, 'uptobox']);
    // Le premier lien a répondu « en ligne » : les deux autres n'ont pas été ouverts.
    assert.deepEqual(ad.appels.filter((a) => /^ouvre v-/.test(a)), ['ouvre v-bon']);
    assert.deepEqual([v.get('/morte').etat, v.get('/morte').morts, v.get('/morte').autres], ['ko', 2, 0]);
    assert.deepEqual([v.get('/torrent').etat, v.get('/torrent').autres], ['ko', 1]);
    assert.deepEqual([v.get('/vide').etat, v.get('/vide').total], ['inconnu', 0]);
    assert.equal(v.get('/absente').etat, 'inconnu');
    assert.match(v.get('/absente').erreur, /404/);
    // Deuxième passage : les verdicts sont gardés, AllDebrid n'est pas rappelé.
    ad.appels.length = 0;
    const encore = await verdictsDe(site, ['/vivante', '/morte'], ad);
    assert.deepEqual([encore.get('/vivante').etat, encore.get('/morte').etat], ['ok', 'ko']);
    assert.deepEqual(ad.appels, []);
  } finally {
    serveur.close();
  }
});

test('verifierFiches : si le premier lien tarde, le suivant part ; lien passager → inconnu, pas KO', async () => {
  configurerDisponibilite();
  const ad = fauxAllDebrid();
  const { serveur, site } = await fauxSite({
    '/lente': [['Rapidgator', 'l-lent-mort'], ['Turbobit', 'l-bon']],
    '/douteuse': [['Rapidgator', 'd-mort'], ['Turbobit', 'd-temporaire']],
  });
  const infos = ad.infosLiens;
  ad.infosLiens = async (liens) =>
    (await infos(liens)).map((i) => (i.link.includes('temporaire') ? { link: i.link, error: { code: 'LINK_HOST_UNAVAILABLE', message: 'x' } } : i));
  try {
    const debut = Date.now();
    const v = await verdictsDe(site, ['/lente', '/douteuse'], ad);
    assert.equal(v.get('/lente').etat, 'ok');
    assert.ok(Date.now() - debut < 290, 'le verdict ne doit pas attendre le lien lent');
    assert.deepEqual([v.get('/douteuse').etat, v.get('/douteuse').morts], ['inconnu', 1]);
  } finally {
    serveur.close();
  }
});

test('verifierFiches : au-delà du délai la fiche revient « enCours », puis son verdict', async () => {
  configurerDisponibilite();
  const ad = fauxAllDebrid();
  const { serveur, site } = await fauxSite({ '/longue': [['Rapidgator', 'g-lent-mort'], ['Turbobit', 'g-lent-bon']], '/rapide': [['Rapidgator', 'g-bon']] });
  try {
    const recus = [];
    const urls = ['/longue', '/rapide'].map((c) => new URL(c, site).href);
    await verifierFiches(site, urls, { ad, attente: 120, surVerdict: (v) => recus.push([new URL(v.url).pathname, v.etat || (v.enCours ? 'enCours' : '?')]) });
    assert.deepEqual(recus, [['/rapide', 'ok'], ['/longue', 'enCours']]);
    recus.length = 0;
    await verifierFiches(site, urls, { ad, attente: 2000, surVerdict: (v) => recus.push([new URL(v.url).pathname, v.etat]) });
    assert.deepEqual(recus.sort(), [['/longue', 'ok'], ['/rapide', 'ok']]);
    assert.equal(ad.appels.filter((a) => a === 'ouvre g-lent-bon').length, 1);
  } finally {
    serveur.close();
  }
});

test('verifierFiches : demande abandonnée → pas de verdict', async () => {
  configurerDisponibilite();
  const ad = fauxAllDebrid();
  const { serveur, site } = await fauxSite({ '/a': [['Rapidgator', 'a-lent-mort'], ['Turbobit', 'a-lent-mort-2']] });
  try {
    const abandon = new AbortController();
    const recus = [];
    const travail = verifierFiches(site, [new URL('/a', site).href], { ad, signal: abandon.signal, surVerdict: (v) => recus.push(v) });
    setTimeout(() => abandon.abort(), 80);
    await travail;
    assert.deepEqual(recus, []);
  } finally {
    serveur.close();
  }
});

test('echantillon : pas de streaming ; pour une série, les liens du premier épisode', () => {
  const s = (url, extra = {}) => ({ url, type: 'protege', streaming: false, episode: null, ...extra });
  assert.deepEqual(
    echantillon([s('a'), s('b', { streaming: true }), { url: 'm', type: 'magnet' }]).liens.map((x) => x.url),
    ['a'],
  );
  const serie = echantillon([s('e2a', { episode: 2 }), s('e1a', { episode: 1 }), s('e1b', { episode: 1 }), s('e3', { episode: 3 })]);
  assert.deepEqual([serie.episode, serie.liens.map((x) => x.url)], [1, ['e1a', 'e1b']]);
});

test('états gardés sur le disque d’un lancement à l’autre', async () => {
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'debrideur-dispo-'));
  try {
    configurerDisponibilite({ dossier });
    const ad = fauxAllDebrid();
    await verifierLiens(ad, ['https://1fichier.com/?garde', 'https://uptobox.com/mortgarde']);
    await pause(150);
    assert.ok(fs.existsSync(path.join(dossier, 'disponibilite.json')));
    // « Redémarrage » : la mémoire repart du fichier.
    configurerDisponibilite({ dossier });
    ad.appels.length = 0;
    const etats = await verifierLiens(ad, ['https://1fichier.com/?garde', 'https://uptobox.com/mortgarde']);
    assert.deepEqual([etats['https://1fichier.com/?garde'].dispo, etats['https://uptobox.com/mortgarde'].dispo], [true, false]);
    assert.deepEqual(ad.appels, []);
  } finally {
    configurerDisponibilite();
    fs.rmSync(dossier, { recursive: true, force: true });
  }
});
