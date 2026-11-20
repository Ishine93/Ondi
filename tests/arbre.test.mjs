import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lireArbreHtml, lireArbreXml, chercher, chercherTous, correspondA, texteDe, attributDe, retirer, analyserSelecteur, ErreurSelecteur } from '../src/arbre.mjs';
import { lireYaml } from '../src/yaml.mjs';

const PAGE = `<!doctype html>
<html lang="fr"><head><title>Résultats &amp; cie</title><meta charset="utf-8">
<script>var lien = 'magnet:?xt=urn:btih:abc<def';</script></head>
<body class="page">
<div id="menu"><a href="/films">Films</a> <a href="/series" class="actif gras">Séries</a></div>
<table class="table table-striped">
  <tr><th>Nom<th>Taille<th>Sources</tr>
  <tr class="ligne"><td><i class="fa fa-video-camera"></i> <a href="/t/1" title="Dune 2021 MULTi 2160p">Dune…</a><td>18.4 Go<td><span class="vert">120</span></tr>
  <tr class="ligne"><td><i class="fa fa-tv"></i> <a href="/t/2">The Boys S01 VOSTFR</a><td>4 Go<td>7
  <tr class="ligne pub"><td colspan=3><p>Publicité<div>bloc</div></td></tr>
</table>
<ul><li>un<li>deux<li class="fin">trois</ul>
<p>Premier<p>Second <b>gras</p>
</body></html>`;

test('page HTML : <tbody> ajouté, balises non refermées, texte brut des scripts', () => {
  const doc = lireArbreHtml(PAGE);
  assert.equal(texteDe(chercher(doc, 'title')), 'Résultats & cie');
  assert.equal(chercherTous(doc, 'table.table-striped > tbody > tr').length, 4);
  assert.equal(chercherTous(doc, 'tr.ligne').length, 3);
  assert.equal(chercherTous(doc, 'tr:nth-child(2) > td').length, 3);
  assert.equal(texteDe(chercher(doc, 'tr.ligne td:nth-child(2)')), '18.4 Go');
  assert.equal(chercherTous(doc, 'ul > li').length, 3);
  assert.deepEqual(chercherTous(doc, 'body > p').map((p) => texteDe(p).trim()), ['Premier', 'Second gras']);
  assert.match(texteDe(chercher(doc, 'script:contains("magnet:?")')), /btih:abc<def/);
  assert.equal(attributDe(chercher(doc, 'body'), 'class'), 'page');
  assert.equal(attributDe(chercher(doc, 'html'), 'lang'), 'fr');
  // Le <div> dans la cellule referme le <p>, et reste dans la cellule.
  assert.equal(chercherTous(doc, 'tr.pub td > div').length, 1);
});

test('sélecteurs : attributs, :contains, :has, :not, nth, frères', () => {
  const doc = lireArbreHtml(PAGE);
  const un = (s) => chercher(doc, s);
  assert.equal(attributDe(un('a[href^="/t/"]'), 'href'), '/t/1');
  assert.equal(attributDe(un('a[href$="2"]'), 'href'), '/t/2');
  assert.equal(attributDe(un('a[title*=MULTi]'), 'href'), '/t/1');
  assert.equal(un('a[title*=multi]'), null);
  assert.equal(attributDe(un('a[title*=multi i]'), 'href'), '/t/1');
  assert.equal(chercherTous(doc, 'a[class~=gras]').length, 1);
  assert.equal(chercherTous(doc, 'i[class="fa fa-tv"]').length, 1);
  assert.equal(chercherTous(doc, 'tr:has(i.fa-tv)').length, 1);
  assert.equal(chercherTous(doc, 'tr:has(> td > span.vert)').length, 1);
  assert.equal(chercherTous(doc, 'tr.ligne:not(.pub)').length, 2);
  assert.equal(chercherTous(doc, 'tr.ligne:not(:has(a))').length, 1);
  assert.equal(chercherTous(doc, 'td:contains("Go")').length, 2);
  assert.equal(chercherTous(doc, 'td:contains(Go)').length, 2);
  assert.equal(chercherTous(doc, 'tr:contains("The Boys") td:nth-last-child(1)').map((e) => texteDe(e).trim())[0], '7');
  assert.equal(chercherTous(doc, 'li:nth-child(odd)').length, 2);
  assert.equal(chercherTous(doc, 'li:nth-child(n+2)').length, 2);
  assert.equal(chercherTous(doc, 'li:first-child, li:last-child').length, 2);
  assert.equal(texteDe(un('li:first-child + li')), 'deux');
  assert.equal(chercherTous(doc, 'li:first-child ~ li').length, 2);
  assert.equal(chercherTous(doc, 'th:nth-of-type(3), td:nth-of-type(3)').length, 3);
  assert.equal(chercherTous(doc, '#menu > *').length, 2);
  assert.equal(chercherTous(doc, '* > a.actif').length, 1);
  assert.equal(chercherTous(doc, ':root > body').length, 1);
  // Depuis une ligne : les ancêtres hors de la ligne comptent, les résultats sont dans la ligne.
  const ligne = un('tr.ligne');
  assert.equal(chercherTous(ligne, 'table a').length, 1);
  assert.ok(correspondA(ligne, 'tr:has(a[title])'));
  assert.ok(!correspondA(ligne, 'tr.pub'));
  retirer(chercher(ligne, 'i'));
  assert.equal(chercher(ligne, 'i'), null);
});

test('sélecteurs mal écrits ou non gérés : erreur claire', () => {
  assert.throws(() => analyserSelecteur('td:eq(2)'), ErreurSelecteur);
  assert.throws(() => analyserSelecteur('a[href'), ErreurSelecteur);
  assert.throws(() => analyserSelecteur('> a'), ErreurSelecteur);
  assert.throws(() => analyserSelecteur(''), ErreurSelecteur);
});

test('réponse XML : CDATA, balises à préfixe, attributs', () => {
  const doc = lireArbreXml(`<?xml version="1.0"?>
<rss><channel><title>Flux</title>
<item><title><![CDATA[Dune <2021> MULTi]]></title><pubDate>Tue, 31 Mar 2026 20:06:13 +0100</pubDate>
<enclosure url="https://exemple.test/dl?id=1&amp;k=2" length="1"/>
<torznab:attr name="seeders" value="12"/><torznab:attr name="size" value="1000"/></item>
<item><title>Autre</title></item></channel></rss>`);
  const lignes = chercherTous(doc, 'rss > channel > item');
  assert.equal(lignes.length, 2);
  assert.equal(texteDe(chercher(lignes[0], 'title')), 'Dune <2021> MULTi');
  assert.equal(texteDe(chercher(lignes[0], 'pubDate')), 'Tue, 31 Mar 2026 20:06:13 +0100');
  assert.equal(attributDe(chercher(lignes[0], 'enclosure'), 'url'), 'https://exemple.test/dl?id=1&k=2');
  assert.equal(attributDe(chercher(lignes[0], '[name=seeders]'), 'value'), '12');
  assert.equal(attributDe(chercher(lignes[0], 'torznab\\:attr[name="size"]'), 'value'), '1000');
});

test('lecture YAML : blocs, listes, { } et [ ], guillemets, commentaires', () => {
  const y = lireYaml(`---
id: exemple # commentaire
name: "Exemple: le site"
vide:
links:
  - https://exemple.test/
  - 'https://ancien.test/' # ancien
caps:
  categorymappings:
    - {id: 1, cat: Movies/HD, desc: "Films HD"}
    - {id: films, cat: Movies}
  modes:
    search: [q]
    tv-search: [q, season, ep]
settings:
- name: sort
  type: select
  options:
    ".html": best
    'a''b': "c\\td"
search:
  paths:
    - path: "{{ if .Keywords }}search/{{ .Keywords }}{{ else }}home{{ end }}"
      categories: ["!", 6]
  rows:
    selector: table > tbody > tr:has(a[href^="/t/"])
  fields:
    category:
      case:
        i[class="fa fa-tv"]: series
        "*": other
    seeders:
      text: 0
    ratio:
      text: 1.0
    long: un texte
      sur deux lignes
`);
  assert.equal(y.id, 'exemple');
  assert.equal(y.name, 'Exemple: le site');
  assert.equal(y.vide, null);
  assert.deepEqual(y.links, ['https://exemple.test/', 'https://ancien.test/']);
  assert.deepEqual(y.caps.categorymappings[0], { id: '1', cat: 'Movies/HD', desc: 'Films HD' });
  assert.deepEqual(y.caps.modes['tv-search'], ['q', 'season', 'ep']);
  assert.deepEqual(y.settings[0].options, { '.html': 'best', "a'b": 'c\td' });
  assert.equal(y.search.paths[0].path, '{{ if .Keywords }}search/{{ .Keywords }}{{ else }}home{{ end }}');
  assert.deepEqual(y.search.paths[0].categories, ['!', '6']);
  assert.equal(y.search.rows.selector, 'table > tbody > tr:has(a[href^="/t/"])');
  assert.deepEqual(y.search.fields.category.case, { 'i[class="fa fa-tv"]': 'series', '*': 'other' });
  assert.equal(y.search.fields.seeders.text, '0');
  assert.equal(y.search.fields.ratio.text, '1.0');
  assert.equal(y.search.fields.long, 'un texte sur deux lignes');
});
