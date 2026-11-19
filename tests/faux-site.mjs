// Faux site de téléchargement pour tester la recherche d'Ondi sans Internet.
// node tests/faux-site.mjs [port]
// Barre de recherche en GET paginée par « &page=N » (5 résultats par page), menu, colonne
// « derniers ajouts », fiches avec liens d'hébergeurs, protecteur, magnet, .torrent et liens parasites.
// Chaque résultat est un seul lien « Titre · qualité · genres · note /10 · année », comme sur
// beaucoup de sites ; les versions d'un même contenu sont réparties sur plusieurs pages.
// Catégorie par « &p=films|series|mangas » (sans p : tout).
// Essais : « dune » (3 versions de Dune 2 + Dune), « étoile » en Films (26 fiches, 6 pages → 12 contenus × 2 versions,
// plus « Étoile morte » dont tous les liens sont morts et « Étoile noire » qui n'en a qu'un en ligne),
// « étoile » en Mangas ou Séries.
import http from 'node:http';

const PORT = Number(process.argv[2]) || 18099;
const PAR_PAGE = 5;

const SF = { genres: 'Science-Fiction, Aventure', note: '8.1' };
const CATALOGUE = [
  { id: 1, slug: 'dune-deuxieme-partie', titre: 'Dune : Deuxième partie', qualite: '1080p MULTI', annee: 2024, rubrique: 'films', ...SF },
  { id: 2, slug: 'the-boys-saison-4', titre: 'The Boys - Saison 4', qualite: 'VOSTFR 1080p', annee: 2024, rubrique: 'series', genres: 'Action, Drame', note: '8.4' },
  { id: 3, slug: 'protege', titre: 'Protégé', annee: 2023, rubrique: 'films', genres: 'Thriller', note: '6.2' },
  { id: 6, slug: 'dune-deuxieme-partie-4k', titre: 'Dune : Deuxième partie', qualite: '4K LIGHT VOSTFR', annee: 2024, rubrique: 'films', ...SF },
  { id: 4, slug: 'dune', titre: 'Dune', qualite: '1080p FRENCH', annee: 2021, rubrique: 'films', ...SF, note: '7.8' },
  { id: 5, slug: 'archive-film', titre: 'Archive Film', annee: 2022, rubrique: 'films', genres: 'Documentaire', note: '5.5' },
  // Liens protégés avec l'hébergeur annoncé devant le nom du fichier (« Rapidgator - Film.mkv »).
  // Étoile morte : tout est mort ou non géré → « Liens KO ». Étoile noire : Rapidgator mort, Turbobit en ligne.
  { id: 8, slug: 'etoile-morte', titre: 'Étoile morte', qualite: '1080p FRENCH', annee: 2018, rubrique: 'films', genres: 'Drame', note: '4.9' },
  { id: 9, slug: 'etoile-noire', titre: 'Étoile noire', qualite: '1080p MULTI', annee: 2020, rubrique: 'films', genres: 'Science-Fiction', note: '7.2' },
  { id: 7, slug: 'dune-deuxieme-partie-hdlight', titre: 'Dune : Deuxième partie', qualite: 'HDLight 720p FRENCH', annee: 2024, rubrique: 'films', ...SF },
  ...Array.from({ length: 12 }, (_, i) => ({
    id: 100 + i, slug: `etoile-filante-${i + 1}`, titre: `Étoile filante ${i + 1}`, qualite: '1080p MULTI', annee: 2000 + i, rubrique: 'films',
    genres: 'Animation, Action', note: '6.7',
  })),
  ...Array.from({ length: 12 }, (_, i) => ({
    id: 200 + i, slug: `etoile-filante-${i + 1}-4k`, titre: `Étoile filante ${i + 1}`, qualite: '4K VOSTFR', annee: 2000 + i, rubrique: 'films',
    genres: 'Animation, Action', note: '6.7',
  })),
  { id: 300, slug: 'etoile-du-nord-s1-vostfr', titre: 'Étoile du Nord - Saison 1', qualite: 'VOSTFR 1080p', annee: 2019, rubrique: 'mangas', genres: 'Animation, Aventure', note: '7.9' },
  { id: 301, slug: 'etoile-du-nord-s1-vf', titre: 'Étoile du Nord - Saison 1', qualite: 'VF 720p', annee: 2019, rubrique: 'mangas', genres: 'Animation, Aventure', note: '7.9' },
  { id: 302, slug: 'etoile-du-nord-s2-vostfr', titre: 'Étoile du Nord', qualite: 'S02 VOSTFR (+E12)', annee: 2021, rubrique: 'mangas', genres: 'Animation, Aventure' },
  { id: 400, slug: 'etoile-de-mer-s1', titre: 'Étoile de mer - Saison 1', qualite: 'MULTI 1080p', annee: 2022, rubrique: 'series', genres: 'Drame', note: '7.1' },
  // Format sans note : « Titre S01 VOSTFR HD (+E10) Fantastique, Dramatique 2011 ».
  { id: 500, slug: 'les-gardiens-s1-vostfr', titre: 'Les Gardiens', qualite: 'S01 VOSTFR HD (+E10)', annee: 2011, rubrique: 'series', genres: 'Fantastique, Dramatique' },
  { id: 501, slug: 'les-gardiens-s1-vf', titre: 'Les Gardiens', qualite: 'S01 FRENCH HD (+E10)', annee: 2011, rubrique: 'series', genres: 'Fantastique, Dramatique' },
  { id: 502, slug: 'les-gardiens-s2-vostfr', titre: 'Les Gardiens', qualite: 'S02 VOSTFR (+E8)', annee: 2013, rubrique: 'series', genres: 'Fantastique, Dramatique' },
  { id: 503, slug: 'les-gardiens-s2-multi', titre: 'Les Gardiens', qualite: 'S02 MULTI (TRUEFRENCH) 1080p (+E8)', annee: 2013, rubrique: 'series', genres: 'Fantastique, Dramatique' },
];
const adresse = (f) => `/${f.rubrique}/${f.id}-${f.slug}.html`;
const echapper = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const normaliser = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const SOURCES = {
  1: `
    <h3>Qualité 1080p · MULTi</h3>
    <p><b>1fichier</b> : <a href="https://1fichier.com/?film" target="_blank">Télécharger</a><br>
       <b>Uptobox</b> : <a href="https://uptobox.com/mortabcd1234">Télécharger</a> (lien mort)</p>
    <h3>Qualité 4K · 2160p</h3>
    <p><a href="https://dl-protect.link/9f8e7d6c">1fichier</a> · <a href="https://rapidgator.net/file/0a1b2c/Dune.Part.Two.2160p.mkv.html">Rapidgator</a></p>
    <h3>Torrent</h3>
    <p><a href="magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567&amp;dn=Dune.Part.Two.2024.MULTi.1080p.WEB">Magnet</a>
       <a href="/torrents/dune-part-two.torrent">Fichier .torrent</a></p>`,
  2: `
    <h3>Épisodes · VOSTFR 1080p</h3>
    <p>Épisode 1 : <a href="https://1fichier.com/?ep1boys">Télécharger</a><br>
       Épisode 2 : <a href="https://1fichier.com/?ep2boys">Télécharger</a></p>
    <h3>Liens à copier</h3>
    <pre>https://uptobox.com/boyss04e03
https://uptobox.com/boyss04e04</pre>`,
  3: `
    <h3>1080p</h3>
    <p>Lien protégé : <a href="https://dl-protect.link/protege">Télécharger</a></p>`,
  4: '<p>Liens bientôt disponibles.</p>',
  5: `
    <h3>Archive</h3>
    <p><a href="https://1fichier.com/?archive">Archive.Film.2022.part1.rar</a></p>`,
  8: liensAnnonces('Etoile.Morte.2018.FRENCH.1080p.mkv', [['Uploady', 'etoile-morte-uploady'], ['Rapidgator', 'etoile-morte-rapidgator-mort'], ['Turbobit', 'etoile-morte-turbobit-mort']]),
  9: liensAnnonces('Etoile.Noire.2020.MULTi.1080p.mkv', [['Uploady', 'etoile-noire-uploady'], ['Rapidgator', 'etoile-noire-rapidgator-mort'], ['Turbobit', 'etoile-noire-turbobit']]),
};
function liensAnnonces(fichier, liens) {
  return `<h2>${fichier} 4.2 Go</h2><div>${liens
    .map(([hote, id]) => `<a href="https://dl-protect.link/${id}?rl=a2"><strong class="hebergeur">${hote}</strong> - ${fichier}</a><br/>`)
    .join('\n')}</div>`;
}

function page(titre, contenu) {
  const derniers = CATALOGUE.slice(0, 3)
    .map((f) => `<li><a href="${adresse(f)}">${echapper(f.titre)}</a></li>`)
    .join('');
  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><title>${echapper(titre)} - Faux Site</title>
<style>body{font-family:sans-serif;max-width:900px;margin:auto;padding:10px}aside{float:right;width:220px}</style>
<script>var x = "<a href='https://1fichier.com/?script'>piège</a>";</script></head>
<body>
<header>
  <nav><a href="/">Accueil</a> | <a href="/films/">Films</a> | <a href="/series/">Séries</a> | <a href="/contact.html">Contact</a> | <a href="/index.php?do=register">Inscription</a></nav>
  <form method="get" action="/recherche" id="q_search">
    <input type="hidden" name="type" value="tout">
    <input id="story" name="q" placeholder="Rechercher un film, une série..." type="text">
    <button type="submit">OK</button>
  </form>
</header>
<aside><h4>Derniers ajouts</h4><ul>${derniers}</ul>
  <form method="post" action="/newsletter"><input type="email" name="email" placeholder="Ton e-mail"><input type="text" name="nom"><button>S'inscrire</button></form>
</aside>
<main>${contenu}</main>
<footer><a href="/dmca.html">DMCA</a> · <a href="https://1fichier.com/">Premium 1fichier</a> · <a href="https://www.facebook.com/sharer.php?u=x">Partager</a></footer>
</body></html>`;
}

// Une carte = un seul lien : titre, qualité, genres, note et année à la suite.
function carte(f) {
  return `<div class="result">
    <a href="${adresse(f)}">
      <img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" data-src="/img/${f.id}.svg" alt="${echapper(f.titre)}">
      <div class="titre">${echapper(f.titre)}</div>
      ${f.qualite ? `<div class="qualite">${f.qualite}</div>` : ''}
      <div class="genres">${f.genres}</div> ${f.note ? `<div class="note">${f.note} /10</div>` : ''} <div class="annee">${f.annee}</div>
    </a>
  </div>`;
}

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
    const html = (statut, corps) => {
      res.writeHead(statut, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(corps);
    };
    console.log('SITE', req.method, url.pathname + url.search);

    if (url.pathname === '/recherche') {
      const brut = url.searchParams.get('q') || '';
      const q = normaliser(brut).trim();
      const rubrique = url.searchParams.get('p');
      const trouves = q
        ? CATALOGUE.filter((f) => (!rubrique || f.rubrique === rubrique) && q.split(/\s+/).every((m) => normaliser(f.titre).includes(m)))
        : [];
      const total = Math.max(1, Math.ceil(trouves.length / PAR_PAGE));
      const n = Math.min(total, Math.max(1, Number(url.searchParams.get('page')) || 1));
      // Comme beaucoup de sites : la page 1 n'a pas de « &page= », les autres si.
      const lien = (k) => `/recherche?type=tout&amp;q=${encodeURIComponent(brut)}${rubrique ? `&amp;p=${rubrique}` : ''}${k > 1 ? `&amp;page=${k}` : ''}`;
      const numeros = [...new Set([1, n - 2, n - 1, n, n + 1, n + 2, total])].filter((k) => k >= 1 && k <= total).sort((a, b) => a - b);
      const pagination =
        total > 1
          ? `<div class="pages">${n > 1 ? `<a href="${lien(n - 1)}">« Précédente</a> ` : ''}${numeros
              .map((k) => (k === n ? `<span>${k}</span>` : `<a href="${lien(k)}">${k}</a>`))
              .join(' ')}${n < total ? ` <a href="${lien(n + 1)}">Suivante »</a>` : ''}</div>`
          : '';
      const contenu = trouves.length
        ? `<h1>Résultats pour « ${echapper(brut)} »</h1>${pagination}${trouves.slice((n - 1) * PAR_PAGE, n * PAR_PAGE).map(carte).join('')}${pagination}
           <p><a href="/films/?page=2">Plus de films (piège : autre pagination)</a></p>`
        : `<h1>Aucun résultat</h1><p>Rien trouvé pour « ${echapper(brut)} ».</p>`;
      return html(200, page('Recherche', contenu));
    }
    if (url.pathname === '/') return html(200, page('Accueil', `<h1>Nouveautés</h1>${CATALOGUE.slice(0, 8).map(carte).join('')}`));
    const img = url.pathname.match(/^\/img\/(\d+)\.svg$/);
    if (img) {
      const teinte = (Number(img[1]) * 67) % 360;
      res.writeHead(200, { 'Content-Type': 'image/svg+xml' });
      return res.end(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 56"><rect width="40" height="56" fill="hsl(${teinte} 45% 35%)"/><text x="20" y="34" font-size="18" text-anchor="middle" fill="#fff" font-family="sans-serif">${img[1]}</text></svg>`);
    }
    const fiche = CATALOGUE.find((f) => url.pathname === adresse(f));
    if (fiche) {
      // Versions 4K des « Étoile filante » : le lien 1fichier est mort, et une fiche sur deux n'a plus aucun lien valide.
      const quatreK = fiche.id >= 200 && fiche.id < 300;
      // Séries « Les Gardiens », comme sur le vrai site : tous les liens dans un seul bloc, le nom de
      // l'épisode caché dans « ?fn=<base64> », l'hébergeur dans le texte (« Rapidgator - Télécharger »),
      // plus du streaming (« Vidoza - Regarder »). Rapidgator est mort pour l'épisode 4.
      const saison = fiche.qualite?.match(/S0?(\d+)/)?.[1];
      const langue = fiche.qualite?.match(/VOSTFR|FRENCH|MULTI/)?.[0] || 'VOSTFR';
      const fn = (e) => Buffer.from(`Les Gardiens - Saison ${saison} Épisode ${e} - [${langue} HD]`).toString('base64');
      const lienEp = (e, hote, action) =>
        `<a href="https://dl-protect.link/les-gardiens-s${saison}-e${e}-${hote.toLowerCase()}${hote === 'Rapidgator' && e === 4 ? '-mort' : ''}?fn=${fn(e)}">${hote} - ${action}</a>`;
      const episodes =
        fiche.id >= 500 && fiche.id < 600
          ? `<h2>Les Gardiens - Saison ${saison} ${langue} HD</h2><div class="liens">${[1, 2, 3, 4, 5, 6, 7, 8]
              .map((e) => `${lienEp(e, 'Rapidgator', 'Télécharger')} ${lienEp(e, 'Uptobox', 'Télécharger')}`)
              .join('\n')}\n${[1, 2, 3, 4, 5, 6, 7, 8].map((e) => lienEp(e, 'Vidoza', 'Regarder')).join('\n')}</div>`
          : '';
      const sources =
        SOURCES[fiche.id] ||
        episodes ||
        (quatreK
          ? `<h3>4K</h3><p><b>1fichier</b> : <a href="https://1fichier.com/?mortfiche${fiche.id}">Télécharger</a><br>
             <b>Uptobox</b> : <a href="https://uptobox.com/${fiche.id % 2 ? 'mort' : ''}fiche${fiche.id}">Télécharger</a></p>`
          : `<h3>1080p</h3><p><b>1fichier</b> : <a href="https://1fichier.com/?fiche${fiche.id}">Télécharger</a></p>`);
      return html(200, page(fiche.titre, `<h1>${echapper(fiche.titre)} (${fiche.annee})</h1><p>Synopsis de démonstration.</p>${sources}`));
    }
    return html(404, page('Introuvable', '<h1>Page introuvable</h1>'));
  })
  .listen(PORT, () => console.log(`Faux site sur http://127.0.0.1:${PORT}`));
