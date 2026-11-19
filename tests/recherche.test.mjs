import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {
  lireHtml, trouverBarre, requeteRecherche, extraireResultats, extraireSources, classerLien, motsCles, decoderEntites, lireSite,
  trouverPagination, rechercher, verifierLiens,
} from '../src/recherche.mjs';

const HEBERGEURS = {
  hebergeurs: new Map([['1fichier.com', '1fichier'], ['uptobox.com', 'uptobox'], ['rapidgator.net', 'rapidgator']]),
  redirecteurs: new Map([['dl-protect.link', 'dl-protect']]),
};

test('decoderEntites', () => {
  assert.equal(decoderEntites('Prot&eacute;g&eacute; &amp; co &#039;x&#x27; &laquo;a&raquo;'), "Protégé & co 'x' «a»");
  assert.equal(decoderEntites('?a=1&copy=2'), '?a=1&copy=2');
});

test('lireHtml : liens, groupes, texte avant, scripts ignorés', () => {
  const doc = lireHtml(
    `<html><head><title>Ma page</title><script>var a = "<a href='/piege'>x</a>";</script></head><body>
     <h1>Titre &amp; fiche</h1>
     <h3>1080p</h3>
     <b>1fichier</b> : <a href="https://1fichier.com/?abc" title="t">Télécharger</a>
     <a href='/relatif?x=1&amp;y=2'><img data-src="/i.jpg" src="data:image/gif;base64,AA" alt="Affiche"></a>
     <a href="javascript:void(0)">js</a>
     <!-- <a href="/commentaire">c</a> -->
     </body></html>`,
    'https://site.test/fiche/1.html',
  );
  assert.equal(doc.titre, 'Titre & fiche');
  assert.deepEqual(doc.liens.map((l) => l.url), ['https://1fichier.com/?abc', 'https://site.test/relatif?x=1&y=2']);
  assert.equal(doc.liens[0].groupe, '1080p');
  assert.equal(doc.liens[0].avant, '1fichier');
  assert.equal(doc.liens[0].texte, 'Télécharger');
  assert.equal(doc.liens[1].image, 'https://site.test/i.jpg');
  assert.equal(doc.liens[1].alt, 'Affiche');
});

test('lireHtml : « texte avant » ignore les séparateurs', () => {
  const doc = lireHtml('<p>Épisode 3 : <a href="https://1fichier.com/?e3">DL</a></p>', 'https://s.test/');
  assert.equal(doc.liens[0].avant, 'Épisode 3 :');
});

test('lireHtml : un titre de section ne sert pas de « texte avant »', () => {
  const doc = lireHtml('<p>Intro</p><h3>4K</h3><a href="https://dl-protect.link/a">1fichier</a> · <a href="https://rapidgator.net/file/1">Rapidgator</a>', 'https://s.test/');
  assert.deepEqual(doc.liens.map((l) => [l.groupe, l.avant]), [['4K', ''], ['4K', '']]);
});

test('trouverBarre : formulaire DLE en POST, pas la newsletter', () => {
  const doc = lireHtml(
    `<form method="post" action="/newsletter"><input type="email" name="email"><input name="nom"><button>OK</button></form>
     <form method="post" action=""><input type="hidden" name="do" value="search"><input type="hidden" name="subaction" value="search">
     <input id="story" name="story" placeholder="Rechercher..." type="text"><button type="submit">OK</button></form>`,
    'https://site.test/',
  );
  const barre = trouverBarre(doc.formulaires);
  assert.deepEqual(barre, { action: 'https://site.test/', methode: 'POST', champ: 'story', autres: [['do', 'search'], ['subaction', 'search']] });
  assert.deepEqual(requeteRecherche(barre, 'dune 2'), { url: 'https://site.test/', methode: 'POST', corps: 'do=search&subaction=search&story=dune+2' });
});

test('trouverBarre : formulaire WordPress en GET', () => {
  const doc = lireHtml(
    `<form role="search" action="https://blog.test/?lang=fr"><input type="search" name="s"><select name="cat"><option value="0">Tout</option><option value="3" selected>Films</option></select><input type="submit" value="Go"></form>`,
    'https://blog.test/',
  );
  const barre = trouverBarre(doc.formulaires);
  assert.equal(barre.champ, 's');
  assert.equal(requeteRecherche(barre, 'la ligne verte').url, 'https://blog.test/?cat=3&s=la+ligne+verte');
});

test('requeteRecherche : la catégorie est collée à la fin (et remplace celle du formulaire)', () => {
  const barre = { action: 'https://s.test/', methode: 'GET', champ: 'search', autres: [['p', 'films']] };
  assert.equal(requeteRecherche(barre, 'one piece', { nom: 'p', valeur: 'mangas' }).url, 'https://s.test/?search=one+piece&p=mangas');
  assert.equal(requeteRecherche(barre, 'dune').url, 'https://s.test/?p=films&search=dune');
});

test('trouverBarre : rien de reconnaissable', () => {
  const doc = lireHtml('<form action="/login"><input name="user"><input type="password" name="pass"></form>', 'https://s.test/');
  assert.equal(trouverBarre(doc.formulaires), null);
});

test('motsCles', () => {
  assert.deepEqual(motsCles('The Boys'), ['boys']);
  assert.deepEqual(motsCles('Le Seigneur des Anneaux'), ['seigneur', 'anneaux']);
  assert.deepEqual(motsCles('Les'), ['les']);
  assert.deepEqual(motsCles('Dune : Deuxième partie'), ['dune', 'deuxieme', 'partie']);
});

const PAGE_RESULTATS = `
  <nav><a href="/">Accueil</a><a href="/films/">Films</a><a href="/contact.html">Contact</a><a href="/tags/dune/">dune</a></nav>
  <article><a href="/films/1-dune-deuxieme-partie.html"><img data-src="/img/1.jpg" alt="Dune : Deuxième partie"></a>
    <h2><a href="/films/1-dune-deuxieme-partie.html">Dune : Deuxième partie</a></h2><a href="/films/1-dune-deuxieme-partie.html">Lire la suite</a></article>
  <article><h2><a href="/films/4-dune.html">Dune</a></h2></article>
  <aside><a href="/series/2-the-boys-saison-4.html">The Boys - Saison 4</a></aside>
  <div class="pages"><a href="/page/2/">2</a><a href="javascript:list_submit(2)">3</a></div>
  <a href="https://autre.test/films/dune.html">Dune ailleurs</a>`;

test('extraireResultats : garde les fiches qui correspondent, sans doublons ni menu', () => {
  const doc = lireHtml(PAGE_RESULTATS, 'https://www.site.test/');
  const accueil = new Set(['https://www.site.test/films/', 'https://www.site.test/contact.html']);
  const { resultats, approximatif } = extraireResultats(doc, 'dune', { accueil });
  assert.equal(approximatif, false);
  assert.deepEqual(
    resultats.map((r) => [r.titre, r.chemin]),
    [['Dune : Deuxième partie', '/films/1-dune-deuxieme-partie.html'], ['Dune', '/films/4-dune.html']],
  );
  assert.equal(resultats[0].image, 'https://www.site.test/img/1.jpg');
});

test('extraireResultats : le mieux noté passe devant', () => {
  const doc = lireHtml(PAGE_RESULTATS, 'https://site.test/');
  const { resultats } = extraireResultats(doc, 'dune deuxième');
  assert.equal(resultats[0].titre, 'Dune : Deuxième partie');
});

test('extraireResultats : rien ne correspond → résultats approximatifs signalés', () => {
  const doc = lireHtml(PAGE_RESULTATS, 'https://site.test/');
  const r = extraireResultats(doc, 'boys inconnu titre absent');
  assert.equal(r.approximatif, true);
  assert.deepEqual([r.resultats[0].titre, r.resultats[0].saison], ['The Boys', 'Saison 4']);
});

test('trouverPagination : &page=N en gardant la recherche', () => {
  const doc = lireHtml(
    `<a href="/recherche?q=star+wars">1</a> <a href="/recherche?q=star%20wars&amp;page=2">2</a>
     <a href="/recherche?page=3&amp;q=star+wars">3</a> <a href="/recherche?q=star+wars&amp;page=12">Dernière</a>
     <a href="/recherche?q=autre&amp;page=2">piège : autre recherche</a>
     <a href="/films/?page=2">piège : autre rubrique</a>
     <a href="/fiche/123-star-wars.html">Star Wars</a>`,
    'https://site.test/recherche?q=star+wars',
  );
  const p = trouverPagination(doc);
  assert.equal(p.modele, 'https://site.test/recherche?q=star+wars&page={page}');
  assert.equal(p.total, 12);
  assert.equal(p.courante, 1);
  assert.equal(p.liens.size, 3);
  assert.equal(p.liens.has('https://site.test/fiche/123-star-wars.html'), false);
});

test('trouverPagination : page courante, /page/N/ et paramètre « p » ambigu', () => {
  const surPage3 = lireHtml('<a href="?q=x&amp;page=2">‹</a><a href="?q=x&amp;page=4">›</a>', 'https://s.test/?q=x&page=3');
  assert.deepEqual([trouverPagination(surPage3).courante, trouverPagination(surPage3).total], [3, 4]);

  const wordpress = lireHtml('<a href="/page/2/?s=dune">2</a><a href="/page/5/?s=dune">5</a>', 'https://s.test/?s=dune');
  assert.deepEqual([trouverPagination(wordpress).modele, trouverPagination(wordpress).total], ['https://s.test/page/{page}/?s=dune', 5]);

  // « p=films » n'est pas un numéro de page ; « p=12 » identique à la page affichée non plus.
  const ambigu = lireHtml('<a href="?p=series&amp;search=x">Séries</a><a href="?p=films&amp;search=x&amp;page=2">2</a>', 'https://s.test/?p=films&search=x');
  assert.equal(trouverPagination(ambigu).modele, 'https://s.test/?p=films&search=x&page={page}');

  const rien = lireHtml('<a href="/fiche/1.html">Fiche</a>', 'https://s.test/?q=x');
  assert.equal(trouverPagination(rien).modele, null);
});

test('rechercher : pages devinées (&page=N) et pagination du site ignorée en POST', async () => {
  const liste = (n0, nb) => Array.from({ length: nb }, (_, i) => `<h2><a href="/fiche/${n0 + i}.html">Film numéro ${n0 + i}</a></h2>`).join('');
  const srv = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    // Site A : recherche GET sans liens de pagination (faits en JavaScript), 2 pages ; au-delà, il renvoie la page 1.
    if (u.pathname === '/a/') return res.end('<form action="/a/cherche"><input type="search" name="s"></form>');
    if (u.pathname === '/a/cherche') return res.end(u.searchParams.get('page') === '2' ? liste(11, 10) : liste(1, 10));
    // Site B : recherche POST ; /page/2/ est la pagination générale du site, pas celle de la recherche.
    if (u.pathname === '/b/' && req.method === 'GET') return res.end('<form method="post" action="/b/"><input name="q" placeholder="Rechercher"></form>');
    if (u.pathname === '/b/') return res.end(`${liste(1, 3)}<a href="/b/page/2/">2</a><a href="/b/page/9/">9</a>`);
    res.end('');
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  try {
    const p1 = await rechercher(`${base}/a/`, 'film');
    assert.equal(p1.resultats.length, 10);
    assert.deepEqual(p1.pages, { total: 1, suivante: true, devine: true });
    const p2 = await rechercher(`${base}/a/`, 'film', { page: 2 });
    assert.equal(p2.resultats[0].titre, 'Film numéro 11');
    const p3 = await rechercher(`${base}/a/`, 'film', { page: 3 });
    assert.deepEqual([p3.resultats.length, p3.pages.suivante], [0, false]);

    const b = await rechercher(`${base}/b/`, 'film');
    assert.deepEqual([b.resultats.length, b.pages.suivante], [3, false]);
  } finally {
    srv.close();
  }
});

test('extraireResultats : même contenu en plusieurs versions → même clé', () => {
  const doc = lireHtml(
    `<ul>
       <li><a href="/f/1-dune-2.html">Dune : Deuxième partie</a> <span>1080p</span> <span>MULTI</span></li>
       <li><a href="/f/2-dune-2-4k.html">Dune : Deuxième partie</a> <span>4K</span> <span>VOSTFR</span></li>
       <li><a href="/f/3-dune-2-hd.html">Dune : Deuxième partie - HDLight 720p</a></li>
       <li><a href="/f/4-dune.html">Dune</a> <span>Bientôt</span></li>
     </ul>`,
    'https://site.test/recherche?q=dune',
  );
  const { resultats } = extraireResultats(doc, 'dune');
  assert.deepEqual(
    resultats.map((r) => [r.cle, r.langue, r.qualite]),
    [['dune deuxieme partie', 'MULTI', '1080p'], ['dune deuxieme partie', 'VOSTFR', '4K'], ['dune deuxieme partie', '', 'HDLight 720p'], ['dune', '', '']],
  );
});

test('classerLien', () => {
  assert.deepEqual(classerLien('https://1fichier.com/?abc', HEBERGEURS), { type: 'hebergeur', hebergeur: '1fichier' });
  assert.deepEqual(classerLien('https://www.uptobox.com/xyz', HEBERGEURS), { type: 'hebergeur', hebergeur: 'uptobox' });
  assert.equal(classerLien('https://1fichier.com/', HEBERGEURS), null);
  assert.equal(classerLien('https://1fichier.com/register.pl', HEBERGEURS), null);
  assert.deepEqual(classerLien('https://dl-protect.link/abc', HEBERGEURS), { type: 'protege', hebergeur: 'dl-protect' });
  assert.deepEqual(classerLien('https://dl-protect2.net/abc', HEBERGEURS), { type: 'protege', hebergeur: 'dl-protect' });
  assert.equal(classerLien('https://facebook.com/share', HEBERGEURS), null);
  assert.equal(classerLien('magnet:?xt=urn:btih:ABCDEF&dn=Film.Test', HEBERGEURS).nom, 'Film.Test');
  assert.equal(classerLien('https://site.test/t/film.torrent', HEBERGEURS).type, 'torrent');
});

test('extraireSources : types, groupes, libellés, doublons, liens en clair', () => {
  const doc = lireHtml(
    `<h1>Fiche</h1>
     <h3>1080p</h3>
     <b>1fichier</b> : <a href="https://1fichier.com/?film">Télécharger</a>
     Épisode 2 : <a href="https://1fichier.com/?ep2">Télécharger</a>
     <a href="https://1fichier.com/?film">Doublon</a>
     <h3>4K</h3>
     <a href="https://dl-protect.link/abc">1fichier</a>
     <a href="https://rapidgator.net/file/1/Film.2160p.mkv.html">Film.2160p.mkv</a>
     <a href="magnet:?xt=urn:btih:abc&amp;dn=Film.Test">Magnet</a>
     <a href="magnet:?xt=urn:btih:ABC&amp;tr=x">Autre magnet, même hash</a>
     <h3>À copier</h3>
     <pre>https://uptobox.com/ep3,
https://uptobox.com/ep4</pre>
     <footer><a href="https://1fichier.com/">Premium</a></footer>`,
    'https://site.test/fiche.html',
  );
  const sources = extraireSources(doc, HEBERGEURS);
  assert.deepEqual(
    sources.map((s) => [s.type, s.hebergeur, s.libelle, s.groupe, s.url]),
    [
      ['hebergeur', '1fichier', '', '1080p', 'https://1fichier.com/?film'],
      ['hebergeur', '1fichier', 'Épisode 2', '1080p', 'https://1fichier.com/?ep2'],
      ['protege', 'dl-protect', '1fichier', '4K', 'https://dl-protect.link/abc'],
      ['hebergeur', 'rapidgator', 'Film.2160p.mkv', '4K', 'https://rapidgator.net/file/1/Film.2160p.mkv.html'],
      ['magnet', 'Magnet', 'Film.Test', '4K', 'magnet:?xt=urn:btih:abc&dn=Film.Test'],
      ['hebergeur', 'uptobox', '', 'À copier', 'https://uptobox.com/ep3'],
      ['hebergeur', 'uptobox', '', 'À copier', 'https://uptobox.com/ep4'],
    ],
  );
});

test('extraireSources : fiche de série (épisode dans « fn » en base64, hébergeur dans le texte, streaming)', () => {
  const fn = (t) => Buffer.from(t).toString('base64');
  const lien = (id, ep, texte) => `<a href="https://dl-protect.link/${id}?fn=${fn(`The Boys - Saison 1 Épisode ${ep} - [VF HD]`)}">${texte}</a>`;
  const doc = lireHtml(
    `<h2>The Boys - Saison 1 VF HD</h2>
     ${lien('a1', 1, 'Uploady - Télécharger')} ${lien('b1', 1, 'Rapidgator - Télécharger')}
     ${lien('a2', 2, 'Uploady - Télécharger')} ${lien('b2', 2, 'Rapidgator - Télécharger')}
     ${lien('c1', 1, 'Vidoza - Regarder')}`,
    'https://site.test/?p=serie&id=1',
  );
  const sources = extraireSources(doc, HEBERGEURS);
  assert.deepEqual(
    sources.map((s) => [s.hebergeur, s.protecteur, s.saison, s.episode, s.streaming]),
    [
      ['Uploady', 'dl-protect', 1, 1, false],
      ['Rapidgator', 'dl-protect', 1, 1, false],
      ['Uploady', 'dl-protect', 1, 2, false],
      ['Rapidgator', 'dl-protect', 1, 2, false],
      ['Vidoza', 'dl-protect', 1, 1, true],
    ],
  );
  assert.equal(sources[2].libelle, 'The Boys - Saison 1 Épisode 2 - [VF HD]');
});

test('verifierLiens : liens directs par lots, protégés ouverts, liens morts, cache', async () => {
  const appels = [];
  const ad = {
    hebergeurs: async () => HEBERGEURS,
    infosLiens: async (liens) => {
      appels.push(`infos×${liens.length}`);
      return liens.map((link) =>
        link.includes('mort')
          ? { link, error: { code: 'LINK_DOWN', message: 'This link is not available' } }
          : { link, filename: `${link.split(/[/?]/).pop()}.mkv`, size: 1000, host: 'uptobox' },
      );
    },
    redirecteur: async (lien) => {
      appels.push('redirecteur');
      return [`https://uptobox.com/${lien.split('/').pop()}`];
    },
  };
  const liens = ['https://1fichier.com/?film', 'https://uptobox.com/mortabc', 'https://dl-protect.link/serie-s1-e2'];
  const etats = await verifierLiens(ad, liens);
  assert.deepEqual(etats['https://1fichier.com/?film'], { dispo: true, nom: 'film.mkv', noms: ['film.mkv'], hote: 'uptobox', taille: 1000, fichiers: 1 });
  assert.equal(etats['https://uptobox.com/mortabc'].dispo, false);
  assert.match(etats['https://uptobox.com/mortabc'].message, /mort/);
  // Derrière le protecteur : le vrai hébergeur et le nom du fichier (donc l'épisode).
  assert.deepEqual([etats['https://dl-protect.link/serie-s1-e2'].hote, etats['https://dl-protect.link/serie-s1-e2'].noms], ['uptobox', ['serie-s1-e2.mkv']]);
  // Un seul link/infos pour les liens directs et les fichiers cachés derrière le protecteur.
  assert.deepEqual(appels.sort(), ['infos×3', 'redirecteur']);
  // Deuxième demande : tout vient du cache, aucun appel à AllDebrid.
  appels.length = 0;
  await verifierLiens(ad, liens);
  assert.deepEqual(appels, []);
});

test('lireSite', () => {
  assert.deepEqual(lireSite('https://site.test'), { modele: null, accueil: 'https://site.test/' });
  assert.deepEqual(lireSite('https://site.test/recherche?q={q}'), { modele: 'https://site.test/recherche?q={q}', accueil: 'https://site.test/' });
  assert.throws(() => lireSite(''), /Réglages/);
  assert.throws(() => lireSite('ftp://site.test'), /invalide/);
});
