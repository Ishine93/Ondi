import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { lireYaml } from '../src/yaml.mjs';
import { Source, ErreurSource, appliquerModele, appliquerFiltres, versRegExp, lireTaille, lireDateFormat, lireDate, lireDepuis, verifierDescription, reglagesDe, resumerDescription, adresseLocale } from '../src/moteur-sources.mjs';
import { Sources } from '../src/sources.mjs';
import { demarrerFauxSources, DESCRIPTIONS, HASH_DUNE, HASH_BOYS } from './faux-sources.mjs';

let site;
before(async () => {
  site = await demarrerFauxSources();
});
after(() => site.fermer());

const description = (nom, ...args) => lireYaml(DESCRIPTIONS[nom](site.base, ...args));
const dossierTemp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'ondi-sources-'));

// ---------- briques ----------

test('modèles : variables, if/else, and/or/eq/ne, join, range, re_replace', () => {
  const v = { '.Keywords': 'dune 2021', '.Config.tri': 'date', '.Config.vide': null, '.Config.oui': '.True', '.True': 'True', '.False': null, '.Categories': ['1', '2'], '.Query.Season': null };
  const m = (t, modifier) => appliquerModele(t, v, modifier);
  assert.equal(m('sans modèle'), 'sans modèle');
  assert.equal(m('q={{ .Keywords }}&t={{.Config.tri}}&x={{ .Inconnue }}'), 'q=dune 2021&t=date&x=');
  assert.equal(m('{{ if .Keywords }}cherche/{{ .Keywords }}{{ else }}accueil{{ end }}'), 'cherche/dune 2021');
  assert.equal(m('{{ if .Config.vide }}a{{ else }}b{{ end }}'), 'b');
  assert.equal(m('{{ if .Categories }}a{{ else }}b{{ end }}'), 'a');
  assert.equal(m('{{ if and .Config.oui .Keywords }}a{{ else }}b{{ end }}'), 'a');
  assert.equal(m('{{ if and .Config.oui .Config.vide }}a{{ else }}b{{ end }}'), 'b');
  assert.equal(m('{{ if or .Config.vide .Keywords }}a{{ else }}b{{ end }}'), 'a');
  assert.equal(m('{{ if eq .Config.tri "date" }}a{{ else }}b{{ end }}'), 'a');
  assert.equal(m('{{ if ne .Config.tri "date" }}a{{ else }}b{{ end }}'), 'b');
  assert.equal(m('{{ if eq (.Config.tri) "nom" }}a{{ else }}b{{ end }}'), 'b');
  assert.equal(m('c={{ join .Categories "," }}'), 'c=1,2');
  assert.equal(m('{{ range .Categories }}cat[]={{.}}&{{end}}'), 'cat[]=1&cat[]=2&');
  assert.equal(m('{{ range $i, $e := .Categories }}c[{{$i}}]={{.}};{{end}}'), 'c[0]=1;c[1]=2;');
  assert.equal(m('{{ re_replace .Keywords "\\s+" "%" }}'), 'dune%2021');
  assert.equal(m('chemin/{{ .Keywords }}', encodeURIComponent), 'chemin/dune%202021');
  assert.throws(() => m('{{ if len .Keywords }}a{{ else }}b{{ end }}'), ErreurSource);
});

test('filtres : ceux des descriptions, avec les expressions écrites pour .NET', () => {
  const f = (d, ...filtres) => appliquerFiltres(d, filtres, { '.Config.mot': 'FRENCH' });
  assert.equal(f('/dl.php?id=42&x=1', { name: 'querystring', args: 'id' }), '42');
  assert.equal(f('Taille : 18.4 Go', { name: 'regexp', args: '(\\d+\\.\\d+ \\w+)' }), '18.4 Go');
  assert.equal(f('rien', { name: 'regexp', args: '(\\d+)' }), '');
  assert.equal(f('4,2 Go', { name: 're_replace', args: ['(\\w)o', '$1B'] }), '4,2 GB');
  assert.equal(f('Dune multi 2021', { name: 're_replace', args: ['(?i)\\bMULTI\\b', '{{ .Config.mot }}'] }), 'Dune FRENCH 2021');
  assert.equal(f('a b a', { name: 're_replace', args: ['(?<lettre>a)', '[${lettre}]'] }), '[a] b [a]');
  assert.equal(f('a-b-c', { name: 'split', args: ['-', '1'] }), 'b');
  assert.equal(f('a-b-c', { name: 'split', args: ['-', '-1'] }), 'c');
  assert.equal(f('a.b.c', { name: 'replace', args: ['.', ' '] }), 'a b c');
  assert.equal(f('  x  ', { name: 'trim' }), 'x');
  assert.equal(f('//x/', { name: 'trim', args: '/' }), 'x');
  assert.equal(f('b', { name: 'prepend', args: 'a' }, { name: 'append', args: 'c' }, { name: 'toupper' }), 'ABC');
  assert.equal(f('a%20b+c', { name: 'urldecode' }), 'a b c');
  assert.equal(f("l'été à", { name: 'urlencode' }), 'l%27%C3%A9t%C3%A9+%C3%A0');
  assert.equal(f('Dune &amp; co &eacute;', { name: 'htmldecode' }), 'Dune & co é');
  assert.equal(f('Éléonore à Šibenik', { name: 'diacritics', args: 'replace' }), 'Eleonore a Sibenik');
  assert.equal(f('Action, Drame / Inconnu', { name: 'validate', args: 'action, drame, comedie' }), 'action, drame');
  assert.equal(f('{"a":{"b":["x","y"]}}', { name: 'jsonjoinarray', args: ['a.b', ' | '] }), 'x | y');
  assert.equal(f('31/03/2026', { name: 'dateparse', args: 'dd/MM/yyyy' }), 'Tue, 31 Mar 2026 00:00:00 +0000');
  assert.equal(f('pas une date', { name: 'dateparse', args: 'dd/MM/yyyy' }), 'pas une date');
  assert.throws(() => f('x', { name: 'inconnu' }), ErreurSource);
  // (?i) au milieu, \A et \z, classes Unicode à la façon de .NET
  assert.ok(versRegExp('abc(?i)def').flags.includes('i'));
  assert.equal('xDune'.replace(versRegExp('\\ADune\\z'), 'y'), 'xDune');
  assert.equal('Привет Dune'.replace(versRegExp('[\\p{IsCyrillic}]+\\s*'), ''), 'Dune');
  assert.throws(() => versRegExp('(?<-o>x)'), ErreurSource);
});

test('tailles et dates', () => {
  assert.equal(lireTaille('1.5 GB'), 1610612736);
  assert.equal(lireTaille('700 MiB'), 734003200);
  assert.equal(lireTaille('1,234.5 MB'), Math.round(1234.5 * 1024 ** 2));
  assert.equal(lireTaille('4,2 GB'), Math.round(4.2 * 1024 ** 3));
  assert.equal(lireTaille('123456'), 123456);
  const iso = (ms) => new Date(ms).toISOString();
  assert.equal(iso(lireDateFormat('31/03/2026 20:06', 'dd/MM/yyyy HH:mm')), '2026-03-31T20:06:00.000Z');
  assert.equal(iso(lireDateFormat('Tue, 31 Mar 2026 20:06:13 +0100', 'ddd, dd MMM yyyy HH:mm:ss zzz')), '2026-03-31T19:06:13.000Z');
  assert.equal(iso(lireDateFormat('Oct 25, 2026 -07:00', 'MMM d, yyyy zzz')), '2026-10-25T07:00:00.000Z');
  assert.equal(iso(lireDateFormat('03/31/2026 08:06:13 PM', 'MM/dd/yyyy hh:mm:ss tt')), '2026-03-31T20:06:13.000Z');
  assert.equal(iso(lireDateFormat("2026-03-31T20:06:13", "yyyy-MM-dd'T'HH:mm:ss")), '2026-03-31T20:06:13.000Z');
  assert.equal(lireDateFormat('19/11/2026', 'MM/dd/yyyy'), null);
  assert.equal(lireDateFormat('hier', 'dd/MM/yyyy'), null);
  const maintenant = Date.UTC(2026, 10, 20, 12, 0, 0);
  assert.equal(iso(lireDepuis('2 hours ago', maintenant)), '2026-11-20T10:00:00.000Z');
  assert.equal(iso(lireDepuis('1 day, 3 hrs ago', maintenant)), '2026-11-19T09:00:00.000Z');
  assert.equal(iso(lireDepuis('il y a 3 jours', maintenant)), '2026-11-17T12:00:00.000Z');
  assert.equal(iso(lireDepuis('an hour ago', maintenant)), '2026-11-20T11:00:00.000Z');
  assert.equal(lireDepuis('bientôt', maintenant), null);
  assert.equal(iso(lireDate('1767225600', maintenant)), '2026-01-01T00:00:00.000Z');
  // Date à barres sans format annoncé : à l'américaine (c'est ce que donne une date JSON chez Prowlarr).
  assert.equal(iso(lireDate('11/19/2026 21:04:19', maintenant)), '2026-11-19T21:04:19.000Z');
  assert.equal(iso(lireDate('25/12/2026', maintenant)), '2026-12-25T00:00:00.000Z');
  assert.equal(iso(lireDate('yesterday 08:30', maintenant)), '2026-11-19T08:30:00.000Z');
  assert.equal(iso(lireDate('Tue, 31 Mar 2026 19:06:13 +0000', maintenant)), '2026-03-31T19:06:13.000Z');
  assert.equal(lireDate('jamais', maintenant), null);
});

test('adresses de la maison refusées aux descriptions', async () => {
  for (const u of ['http://localhost/x', 'http://127.0.0.1:8097/', 'http://192.168.1.1/', 'http://10.0.0.5/', 'http://172.20.1.1/', 'http://[::1]/', 'http://nas/', 'http://box.home/']) assert.ok(adresseLocale(u), u);
  for (const u of ['https://archive.org/', 'http://172.32.0.1/', 'https://exemple.fr/x']) assert.ok(!adresseLocale(u), u);
  // Sans l'option « local » (réservée aux essais), une source ne va pas sur une adresse locale.
  await assert.rejects(new Source(description('tableau')).rechercher({ q: 'dune' }), /adresse de ta maison/);
});

// ---------- une source ----------

test('description : vérification, résumé, réglages', () => {
  for (const nom of ['tableau', 'api', 'formulaire', 'flux']) assert.deepEqual(verifierDescription(description(nom)), [], nom);
  assert.match(verifierDescription(description('captcha'))[0], /captcha/);
  const casse = description('tableau');
  casse.search.fields.title = { selector: 'td:eq(2)', filters: [{ name: 'mystere' }] };
  assert.equal(verifierDescription(casse).length, 2);
  assert.deepEqual(resumerDescription(description('api')), { id: 'api', nom: 'Api privée', description: "Site de test : réponses JSON, clé d'accès", langue: 'fr-FR', acces: 'prive', lien: `${site.base}/`, films: true, series: true, connexion: 'get', antiRobot: false });
  const r = reglagesDe(description('tableau'));
  assert.deepEqual(r[0], { nom: 'tri', libelle: 'Tri des résultats', type: 'choix', options: [{ valeur: '.html', libelle: 'pertinence' }, { valeur: '.html,date', libelle: 'date' }], defaut: '.html' });
  assert.deepEqual(r[1], { nom: 'info', libelle: 'À savoir', type: 'info', texte: 'Site de test, sans inscription.', genre: 'info' });
});

test('site en tableau HTML : lignes, catégories, tailles, dates, magnet pris sur la fiche', async () => {
  const s = new Source(description('tableau'), { local: true });
  const versions = await s.rechercher({ q: 'Dune' });
  // « Autre film sans rapport » est écarté (la description demande que tous les mots y soient).
  assert.deepEqual(versions.map((v) => v.titre), ['Dune 2021 MULTi 2160p WEB x265', 'Dune Prophecy S01 VOSTFR 1080p', 'Dune Spice Wars']);
  const [dune, serie, jeu] = versions;
  assert.deepEqual(dune.categories, ['Movies']);
  assert.deepEqual(serie.categories, ['TV']);
  assert.deepEqual(jeu.categories, ['PC/Games']);
  assert.equal(dune.taille, Math.round(18.4 * 1024 ** 3));
  assert.equal(serie.taille, Math.round(4.2 * 1024 ** 3));
  assert.equal(dune.sources, 120);
  assert.equal(dune.pairs, 4);
  assert.equal(serie.pairs, 0); // cellule absente : valeur par défaut de la description
  assert.equal(new Date(dune.date).toISOString(), '2024-03-12T00:00:00.000Z');
  assert.equal(dune.lien, `${site.base}/fiche/1`);
  assert.equal(dune.source, 'tableau');
  assert.match(site.etat.demandes.at(-1).chemin, /^\/recherche\/Dune\.html$/);
  assert.deepEqual(await s.lienDe(dune), { magnet: `magnet:?xt=urn:btih:${HASH_DUNE}&dn=fiche1` });
  // Mots-clés transformés par la description, réglage choisi par l'utilisateur, recherche sans mot.
  const trie = new Source(description('tableau'), { local: true, valeurs: { tri: '.html,date' } });
  await trie.rechercher({ q: 'Dune Prophecy', type: 'serie', saison: 1 });
  assert.equal(site.etat.demandes.at(-1).chemin, '/recherche/Dune-Prophecy-saison-1.html,date');
  assert.equal((await s.rechercher({ q: '' })).length, 4);
  assert.equal(site.etat.demandes.at(-1).chemin, '/derniers/');
});

test('site privé à clé (JSON) : connexion vérifiée, catégories demandées, fichier .torrent', async () => {
  await assert.rejects(new Source(description('api'), { local: true, valeurs: { apikey: 'fausse' } }).rechercher({ q: 'Dune' }), /cle invalide/);
  const s = new Source(description('api'), { local: true, valeurs: { apikey: 'bonne', gratuit: true } });
  const versions = await s.rechercher({ q: 'Dune', type: 'film' });
  const demande = site.etat.demandes.at(-1);
  assert.equal(demande.cle, 'bonne');
  assert.equal(demande.requete, '?cat[]=1&cat[]=2&q=Dune&gratuit=1');
  // La ligne sans nom est écartée par « :has(attributs.nom) », la musique par les catégories demandées.
  assert.deepEqual(versions.map((v) => v.titre), ['Dune.2021.MULTi.VFF.2160p.UHD.BluRay.REMUX.HEVC-GRP', 'Dune.2021.FRENCH.1080p.WEB.x264-GRP']);
  assert.deepEqual(versions[0].categories, ['Movies/UHD']);
  assert.equal(versions[0].infohash, HASH_DUNE);
  assert.equal(versions[0].magnet, undefined); // site privé : pas de magnet fabriqué, il faut son fichier .torrent
  assert.equal(versions[0].taille, 61234567890);
  assert.equal(versions[1].taille, 8 * 1024 ** 3);
  assert.equal(versions[0].sources, 35);
  assert.equal(new Date(versions[0].date).toISOString(), '2026-03-31T20:06:13.000Z');
  assert.equal(new Date(versions[1].date).toISOString(), '2025-01-02T02:04:05.000Z');
  const lien = await s.lienDe(versions[0]);
  assert.equal(lien.torrent.toString(), 'd8:announce20:http://x.test/annonce4:infod4:name2:41ee');
  assert.equal(lien.nom, 'Dune.2021.MULTi.VFF.2160p.UHD.BluRay.REMUX.HEVC-GRP.torrent');
  // Série : seule la catégorie des séries est demandée, avec le numéro de saison.
  await s.rechercher({ q: 'The Boys', type: 'serie', saison: 2 });
  assert.equal(site.etat.demandes.at(-1).requete, '?cat[]=5&q=The+Boys+S02&saison=2&gratuit=1');
});

test('site à formulaire : connexion, session gardée, reconnexion quand elle expire', async () => {
  site.etat.session = 'sess-1';
  let gardes = '';
  const options = { local: true, valeurs: { username: 'moi', password: 'secret' }, surTemoins: (t) => (gardes = t) };
  const s = new Source(description('formulaire'), options);
  const avant = site.etat.connexions;
  const versions = await s.rechercher({ q: 'Dune' });
  assert.equal(site.etat.connexions, avant + 1);
  assert.equal(versions.length, 1);
  assert.equal(versions[0].titre, 'Dune.2021.MULTi.1080p.BluRay.x264-GRP');
  assert.equal(versions[0].taille, 2147483648);
  assert.equal(versions[0].sources, 1234);
  assert.ok(Math.abs(Date.now() - 2 * 3600_000 - versions[0].date) < 60_000);
  assert.equal(gardes, 'session=sess-1; langue=fr');
  // Deuxième recherche : pas de nouvelle connexion.
  await s.rechercher({ q: 'Dune' });
  assert.equal(site.etat.connexions, avant + 1);
  // Une autre instance repart de la session gardée.
  const repris = new Source(description('formulaire'), { ...options, temoins: gardes });
  assert.equal((await repris.rechercher({ q: 'Dune' })).length, 1);
  assert.equal(site.etat.connexions, avant + 1);
  // La session expire côté site : reconnexion toute seule, puis fichier .torrent avec la nouvelle session.
  site.etat.session = 'sess-2';
  assert.equal((await repris.rechercher({ q: 'Dune' })).length, 1);
  assert.equal(site.etat.connexions, avant + 2);
  assert.equal(gardes, 'session=sess-2; langue=fr');
  assert.equal((await repris.lienDe(versions[0])).torrent.toString(), 'd4:infod4:name4:Duneee');
  // Mauvais mot de passe : le message du site est rendu.
  await assert.rejects(new Source(description('formulaire'), { local: true, valeurs: { username: 'moi', password: 'faux' } }).rechercher({ q: 'Dune' }), /Formulaire : Identifiant ou mot de passe incorrect\./);
});

test('site en XML : magnet fabriqué à partir de l’empreinte', async () => {
  const versions = await new Source(description('flux'), { local: true }).rechercher({ q: 'Dune' });
  assert.equal(versions.length, 2);
  assert.equal(versions[0].titre, 'Dune.2021.MULTi.2160p.WEB-DL.DV.HDR.x265-GRP');
  assert.deepEqual(versions[0].categories, ['Movies']);
  assert.equal(versions[0].infohash, HASH_DUNE);
  assert.match(versions[0].magnet, new RegExp(`^magnet:\\?xt=urn:btih:${HASH_DUNE}&dn=Dune\\.2021`));
  assert.equal(versions[0].taille, 19000000000);
  assert.equal(new Date(versions[0].date).toISOString(), '2026-03-31T19:06:13.000Z');
});

// ---------- catalogue, sources activées, recherche groupée ----------

test('catalogue : téléchargé, gardé sur le disque, descriptions inutilisables signalées', async () => {
  const dossier = dossierTemp();
  const journal = [];
  const sources = new Sources({ dossier, adresse: `${site.base}/catalogue.tar.gz`, local: true, journal: (...m) => journal.push(m.join(' ')) });
  const avant = site.etat.catalogue.telechargements;
  const { sources: liste, date } = await sources.catalogue();
  assert.equal(site.etat.catalogue.telechargements, avant + 1);
  assert.ok(Date.now() - date < 5000);
  // Seul le dossier du format connu est lu ; la description illisible est laissée de côté.
  assert.deepEqual(liste.map((s) => s.id), ['api', 'captcha', 'flux', 'flux2', 'formulaire', 'tableau']);
  assert.deepEqual(liste.find((s) => s.id === 'captcha'), { ...liste.find((s) => s.id === 'captcha'), utilisable: false, raison: 'connexion avec image à recopier (captcha)', active: false });
  assert.ok(liste.filter((s) => s.id !== 'captcha').every((s) => s.utilisable && !s.raison));
  assert.match(journal[0], /catalogue mis à jour \(6 descriptions\)/);
  // Un autre lancement : le catalogue vient du disque, sans rien redemander.
  const relance = new Sources({ dossier, adresse: `${site.base}/catalogue.tar.gz`, local: true });
  assert.equal((await relance.catalogue()).sources.length, 6);
  assert.equal(site.etat.catalogue.telechargements, avant + 1);
  // Mise à jour demandée : inchangé chez le site (rien à retélécharger), puis une description en moins.
  await relance.catalogue({ frais: true });
  assert.equal(site.etat.catalogue.telechargements, avant + 1);
  site.etat.catalogue.sans = ['flux2'];
  assert.equal((await relance.catalogue({ frais: true })).sources.length, 5);
  site.etat.catalogue.sans = [];
  // Catalogue injoignable et rien sur le disque : erreur claire.
  await assert.rejects(new Sources({ dossier: dossierTemp(), adresse: 'http://127.0.0.1:9/rien' }).catalogue(), ErreurSource);
  await assert.rejects(sources.enregistrer('captcha'), /n'est pas utilisable/);
  await assert.rejects(sources.enregistrer('inconnue'), /inconnue du catalogue/);
});

test('sources activées : réglages gardés, secrets jamais renvoyés', async () => {
  const dossier = dossierTemp();
  const sources = new Sources({ dossier, adresse: `${site.base}/catalogue.tar.gz`, local: true });
  let f = await sources.formulaire('api');
  assert.equal(f.active, false);
  assert.deepEqual(f.reglages, [
    { nom: 'apikey', libelle: "Clé d'accès", type: 'secret', defaut: '', rempli: false },
    { nom: 'gratuit', libelle: 'Seulement les versions gratuites', type: 'case', defaut: false, valeur: false },
  ]);
  await sources.enregistrer('api', { valeurs: { apikey: ' bonne ', gratuit: true, inconnu: 'x' } });
  f = await sources.formulaire('api');
  assert.equal(f.active, true);
  assert.deepEqual(f.reglages.map((r) => [r.nom, r.rempli ?? r.valeur]), [['apikey', true], ['gratuit', true]]);
  assert.ok(!JSON.stringify(f).includes('bonne'));
  // Clé laissée vide en changeant un autre réglage : elle est gardée.
  await sources.enregistrer('api', { valeurs: { apikey: '', gratuit: false } });
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dossier, 'sources.json'), 'utf8')).sources, [{ id: 'api', valeurs: { apikey: 'bonne', gratuit: false }, lien: '', temoins: '' }]);
  assert.deepEqual(await sources.essayer('api').then((r) => [r.versions, r.exemple]), [3, 'Dune.2021.MULTi.VFF.2160p.UHD.BluRay.REMUX.HEVC-GRP']);
  // Choix hors liste ignoré, adresse du site changée, session gardée d'un lancement à l'autre.
  await sources.enregistrer('tableau', { valeurs: { tri: 'nimporte' }, lien: 'miroir.exemple.fr/chemin' });
  assert.equal((await sources.formulaire('tableau')).reglages[0].valeur, '.html');
  assert.equal((await sources.formulaire('tableau')).lien, 'https://miroir.exemple.fr/');
  await sources.enregistrer('tableau', { lien: `${site.base}/` });
  assert.equal((await sources.formulaire('tableau')).lien, `${site.base}/`);
  site.etat.session = 'sess-3';
  await sources.enregistrer('formulaire', { valeurs: { username: 'moi', password: 'secret' } });
  await sources.essayer('formulaire');
  const relance = new Sources({ dossier, adresse: `${site.base}/catalogue.tar.gz`, local: true });
  assert.deepEqual((await relance.actives()).map((s) => [s.id, s.acces, s.utilisable]), [['api', 'prive', true], ['tableau', 'libre', true], ['formulaire', 'inscription', true]]);
  const connexions = site.etat.connexions;
  await relance.essayer('formulaire');
  assert.equal(site.etat.connexions, connexions);
  relance.retirer('formulaire');
  assert.deepEqual((await relance.actives()).map((s) => s.id), ['api', 'tableau']);
  await assert.rejects(relance.essayer('formulaire'), /non activée/);
});

test('recherche groupée : toutes les sources à la fois, doublons réunis, pannes signalées', async () => {
  const sources = new Sources({ dossier: dossierTemp(), adresse: `${site.base}/catalogue.tar.gz`, local: true });
  assert.deepEqual(await sources.rechercher({ q: 'Dune' }), { versions: [], contenus: [], sources: [] });
  await sources.enregistrer('tableau');
  await sources.enregistrer('flux');
  await sources.enregistrer('flux2');
  await sources.enregistrer('api', { valeurs: { apikey: 'fausse' } });
  const { versions, sources: bilan } = await sources.rechercher({ q: 'Dune', type: 'film' });
  assert.deepEqual(bilan.map((b) => [b.id, b.versions ?? b.erreur]), [['api', 'Api privée : cle invalide'], ['flux', 2], ['flux2', 2], ['tableau', 3]]);
  // Le jeu vidéo et « The Boys » (mot absent) sont écartés ; la version vue sur Flux et Flux bis n'apparaît qu'une fois.
  // Profil par défaut (4K, français et version originale dans le fichier) : celles qui conviennent d'abord,
  // la mieux notée en tête ; les autres disent pourquoi elles ne conviennent pas.
  assert.deepEqual(versions.map((v) => [v.nom, v.sourceNom, v.autres, v.convient, v.refus]), [
    ['Dune.2021.MULTi.2160p.WEB-DL.DV.HDR.x265-GRP', 'Flux', ['Flux bis'], true, ''],
    ['Dune 2021 MULTi 2160p WEB x265', 'Tableau', [], true, ''],
    ['Dune Prophecy S01 VOSTFR 1080p', 'Tableau', [], false, '1080p au lieu de 4K'],
  ]);
  const [flux, tableau, serie] = versions;
  assert.deepEqual([flux.titre, flux.annee, flux.definition, flux.origine, flux.langues, flux.vf, flux.vo, flux.hdr, flux.saison], ['Dune', 2021, 2160, 'webdl', ['MULTI'], true, true, ['dv', 'hdr'], null]);
  assert.deepEqual([serie.titre, serie.saison, serie.langues, serie.vf], ['Dune Prophecy', 1, ['VOSTFR'], false]);
  assert.equal(tableau.sources, 120);
  assert.ok(flux.note > tableau.note && serie.note === 0);
  // Un autre profil (toutes définitions, toutes langues) accepte les trois.
  const large = await sources.rechercher({ q: 'Dune' }, { profil: { definitions: [], langue: 'toutes' } });
  assert.deepEqual(large.versions.map((v) => v.convient), [true, true, true]);
  // Rien de ce qui sert à télécharger ne part vers la page : seulement un identifiant.
  assert.ok(!JSON.stringify(versions).includes('magnet:') && !JSON.stringify(versions).includes(site.base));
  assert.deepEqual(await sources.lienDe(tableau.id), { magnet: `magnet:?xt=urn:btih:${HASH_DUNE}&dn=fiche1`, titre: 'Dune 2021 MULTi 2160p WEB x265' });
  assert.match((await sources.lienDe(flux.id)).magnet, new RegExp(HASH_DUNE));
  await assert.rejects(sources.lienDe('inconnu'), /relance la recherche/);
  // Les mêmes versions regroupées par film ou série, pour les affiches.
  const { contenus } = await sources.rechercher({ q: 'Dune', type: 'film' });
  assert.deepEqual(contenus.map((c) => [c.type, c.titre, c.annee, c.versions.length, c.conviennent, c.definitions, c.familles]), [
    ['film', 'Dune', 2021, 2, 2, [2160], ['multi']],
    ['serie', 'Dune Prophecy', null, 1, 0, [1080], ['vostfr']],
  ]);
  assert.deepEqual(contenus[0].versions, [flux.id, tableau.id]);
  // La page reçoit les résultats au fur et à mesure : un point d'étape par source qui répond, avant le résultat final.
  const etapes = [];
  const fin = await sources.rechercher({ q: 'Dune' }, { surProgres: (r) => etapes.push(r.sources.length) });
  assert.deepEqual([etapes, fin.sources.length], [[1, 2, 3], 4]);

  // Une source en panne n'empêche pas les autres ; elle est laissée de côté quelques minutes (sans la redemander).
  site.etat.panne = true;
  const r = await sources.rechercher({ q: 'The Boys', type: 'serie' });
  site.etat.panne = false;
  assert.deepEqual(r.sources.filter((b) => b.erreur).map((b) => [b.id, b.erreur]), [['api', 'Api privée : cle invalide'], ['flux', 'Flux a répondu « HTTP 500 ».'], ['flux2', 'Flux bis a répondu « HTTP 500 ».']]);
  assert.deepEqual(r.versions, []);
  const avant = site.etat.demandes.length;
  const pause = await sources.rechercher({ q: 'the boys', type: 'serie' });
  assert.deepEqual(pause.sources.map((b) => [b.id, !!b.enPause]), [['api', true], ['flux', true], ['flux2', true], ['tableau', false]]);
  assert.equal(site.etat.demandes.length, avant + 1); // seul Tableau a été interrogé
  // Un essai de la source (ou un changement de ses réglages) lève la pause.
  await sources.essayer('flux');
  const boys = await sources.rechercher({ q: 'the boys', type: 'serie' });
  assert.deepEqual(boys.versions.map((v) => [v.nom, v.sourceNom, v.saison, v.refus, HASH_BOYS.length]), [['The.Boys.S01.MULTi.1080p.WEB.x264-GRP', 'Flux', 1, '1080p au lieu de 4K', 40]]);
  assert.deepEqual(boys.contenus.map((c) => [c.type, c.titre, c.saisons]), [['serie', 'The Boys', [1]]]);
  // Nouveautés (recherche sans mot), gardées en mémoire : deux demandes de suite n'interrogent les sites qu'une fois.
  const n1 = sources.nouveautes('film');
  const n2 = sources.nouveautes('film');
  assert.equal(n1, n2);
  assert.deepEqual((await n1).contenus.map((c) => c.titre).sort(), ['Autre film sans rapport', 'Dune', 'Dune Prophecy', 'The Boys']);
});

test('un même film sous deux noms : une seule carte, sous son titre officiel', async () => {
  const officiels = { 'dune part two': { titre: 'Dune : Deuxième partie', annee: 2024 }, 'dune deuxieme partie': { titre: 'Dune : Deuxième partie', annee: 2024 }, dune: { titre: 'Dune', annee: 2021 }, 'the boys': { titre: 'The Boys', annee: 2019 } };
  const demandes = [];
  const sources = new Sources({
    dossier: dossierTemp(),
    adresse: `${site.base}/catalogue.tar.gz`,
    local: true,
    identifier: async ({ titre, annee, type }) => {
      demandes.push([titre, annee, type]);
      return officiels[titre.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')] || null;
    },
  });
  const contenu = (cle, type, titre, annee, versions, extra = {}) => ({ cle, cleSite: cle, titreAffiche: titre, type, titre, annee, saisons: [], versions, conviennent: versions.length, definitions: [1080], familles: ['multi'], note: 100, date: 1, pertinence: 2, ...extra });
  const r = await sources.unifier({
    versions: ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => ({ id })),
    sources: [],
    contenus: [
      contenu('x1', 'film', 'Dune Part Two', 2024, ['b'], { definitions: [2160], note: 120 }),
      contenu('x2', 'film', 'Dune Deuxième Partie', 2024, ['a', 'c'], { familles: ['vf'] }),
      contenu('x3', 'film', 'Dune', 1984, ['d']), // l'année ne colle pas avec le « Dune » officiel (2021) : laissé tel quel
      contenu('x4', 'film', 'Film Inconnu', 2020, ['e']),
      contenu('x5', 'serie', 'The Boys', null, ['f'], { saisons: [1] }),
    ],
  });
  assert.deepEqual(r.contenus.map((c) => [c.type, c.titreAffiche, c.cleSite, c.versions, c.conviennent]), [
    ['film', 'Dune : Deuxième partie (2024)', 'dune deuxieme partie 2024', ['a', 'b', 'c'], 3],
    ['film', 'Dune', 'x3', ['d'], 1],
    ['film', 'Film Inconnu', 'x4', ['e'], 1],
    ['serie', 'The Boys', 'the boys', ['f'], 1],
  ]);
  assert.deepEqual([r.contenus[0].definitions, r.contenus[0].familles, r.contenus[0].note], [[2160, 1080], ['multi', 'vf'], 120]);
  assert.equal(demandes.length, 5);
});
