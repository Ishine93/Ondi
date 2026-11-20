// Faux sites de recherche pour tester les sources d'Ondi sans Internet, avec leurs descriptions écrites
// dans le format du catalogue de Prowlarr (ce sont des descriptions maison, pas celles du catalogue) :
//   tableau     site libre, résultats dans un tableau HTML, magnet caché dans un script de la fiche ;
//   api         site privé à clé, réponses JSON, fichier .torrent à télécharger avec la clé ;
//   formulaire  site à inscription : formulaire de connexion avec jeton, session par cookie ;
//   flux, flux2 réponses XML (même contenu : pour vérifier que les doublons sont réunis) ;
//   captcha     connexion avec image à recopier (inutilisable dans Ondi) ; casse : description illisible.
// Clé du site « api » : bonne. Identifiants du site « formulaire » : moi / secret.
import http from 'node:http';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const HASH_DUNE = 'a'.repeat(40);
const HASH_BOYS = 'b'.repeat(40);

export const DESCRIPTIONS = {
  tableau: (base) => `---
id: tableau
name: Tableau
description: "Site de test : tableau HTML"
language: fr-FR
type: public
encoding: UTF-8
links:
  - ${base}/
legacylinks:
  - http://ancien.test/
caps:
  categorymappings:
    - {id: film, cat: Movies, desc: "Films"}
    - {id: serie, cat: TV, desc: "Séries"}
    - {id: jeu, cat: PC/Games, desc: "Jeux"}
  modes:
    search: [q]
settings:
  - name: tri
    type: select
    label: Tri des résultats
    default: ".html"
    options:
      ".html": pertinence
      ".html,date": date
  - name: info
    type: info
    label: À savoir
    default: "Site <b>de test</b>, sans inscription."
download:
  selectors:
    - selector: a[href^="magnet:?"]
      attribute: href
    - selector: script:contains("magnet:?")
      filters:
        - name: regexp
          args: "'(magnet:\\\\?.+?)'"
search:
  paths:
    - path: "{{ if .Keywords }}recherche/{{ .Keywords }}{{ .Config.tri }}{{ else }}derniers/{{ end }}"
  keywordsfilters:
    - name: re_replace
      args: ["(?i)\\\\bS0?(\\\\d{1,2})$", "saison $1"]
    - name: replace
      args: [" ", "-"]
  rows:
    selector: table.resultats > tbody > tr:has(a[href^="/fiche/"])
    filters:
      - name: andmatch
  fields:
    category:
      selector: td:nth-child(1) i
      case:
        i.film: film
        i.serie: serie
        "*": jeu
    titre_court:
      selector: td:nth-child(1) a
    titre_long:
      selector: td:nth-child(1) a[title]
      attribute: title
      optional: true
    title:
      text: "{{ if .Result.titre_long }}{{ .Result.titre_long }}{{ else }}{{ .Result.titre_court }}{{ end }}"
    details:
      selector: td:nth-child(1) a
      attribute: href
    download:
      selector: td:nth-child(1) a
      attribute: href
    date:
      selector: td:nth-child(2)
      filters:
        - name: dateparse
          args: "dd/MM/yyyy"
    size:
      selector: td:nth-child(3)
      filters:
        - name: re_replace
          args: ["(\\\\w)o", "$1B"]
    seeders:
      selector: td:nth-child(4)
    leechers:
      selector: td:nth-child(5)
      optional: true
      default: 0
`,

  api: (base) => `---
id: api
name: Api privée
description: "Site de test : réponses JSON, clé d'accès"
language: fr-FR
type: private
encoding: UTF-8
links:
  - ${base}/
caps:
  categorymappings:
    - {id: 1, cat: Movies/UHD, desc: "Films 4K"}
    - {id: 2, cat: Movies/HD, desc: "Films HD"}
    - {id: 5, cat: TV/HD, desc: "Séries"}
    - {id: 9, cat: Audio, desc: "Musique"}
  modes:
    search: [q]
    tv-search: [q, season, ep]
    movie-search: [q]
settings:
  - name: apikey
    type: text
    label: Clé d'accès
  - name: gratuit
    type: checkbox
    label: Seulement les versions gratuites
    default: false
login:
  path: api/moi
  method: get
  inputs:
    cle: "{{ .Config.apikey }}"
  error:
    - selector: ":contains(\\"cle invalide\\")"
search:
  paths:
    - path: api/torrents
      response:
        type: json
  headers:
    X-Cle: ["{{ .Config.apikey }}"]
  inputs:
    $raw: "{{ range .Categories }}cat[]={{.}}&{{end}}"
    q: "{{ .Keywords }}"
    saison: "{{ .Query.Season }}"
    gratuit: "{{ if .Config.gratuit }}1{{ else }}{{ end }}"
  rows:
    selector: "data.liste:has(attributs.nom)"
    count:
      selector: data.total
  fields:
    category:
      selector: categorie
    title:
      selector: attributs.nom
    infohash:
      selector: empreinte
    download:
      selector: id
      filters:
        - name: prepend
          args: "/api/dl/"
    date:
      selector: ajoute
      filters:
        - name: dateparse
          args: "MM/dd/yyyy HH:mm:ss"
    size:
      selector: taille
    seeders:
      selector: pairs.sources
    downloadvolumefactor:
      selector: libre
      case:
        True: 0
        False: 1
`,

  formulaire: (base) => `---
id: formulaire
name: Formulaire
description: "Site de test : connexion par formulaire"
language: en-US
type: semi-private
encoding: UTF-8
links:
  - ${base}/
caps:
  categorymappings:
    - {id: 1, cat: Movies, desc: "Movies"}
  modes:
    search: [q]
settings:
  - name: username
    type: text
    label: Identifiant
  - name: password
    type: password
    label: Mot de passe
login:
  path: connexion
  method: form
  form: form#entree
  inputs:
    identifiant: "{{ .Config.username }}"
    motdepasse: "{{ .Config.password }}"
  selectorinputs:
    jeton:
      selector: input[name="jeton"]
      attribute: value
  error:
    - selector: div.erreur
  test:
    path: /
    selector: a[href="/deconnexion"]
search:
  paths:
    - path: membres/cherche
  inputs:
    q: "{{ .Keywords }}"
  rows:
    selector: div.ligne
  fields:
    category:
      text: 1
    title:
      selector: a.nom
    details:
      selector: a.nom
      attribute: href
    download:
      selector: a.torrent
      attribute: href
    size:
      attribute: data-taille
    seeders:
      selector: span.s
    date:
      selector: span.quand
      filters:
        - name: timeago
`,

  flux: (base, id = 'flux') => `---
id: ${id}
name: ${id === 'flux' ? 'Flux' : 'Flux bis'}
description: "Site de test : réponses XML"
language: en-US
type: public
encoding: UTF-8
links:
  - ${base}/
caps:
  categories:
    2000: Movies
    5000: TV
  modes:
    search: [q]
settings: []
search:
  paths:
    - path: flux
      response:
        type: xml
  inputs:
    q: "{{ .Keywords }}"
  rows:
    selector: rss > channel > item
  fields:
    category:
      selector: "[name=category]"
      attribute: value
    title:
      selector: title
    infohash:
      selector: "[name=infohash]"
      attribute: value
    size:
      selector: "[name=size]"
      attribute: value
    seeders:
      selector: "[name=seeders]"
      attribute: value
    date:
      selector: pubDate
      filters:
        - name: dateparse
          args: "ddd, dd MMM yyyy HH:mm:ss zzz"
`,

  captcha: (base) => `---
id: captcha
name: Captcha
description: "Site de test : image à recopier"
language: en-US
type: private
encoding: UTF-8
links:
  - ${base}/
caps:
  categorymappings:
    - {id: 1, cat: Movies, desc: "Movies"}
  modes:
    search: [q]
settings: []
login:
  path: login.php
  method: form
  captcha:
    type: image
    selector: img#captcha
    input: code
  inputs:
    user: x
search:
  paths:
    - path: browse.php
  rows:
    selector: tr
  fields:
    title:
      selector: a
    download:
      selector: a
      attribute: href
`,
};

// Archive tar.gz comme celle du dépôt des descriptions : un dossier par version du format.
export function archiveCatalogue(base, { sans = [] } = {}) {
  const fichiers = {
    'Depot-master/README.md': '# essai',
    'Depot-master/definitions/v11/tableau.yml': DESCRIPTIONS.tableau(base),
    'Depot-master/definitions/v11/api.yml': DESCRIPTIONS.api(base),
    'Depot-master/definitions/v11/formulaire.yml': DESCRIPTIONS.formulaire(base),
    'Depot-master/definitions/v11/flux.yml': DESCRIPTIONS.flux(base),
    'Depot-master/definitions/v11/flux2.yml': DESCRIPTIONS.flux(base, 'flux2'),
    'Depot-master/definitions/v11/captcha.yml': DESCRIPTIONS.captcha(base),
    'Depot-master/definitions/v11/casse.yml': 'id: casse\nsearch: [oups\n',
    'Depot-master/definitions/v12/futur.yml': DESCRIPTIONS.flux(base, 'futur'),
    'Depot-master/definitions/v10/vieux.yml': DESCRIPTIONS.flux(base, 'vieux'),
  };
  const blocs = [];
  for (const [nom, texte] of Object.entries(fichiers)) {
    if (sans.some((s) => nom.includes(`/${s}.yml`))) continue;
    const contenu = Buffer.from(texte);
    const e = Buffer.alloc(512);
    e.write(nom, 0, 100);
    e.write('0000644\0', 100);
    e.write('0000000\0', 108);
    e.write('0000000\0', 116);
    e.write(`${contenu.length.toString(8).padStart(11, '0')}\0`, 124);
    e.write('00000000000\0', 136);
    e.write('        ', 148);
    e[156] = 48;
    e.write('ustar\x0000', 257);
    let somme = 0;
    for (const o of e) somme += o;
    e.write(`${somme.toString(8).padStart(6, '0')}\0 `, 148);
    blocs.push(e, contenu, Buffer.alloc((512 - (contenu.length % 512)) % 512));
  }
  blocs.push(Buffer.alloc(1024));
  return zlib.gzipSync(Buffer.concat(blocs));
}

const page = (corps) => `<!doctype html><html><head><meta charset="utf-8"><title>Essai</title></head><body>${corps}</body></html>`;

// Démarre les faux sites sur un port libre. Rend { base, fermer, etat } ; « etat » permet aux essais
// de voir ce que le site a reçu et de faire expirer la session.
export async function demarrerFauxSources(port = 0) {
  const etat = { session: 'sess-1', connexions: 0, demandes: [], catalogue: { sans: [], telechargements: 0 }, panne: false };
  const srv = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    const p = decodeURIComponent(url.pathname);
    const base = `http://${req.headers.host}`;
    const html = (statut, corps, entetes = {}) => {
      res.writeHead(statut, { 'Content-Type': 'text/html; charset=utf-8', ...entetes });
      res.end(page(corps));
    };
    const json = (statut, o) => {
      res.writeHead(statut, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(o));
    };
    const corps = await new Promise((ok) => {
      let c = '';
      req.on('data', (d) => (c += d));
      req.on('end', () => ok(c));
    });
    etat.demandes.push({ methode: req.method, chemin: p, requete: url.search, cle: req.headers['x-cle'] || '', temoin: req.headers.cookie || '', corps });

    // ----- catalogue -----
    if (p === '/catalogue.tar.gz') {
      const etiquette = `"v${etat.catalogue.sans.length}"`;
      if (req.headers['if-none-match'] === etiquette) {
        res.writeHead(304);
        return res.end();
      }
      etat.catalogue.telechargements++;
      res.writeHead(200, { 'Content-Type': 'application/gzip', ETag: etiquette });
      return res.end(archiveCatalogue(base, etat.catalogue));
    }

    // ----- faux TMDB (liste d'envies) -----
    if (p === '/tmdb/configuration') return json(200, {});
    if (p === '/tmdb/search/multi') {
      const q = (url.searchParams.get('query') || '').toLowerCase();
      const titres = [
        { id: 438631, media_type: 'movie', title: 'Dune', original_title: 'Dune', release_date: '2021-09-15', poster_path: null, overview: 'Paul Atreides part pour Arrakis.' },
        { id: 693134, media_type: 'movie', title: 'Dune : Deuxième partie', original_title: 'Dune: Part Two', release_date: '2024-02-27', poster_path: null, overview: 'La suite.' },
        { id: 90228, media_type: 'tv', name: 'Dune : Prophecy', original_name: 'Dune: Prophecy', first_air_date: '2024-11-17', poster_path: null, overview: '' },
        { id: 7, media_type: 'person', name: 'Dune Personne' },
        { id: 76479, media_type: 'tv', name: 'The Boys', original_name: 'The Boys', first_air_date: '2019-07-25', poster_path: null, overview: 'Des super-héros pas très héroïques.' },
      ];
      return json(200, { results: titres.filter((x) => (x.title || x.name).toLowerCase().includes(q)) });
    }
    if (p === '/tmdb/tv/76479' || p === '/tmdb/tv/90228') {
      const n = p.endsWith('76479') ? 4 : 1;
      return json(200, { seasons: [{ season_number: 0, name: 'Épisodes spéciaux', episode_count: 3 }, ...Array.from({ length: n }, (_, i) => ({ season_number: i + 1, name: `Saison ${i + 1}`, episode_count: 8, air_date: `${2019 + i}-07-25` }))] });
    }
    if (p.startsWith('/tmdb/')) return json(200, { results: [] });

    // ----- tableau -----
    if (p.startsWith('/recherche/') || p === '/derniers/') {
      const mots = p.startsWith('/recherche/') ? p.slice(11).replace(/\.html.*$/, '') : '';
      const lignes = [
        `<tr><td><i class="ico film"></i> <a href="/fiche/1" title="Dune 2021 MULTi 2160p WEB x265">Dune 2021 MULTi…</a></td><td>12/03/2024</td><td>18.4 Go</td><td>120</td><td>4</td></tr>`,
        `<tr><td><i class="ico serie"></i> <a href="/fiche/2">Dune Prophecy S01 VOSTFR 1080p</a><td>01/12/2024<td>4,2 Go<td>7`,
        `<tr><td><i class="ico jeu"></i> <a href="/fiche/3">Dune Spice Wars</a><td>05/01/2023<td>9 Go<td>50<td>0</tr>`,
        `<tr><td><i class="ico film"></i> <a href="/fiche/4">Autre film sans rapport 1080p FRENCH</a><td>06/01/2023<td>2 Go<td>3<td>0</tr>`,
        `<tr><td colspan="5"><a href="/pub">Publicité</a></td></tr>`,
      ];
      return html(200, `<h1>${mots || 'Derniers ajouts'}</h1><table class="resultats"><tr><th>Nom<th>Date<th>Taille<th>S<th>P</tr>${lignes.join('\n')}</table>`);
    }
    if (p.startsWith('/fiche/')) {
      const n = p.slice(7);
      return html(200, `<h1>Fiche ${n}</h1><script>var lien = 'magnet:?xt=urn:btih:${n === '1' ? HASH_DUNE : 'c'.repeat(40)}&dn=fiche${n}'; ouvrir(lien);</script>`);
    }

    // ----- api -----
    if (p === '/api/moi') return json(200, url.searchParams.get('cle') === 'bonne' ? { ok: true } : { erreur: 'cle invalide' });
    if (p === '/api/torrents') {
      if (req.headers['x-cle'] !== 'bonne') return json(401, { erreur: 'cle invalide' });
      const cats = url.searchParams.getAll('cat[]');
      const tout = [
        { id: 41, categorie: 1, empreinte: HASH_DUNE.toUpperCase(), ajoute: '2026-03-31T20:06:13Z', taille: 61234567890, libre: true, pairs: { sources: 35 }, attributs: { nom: 'Dune.2021.MULTi.VFF.2160p.UHD.BluRay.REMUX.HEVC-GRP' } },
        { id: 42, categorie: 2, empreinte: 'd'.repeat(40), ajoute: '2025-01-02T03:04:05+01:00', taille: '8 GB', libre: false, pairs: { sources: 12 }, attributs: { nom: 'Dune.2021.FRENCH.1080p.WEB.x264-GRP' } },
        { id: 43, categorie: 9, empreinte: 'e'.repeat(40), ajoute: '2025-01-02T03:04:05Z', taille: 900, libre: false, pairs: { sources: 2 }, attributs: { nom: 'Dune.Bande.Originale.FLAC' } },
        { id: 44, categorie: 2, attributs: {} },
      ];
      const liste = tout.filter((t) => !cats.length || cats.includes(String(t.categorie)));
      return json(200, { data: { total: liste.length, liste } });
    }
    if (p.startsWith('/api/dl/')) {
      if (req.headers['x-cle'] !== 'bonne') return html(403, 'Interdit');
      res.writeHead(200, { 'Content-Type': 'application/x-bittorrent' });
      return res.end(Buffer.from(`d8:announce20:http://x.test/annonce4:infod4:name${p.slice(8).length}:${p.slice(8)}ee`));
    }

    // ----- formulaire -----
    if (p === '/connexion') return html(200, `<form id="recherche" action="/cherche"><input name="q"></form><form id="entree" method="post" action="/connexion/valider"><input type="hidden" name="jeton" value="jeton-7"><input name="identifiant"><input type="password" name="motdepasse"><input type="checkbox" name="rester" value="1" checked><input type="checkbox" name="pub" value="1"><input type="submit" value="Entrer"></form>`);
    if (p === '/connexion/valider') {
      const champs = new URLSearchParams(corps);
      if (champs.get('jeton') !== 'jeton-7' || champs.get('identifiant') !== 'moi' || champs.get('motdepasse') !== 'secret' || champs.get('rester') !== '1' || champs.has('pub')) {
        return html(200, '<div class="erreur"> Identifiant ou mot de passe incorrect. </div>');
      }
      etat.connexions++;
      res.writeHead(302, { Location: '/membres/', 'Set-Cookie': [`session=${etat.session}; Path=/; HttpOnly`, 'langue=fr; Path=/'] });
      return res.end();
    }
    if (p.startsWith('/membres/')) {
      if (!new RegExp(`(^|; )session=${etat.session}(;|$)`).test(req.headers.cookie || '')) {
        res.writeHead(302, { Location: '/connexion' });
        return res.end();
      }
      if (p === '/membres/cherche') {
        return html(200, `<a href="/deconnexion">Sortir</a><div class="ligne" data-taille="2147483648"><a class="nom" href="/membres/t/9">Dune.2021.MULTi.1080p.BluRay.x264-GRP</a> <span class="s">1,234</span> <span class="quand">2 hours ago</span> <a class="torrent" href="/membres/dl/9.torrent">.torrent</a></div>`);
      }
      if (p.startsWith('/membres/dl/')) {
        res.writeHead(200, { 'Content-Type': 'application/x-bittorrent' });
        return res.end(Buffer.from('d4:infod4:name4:Duneee'));
      }
      return html(200, '<a href="/deconnexion">Sortir</a>');
    }

    // ----- flux -----
    if (p === '/flux') {
      if (etat.panne) return html(500, 'En panne');
      res.writeHead(200, { 'Content-Type': 'application/rss+xml' });
      return res.end(`<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:torznab="http://torznab.com/schemas/2015/feed"><channel><title>Flux</title>
<item><title><![CDATA[Dune.2021.MULTi.2160p.WEB-DL.DV.HDR.x265-GRP]]></title><pubDate>Tue, 31 Mar 2026 20:06:13 +0100</pubDate>
<torznab:attr name="category" value="2000"/><torznab:attr name="infohash" value="${HASH_DUNE}"/><torznab:attr name="size" value="19000000000"/><torznab:attr name="seeders" value="80"/></item>
<item><title>The.Boys.S01.MULTi.1080p.WEB.x264-GRP</title><pubDate>Mon, 01 Jan 2024 08:00:00 +0000</pubDate>
<torznab:attr name="category" value="5000"/><torznab:attr name="infohash" value="${HASH_BOYS}"/><torznab:attr name="size" value="30000000000"/><torznab:attr name="seeders" value="15"/></item>
</channel></rss>`);
    }
    return html(404, 'Introuvable');
  });
  await new Promise((r) => srv.listen(port, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  return { base, etat, fermer: () => new Promise((r) => srv.close(r)) };
}

export { HASH_DUNE, HASH_BOYS };

// Lancé seul (démo) : node tests/faux-sources.mjs [port]
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { base } = await demarrerFauxSources(Number(process.argv[2]) || 18100);
  console.log(`Fausses sources de recherche sur ${base} (catalogue : ${base}/catalogue.tar.gz)`);
}
