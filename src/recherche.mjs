// Recherche sur un site externe à travers sa propre barre de recherche, puis
// extraction des sources d'une fiche : liens d'hébergeurs, protecteurs de liens,
// magnets et .torrent. Aucune dépendance : petite lecture HTML maison.
import { decrireResultat, episodeDuNom, normaliser } from './titres.mjs';

const NAVIGATEUR = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.6',
};
const TAILLE_MAX = 5e6;

export class ErreurRecherche extends Error {}

// ---------- lecture HTML ----------

const ENTITES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', eacute: 'é', egrave: 'è', ecirc: 'ê', euml: 'ë',
  agrave: 'à', acirc: 'â', auml: 'ä', ccedil: 'ç', icirc: 'î', iuml: 'ï', ocirc: 'ô', ouml: 'ö', ugrave: 'ù',
  ucirc: 'û', uuml: 'ü', Eacute: 'É', Egrave: 'È', Ecirc: 'Ê', Agrave: 'À', Ccedil: 'Ç', oelig: 'œ', OElig: 'Œ',
  hellip: '…', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', laquo: '«', raquo: '»', ndash: '–', mdash: '—',
  middot: '·', bull: '•', times: '×', copy: '©', reg: '®', trade: '™',
};

export function decoderEntites(s) {
  return String(s).replace(/&(?:#(x[0-9a-f]+|\d+);?|([a-z][a-z0-9]*);)/gi, (m, num, nom) => {
    if (num) {
      const n = num[0] === 'x' || num[0] === 'X' ? parseInt(num.slice(1), 16) : parseInt(num, 10);
      return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
    }
    return ENTITES[nom] ?? m;
  });
}

const propre = (t) => String(t || '').replace(/\s+/g, ' ').trim();

function lireAttributs(s) {
  const a = {};
  for (const m of s.matchAll(/([^\s"'=<>/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g)) {
    const nom = m[1].toLowerCase();
    if (!(nom in a)) a[nom] = decoderEntites(m[2] ?? m[3] ?? m[4] ?? '');
  }
  return a;
}

// Un jeton = commentaire | bloc ignoré (script, style…) | doctype | balise | texte.
const RE_JETON =
  /<!--[\s\S]*?(?:-->|$)|<(script|style|noscript|template|svg)\b(?:[^>"']|"[^"]*"|'[^']*')*>[\s\S]*?(?:<\/\1\s*>|$)|<![^>]*>|<\/?[a-zA-Z][a-zA-Z0-9-]*(?:[^>"']|"[^"]*"|'[^']*')*>|[^<]+|</g;
const SEPARATEUR = /^[\s|\-–—:•·,/>»]*$/;
const FIN_CARTE = new Set(['li', 'article', 'tr', 'section', 'main', 'aside', 'table', 'form', 'nav', 'header', 'footer']);
const DEBUT_CARTE = new Set(['article', 'tr', 'section', 'main', 'aside', 'table', 'form', 'nav', 'header', 'footer', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6']);

// Lit une page : liens (avec leur texte, le titre de section au-dessus, le texte juste
// avant), formulaires (pour trouver la barre de recherche) et textes (liens écrits en clair).
export function lireHtml(html, adresse) {
  let base = adresse;
  const liens = [];
  const formulaires = [];
  const textes = [];
  let titrePage = '';
  let h1 = '';
  let dansTitle = false;
  let titreEnCours = null;
  let groupe = '';
  let lien = null;
  let form = null;
  let select = null;
  let dernierTexte = '';
  let suite = null; // dernier lien fermé : on garde le texte qui le suit (« 1080p · MULTI · 2024 »)

  const absolu = (u) => {
    if (!u || /^\s*(javascript|data|mailto|tel):/i.test(u)) return null;
    try {
      const x = new URL(u.trim(), base);
      return /^(https?|magnet):$/.test(x.protocol) ? x.href : null;
    } catch {
      return null;
    }
  };
  const fermerLien = () => {
    let ferme = null;
    if (lien?.url) {
      const { morceaux, ...reste } = lien;
      liens.push((ferme = { ...reste, texte: propre(morceaux.join(' ')), apres: '' }));
    }
    lien = null;
    return ferme;
  };
  const ajouterTexte = (brut) => {
    const t = decoderEntites(brut).replace(/\s+/g, ' ');
    if (!t.trim()) return;
    if (dansTitle) titrePage += t;
    if (titreEnCours) titreEnCours.morceaux.push(t);
    if (lien) return void lien.morceaux.push(t);
    const n = t.trim();
    textes.push({ texte: n, groupe });
    if (suite && suite.apres.length < 150) suite.apres = propre(`${suite.apres} ${n}`);
    // Le titre de section sert de groupe : il ne doit pas aussi devenir le libellé d'un lien.
    if (!titreEnCours && !SEPARATEUR.test(n)) dernierTexte = n.length <= 120 ? n : '';
  };

  for (const m of String(html).matchAll(RE_JETON)) {
    const j = m[0];
    if (j[0] !== '<' || j === '<') {
      ajouterTexte(j);
      continue;
    }
    if (m[1] || j[1] === '!') continue;
    const t = j.match(/^<(\/?)([a-zA-Z][a-zA-Z0-9-]*)/);
    const fin = t[1] === '/';
    const balise = t[2].toLowerCase();
    const attrs = fin ? {} : lireAttributs(j.slice(t[0].length, -1));

    if (!fin) {
      // Liens rangés dans des attributs (boutons « data-href »…).
      for (const cle of ['data-href', 'data-url', 'data-link']) {
        const u = attrs[cle] && absolu(attrs[cle]);
        if (u) liens.push({ url: u, texte: '', titre: '', alt: '', image: null, groupe, avant: dernierTexte, apres: '' });
      }
    }
    // Le texte « après un lien » s'arrête à la fin de sa carte (ou au début d'une autre).
    if (fin ? FIN_CARTE.has(balise) : DEBUT_CARTE.has(balise)) suite = null;

    switch (balise) {
      case 'base':
        if (!fin && attrs.href) base = absolu(attrs.href) || base;
        break;
      case 'title':
        dansTitle = !fin && !titrePage;
        break;
      case 'h1': case 'h2': case 'h3': case 'h4': case 'h5': case 'h6':
        if (!fin) {
          titreEnCours = { balise, morceaux: [] };
          dernierTexte = '';
        } else if (titreEnCours) {
          const texte = propre(titreEnCours.morceaux.join(' '));
          if (titreEnCours.balise === 'h1' && !h1) h1 = texte;
          else if (texte && texte.length <= 150) groupe = texte;
          titreEnCours = null;
        }
        break;
      case 'a': {
        const ferme = fermerLien();
        suite = fin ? ferme : null;
        if (!fin) {
          lien = { url: absolu(attrs.href), morceaux: [], titre: propre(attrs.title), alt: '', image: null, groupe, avant: dernierTexte };
        }
        break;
      }
      case 'img':
        if (lien) {
          const src = attrs['data-src'] || attrs['data-lazy-src'] || attrs['data-original'] || attrs.src;
          const u = src && absolu(src);
          if (u && !lien.image && /^https?:/.test(u)) lien.image = u;
          if (!lien.alt) lien.alt = propre(attrs.alt);
        }
        break;
      case 'form':
        if (form) formulaires.push(form);
        form = fin
          ? null
          : {
              action: attrs.action ? absolu(attrs.action) : adresse,
              methode: (attrs.method || 'get').toLowerCase(),
              indices: [attrs.id, attrs.class, attrs.role, attrs.name, attrs['aria-label']].filter(Boolean).join(' '),
              champs: [],
            };
        break;
      case 'input':
      case 'textarea':
      case 'button':
        if (form && !fin) {
          const type = (attrs.type || { input: 'text', textarea: 'textarea', button: 'submit' }[balise]).toLowerCase();
          form.champs.push({
            balise,
            nom: attrs.name || '',
            type,
            valeur: attrs.value ?? '',
            coche: 'checked' in attrs,
            indice: [attrs.placeholder, attrs['aria-label'], attrs.id, attrs.class, attrs.title].filter(Boolean).join(' '),
          });
        }
        break;
      case 'select':
        if (form && !fin) form.champs.push((select = { balise, nom: attrs.name || '', type: 'select', valeur: null, indice: '' }));
        else select = null;
        break;
      case 'option':
        if (select && !fin && (select.valeur === null || 'selected' in attrs)) select.valeur = attrs.value ?? '';
        break;
    }
  }
  fermerLien();
  if (form) formulaires.push(form);
  return { url: adresse, titre: h1 || propre(titrePage), liens, formulaires, textes };
}

// ---------- outils ----------

export function hoteDe(url) {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

function memeSite(url, hote) {
  const h = hoteDe(url);
  return !!h && (h === hote || h.endsWith(`.${hote}`) || hote.endsWith(`.${h}`));
}

const sansAncre = (u) => u.split('#')[0];

export { normaliser };

const MOTS_VIDES = new Set(['le', 'la', 'les', 'l', 'de', 'des', 'du', 'd', 'un', 'une', 'et', 'en', 'au', 'aux', 'the', 'a', 'an', 'of']);

export function motsCles(requete) {
  const mots = normaliser(requete).split(' ').filter(Boolean);
  const utiles = mots.filter((m) => !MOTS_VIDES.has(m));
  return [...new Set(utiles.length ? utiles : mots)];
}

// « dune » trouve « Dune », « deux » trouve « deuxième » ; « 2 » doit être un mot entier.
const correspond = (mot, mots) => mots.includes(mot) || (mot.length >= 3 && mots.some((w) => w.startsWith(mot)));

// ---------- barre de recherche ----------

const NOMS_RECHERCHE = /^(s|q|query|search|recherche|keywords?|story|term|motcle|k|searchword|search_query|search-query|txt)$/i;

// Choisit, parmi les formulaires de la page, celui qui ressemble le plus à une barre de recherche.
export function trouverBarre(formulaires) {
  let meilleure = null;
  for (const f of formulaires) {
    if (!f.action || f.champs.some((c) => c.type === 'password')) continue;
    const saisies = f.champs.filter((c) => c.balise === 'input' && ['text', 'search'].includes(c.type) && c.nom);
    if (!saisies.length || saisies.length > 3) continue;
    const champ =
      saisies.find((c) => c.type === 'search') ||
      saisies.find((c) => NOMS_RECHERCHE.test(c.nom) || /search|recherch|cherch/i.test(c.indice)) ||
      saisies[0];
    let score = 0;
    if (champ.type === 'search') score += 3;
    if (NOMS_RECHERCHE.test(champ.nom)) score += 3;
    if (/search|recherch|cherch|find/i.test(champ.indice)) score += 2;
    if (/search|recherch/i.test(`${f.action} ${f.indices}`)) score += 2;
    if (f.champs.some((c) => c.type === 'email')) score -= 4;
    if (f.methode === 'get') score += 1;
    if (score >= 3 && (!meilleure || score > meilleure.score)) meilleure = { score, f, champ };
  }
  if (!meilleure) return null;
  const { f, champ } = meilleure;
  const autres = [];
  let boutonVu = false;
  for (const c of f.champs) {
    if (c === champ) continue;
    const bouton = c.type === 'submit' || c.type === 'image';
    if (bouton) {
      // Comme un navigateur quand on tape Entrée : seul le premier bouton d'envoi compte.
      if (!boutonVu && c.nom && c.type === 'submit') autres.push([c.nom, c.valeur]);
      boutonVu = true;
      continue;
    }
    if (!c.nom || ['button', 'reset', 'file'].includes(c.type)) continue;
    if (['checkbox', 'radio'].includes(c.type) && !c.coche) continue;
    autres.push([c.nom, c.valeur ?? '']);
  }
  return { action: f.action, methode: f.methode === 'post' ? 'POST' : 'GET', champ: champ.nom, autres };
}

// Catégorie choisie (ex. { nom: 'p', valeur: 'series' }) : ajoutée à la fin, à la place d'une éventuelle valeur du site.
function ajouterCategorie(params, categorie) {
  if (!categorie) return;
  params.delete(categorie.nom);
  params.append(categorie.nom, categorie.valeur);
}

export function requeteRecherche(barre, requete, categorie = null) {
  const params = new URLSearchParams(barre.autres);
  params.append(barre.champ, requete);
  ajouterCategorie(params, categorie);
  if (barre.methode === 'POST') return { url: barre.action, methode: 'POST', corps: params.toString() };
  const u = new URL(barre.action);
  u.search = params.toString();
  u.hash = '';
  return { url: u.href, methode: 'GET' };
}

// ---------- résultats ----------

const NAVIGATION =
  /(^|\/)(tags?|categor(y|ie|ies)|genres?|login|logout|register|inscription|connexion|contact|dmca|faq|feed|rss|wp-(admin|login|json|content)|users?|profil|members?|lostpassword|privacy|cgu|mentions-legales)(\/|$|\?|\.)|[?&](page|paged|cstart|search_start|do=(register|lostpassword|feedback|login|rules|lastcomments))=?|\/page\/\d+/i;
const FICHIER_STATIQUE = /\.(css|js|jpe?g|png|gif|webp|svg|ico|xml|json|txt|pdf|zip|rar|torrent)$/i;
const TEXTE_GENERIQUE = /^(lire la suite|voir( plus| la fiche)?|plus d'?infos?|d[ée]tails?|t[ée]l[ée]charger|download|regarder|streaming|read more|more|suite|[»›.…]+)$/i;

// Liens d'une page qui peuvent mener à une fiche du site (pas le menu, la pagination, les images…),
// regroupés par adresse avec tous leurs textes, le texte qui les suit et leur affiche.
function collecterFiches(doc, exclus = new Set()) {
  const hote = hoteDe(doc.url);
  const ici = sansAncre(doc.url);
  const entrees = new Map();
  doc.liens.forEach((l, rang) => {
    if (!/^https?:/i.test(l.url) || !memeSite(l.url, hote)) return;
    const cle = sansAncre(l.url);
    const u = new URL(cle);
    if (cle === ici || exclus.has(cle) || (u.pathname === '/' && !u.search)) return;
    if (NAVIGATION.test(u.pathname + u.search) || FICHIER_STATIQUE.test(u.pathname)) return;
    let e = entrees.get(cle);
    if (!e) entrees.set(cle, (e = { url: cle, rang, textes: [], contexte: [], image: null }));
    for (const t of [l.texte, l.titre, l.alt]) {
      const p = propre(t);
      if (p && p.length <= 200 && !TEXTE_GENERIQUE.test(p) && !e.textes.includes(p)) e.textes.push(p);
    }
    if (l.apres && !e.contexte.includes(l.apres)) e.contexte.push(l.apres);
    if (l.image && !IMAGE_DECORATIVE.test(l.image)) e.image ||= l.image;
  });
  return [...entrees.values()].filter((e) => e.textes.length);
}
// Icônes, logos, pastilles « new » du thème du site : pas des affiches.
const IMAGE_DECORATIVE = /\/(templates?|themes?|skins?|icons?)\/|icon|logo|sprite|badge|flag|new[_-]|\.gif(\?|$)/i;

const cheminDe = (url) => {
  const u = new URL(url);
  try {
    return decodeURIComponent(u.pathname + u.search);
  } catch {
    return u.pathname + u.search;
  }
};

// Page d'accueil (ou d'une rubrique) : les fiches mises en avant, sans mots à faire correspondre.
// Une fiche se reconnaît à sa langue, sa qualité ou sa saison, ou à son affiche.
export function extraireNouveautes(doc) {
  const pagination = trouverPagination(doc);
  const fiches = collecterFiches(doc, pagination.liens)
    .map((e) => {
      const brut = [...e.textes].sort((a, b) => b.length - a.length)[0];
      const autour = [...e.textes.filter((t) => t !== brut), ...e.contexte].join(' ');
      return { url: e.url, brut, image: e.image, chemin: cheminDe(e.url), forme: formeAdresse(e.url), ...decrireResultat(brut, autour) };
    })
    .filter((r) => r.langue || r.qualite || r.saison || r.episodes || (r.image && /\d/.test(r.chemin)));
  // Les fiches d'un site ont presque toutes la même forme d'adresse (« ?p=film&id=123-… ») ; le menu
  // (« ?p=series&s=vostfr ») en a une autre et pas d'affiche : on garde les formes les plus courantes,
  // et les autres seulement avec une affiche (une série au milieu de films, par exemple).
  const parForme = new Map();
  for (const r of fiches) parForme.set(r.forme, (parForme.get(r.forme) || 0) + 1);
  const plusCourante = Math.max(0, ...parForme.values());
  const infos = (r) => r.langue || r.qualite || r.saison || r.episodes;
  return fiches
    .filter((r) => parForme.get(r.forme) >= Math.max(3, plusCourante * 0.25) || (r.image && infos(r)))
    .slice(0, 150)
    .map(({ forme, ...r }) => r);
}

// « /films/123-dune.html » → « /films/N » ; « /?p=film&id=123-dune » → « /?id&p ».
function formeAdresse(url) {
  const u = new URL(url);
  const chemin = u.pathname
    .split('/')
    .map((s) => (/\d/.test(s) ? 'N' : s))
    .join('/');
  return `${chemin}?${[...u.searchParams.keys()].sort().join('&')}`;
}

// Garde les liens de la page de résultats qui mènent à une fiche du site et dont le titre
// contient les mots cherchés. « accueil » = liens de la page d'accueil (le menu du site).
export function extraireResultats(doc, requete, { accueil = new Set(), exclus = new Set() } = {}) {
  const mots = motsCles(requete);
  const chemin = cheminDe;
  const tous = collecterFiches(doc, exclus)
    .map((e) => {
      const ch = chemin(e.url);
      let meilleur = null;
      for (const t of e.textes) {
        const n = mots.filter((m) => correspond(m, normaliser(t).split(' '))).length;
        const long = Math.min(t.length, 120) - (t.length > 120 ? 200 : 0);
        if (!meilleur || n > meilleur.n || (n === meilleur.n && long > meilleur.long)) meilleur = { t, n, long };
      }
      const motsEntree = normaliser(`${e.textes.join(' ')} ${ch}`).split(' ');
      const score = mots.filter((m) => correspond(m, motsEntree)).length;
      // Langue, qualité, saison… : la fin du titre, sinon les étiquettes autour du lien (badge « 1080p » sur l'affiche…).
      const autour = [...e.textes.filter((t) => t !== meilleur.t), ...e.contexte].join(' ');
      return {
        url: e.url, brut: meilleur.t, image: e.image, chemin: ch, score, scoreTitre: meilleur.n, rang: e.rang,
        ...decrireResultat(meilleur.t, autour),
      };
    })
    // Un lien du menu n'est gardé que s'il contient tous les mots (ex. une nouveauté en page d'accueil).
    .filter((r) => !accueil.has(r.url) || r.score === mots.length);

  const seuil = Math.max(1, Math.ceil(mots.length / 2));
  let resultats = tous.filter((r) => r.score >= seuil && r.scoreTitre >= 1);
  let approximatif = false;
  if (!resultats.length) {
    approximatif = true;
    resultats = tous.filter((r) => r.score >= 1);
  }
  if (!resultats.length) resultats = tous.filter((r) => /[-_\d]/.test(r.chemin) && r.titre.length >= 3 && !accueil.has(r.url));
  resultats.sort((a, b) => b.score - a.score || a.rang - b.rang);
  return {
    resultats: resultats.slice(0, 100).map(({ score, scoreTitre, rang, ...r }) => r),
    approximatif,
  };
}

// ---------- pagination ----------

// Noms usuels du numéro de page, du plus sûr au plus ambigu (« p » sert parfois à autre chose).
const PARAMS_PAGE = ['page', 'paged', 'pg', 'pagenum', 'pageno', 'numpage', 'cstart', 'search_start', 'p'];
const cheminSansPage = (p) => p.replace(/\/page\/\d+\/?$/i, '').replace(/\/+$/, '') || '/';

// Repère les liens « 2, 3, Suivante… » de la page de résultats : même adresse que la page
// affichée, au numéro de page près (?page=2, &paged=3, /page/4/…). Renvoie un modèle
// d'adresse avec {page}, le plus grand numéro vu et les liens concernés.
export function trouverPagination(doc) {
  const rien = { modele: null, total: 1, courante: 1, liens: new Set() };
  let ici;
  try {
    ici = new URL(doc.url);
  } catch {
    return rien;
  }
  const hoteIci = ici.host.replace(/^www\./, '');
  const cheminIci = cheminSansPage(ici.pathname);
  const parModele = new Map();
  for (const l of doc.liens) {
    let u;
    try {
      u = new URL(l.url);
    } catch {
      continue;
    }
    if (!/^https?:$/.test(u.protocol) || u.host.replace(/^www\./, '') !== hoteIci || cheminSansPage(u.pathname) !== cheminIci) continue;
    let n = null;
    let nom = null;
    const modele = new URL(u.href);
    modele.hash = '';
    const chemin = u.pathname.match(/\/page\/(\d+)\/?$/i);
    if (chemin) {
      n = Number(chemin[1]);
      modele.pathname = u.pathname.replace(/\/page\/\d+(\/?)$/i, '/page/__PAGE__$1');
    } else {
      nom = PARAMS_PAGE.find((k) => /^\d{1,4}$/.test(u.searchParams.get(k) || '') && u.searchParams.get(k) !== ici.searchParams.get(k));
      if (!nom) continue;
      n = Number(u.searchParams.get(nom));
      modele.searchParams.set(nom, '__PAGE__');
    }
    // Le reste de la recherche (mot cherché, filtres) doit être conservé tel quel.
    if (!n || ![...ici.searchParams].every(([k, v]) => k === nom || u.searchParams.getAll(k).includes(v))) continue;
    // Même modèle quel que soit l'ordre des paramètres.
    const trie = new URL(modele.href);
    trie.searchParams.sort();
    if (!parModele.has(trie.href)) parModele.set(trie.href, { modele: modele.href.replace('__PAGE__', '{page}'), nom, numeros: [], liens: [] });
    parModele.get(trie.href).numeros.push(n);
    parModele.get(trie.href).liens.push(sansAncre(u.href));
  }
  if (!parModele.size) return rien;
  // Plusieurs barres possibles (haut et bas de page, autre liste…) : on garde la plus fournie.
  const { modele, nom, numeros, liens } = [...parModele.values()].sort((a, b) => b.numeros.length - a.numeros.length)[0];
  const courante = Number(nom ? ici.searchParams.get(nom) : ici.pathname.match(/\/page\/(\d+)\/?$/i)?.[1]) || 1;
  return { modele, total: Math.max(courante, ...numeros), courante, liens: new Set(liens) };
}

// ---------- sources ----------

const PAGES_NON_FICHIER = /^\/(register|login|signup|premium|tarifs?|pricing|console|help|aide|faq|cgu|tos|terms|abus|abuse|contact)?(\.\w+)?\/?$/i;
const LIBELLE_GENERIQUE =
  /^(t[ée]l[ée]charg\w*|download\w*|dl|lien|link|liens|links|ici|here|cliquez?( ici)?|click( here)?|voir|go|acc[ée]der|ouvrir|open|[>»→]+)\W*$/i;

function chercherDomaine(hote, domaines) {
  for (let d = hote; d.includes('.'); d = d.slice(d.indexOf('.') + 1)) if (domaines.has(d)) return domaines.get(d);
  return null;
}

// Dit ce qu'est un lien : magnet, .torrent, lien d'hébergeur, protecteur de liens… ou rien d'utile.
export function classerLien(url, hebergeurs) {
  if (/^magnet:/i.test(url)) {
    const hash = url.match(/btih:([a-z0-9]+)/i)?.[1];
    if (!hash) return null;
    const dn = new URLSearchParams(url.slice(url.indexOf('?') + 1)).get('dn');
    return { type: 'magnet', hebergeur: 'Magnet', nom: propre(dn), cle: `btih:${hash.toLowerCase()}` };
  }
  let u;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (!/^https?:$/.test(u.protocol)) return null;
  const h = u.hostname.toLowerCase().replace(/^www\./, '');
  const redirecteur = chercherDomaine(h, hebergeurs.redirecteurs) || (/^dl-protect\d*\./.test(h) ? 'dl-protect' : null);
  if (redirecteur) return u.pathname.length > 1 || u.search ? { type: 'protege', hebergeur: redirecteur } : null;
  const hebergeur = chercherDomaine(h, hebergeurs.hebergeurs);
  if (hebergeur) return PAGES_NON_FICHIER.test(u.pathname) && !u.search ? null : { type: 'hebergeur', hebergeur };
  if (/\.torrent$/i.test(u.pathname)) return { type: 'torrent', hebergeur: '.torrent', nom: decodeURIComponent(u.pathname.split('/').pop()) };
  return null;
}

function libelleSource(texte, avant, s) {
  const t = propre(texte);
  const memeNom = (x) => normaliser(x) === normaliser(s.hebergeur);
  if (t && !LIBELLE_GENERIQUE.test(t) && !/^(https?|magnet):/i.test(t) && !memeNom(t)) return t.slice(0, 150);
  if (s.nom) return s.nom.slice(0, 150);
  const a = propre(avant).replace(/[\s:|\-–—>»]+$/, '');
  if (a && a.length <= 80 && !memeNom(a) && !LIBELLE_GENERIQUE.test(a)) return a;
  return '';
}

// Nom de fichier glissé dans l'adresse par certains sites (« dl-protect.link/abc?fn=<base64> ») :
// « The Boys - Saison 1 Épisode 3 - [VF HD] » dit exactement quel épisode se cache derrière.
const PARAMS_NOM = ['fn', 'filename', 'file', 'name', 'nom', 'title', 'titre'];
export function nomDansLien(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return '';
  }
  for (const cle of PARAMS_NOM) {
    const v = u.searchParams.get(cle);
    if (!v) continue;
    if (/^[A-Za-z0-9+/_-]{8,}={0,2}$/.test(v)) {
      const texte = Buffer.from(v.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
      if (!/[\u0000-\u001f�]/.test(texte) && /\p{L}{2}/u.test(texte)) return propre(texte);
    }
    if (/\s/.test(v) && /\p{L}{2}/u.test(v)) return propre(v);
  }
  return '';
}

// « Rapidgator - Télécharger », « Vidoza - Regarder » : l'hébergeur réel (même derrière un protecteur)
// et la nature du lien (téléchargement ou simple lecture en streaming).
const RE_ACTION = /^(.{2,30}?)\s*[-–:|]\s*(t[ée]l[ée]charger|download|dl|regarder|streaming|stream|voir|lire)\b/i;
// « Rapidgator - Film.2024.MULTi.1080p.mkv » : ce que le site annonce devant le nom du fichier.
const RE_ANNONCE = /^(\S{2,20})\s+[-–:|]\s+\S/;

export function extraireSources(doc, hebergeurs) {
  const sources = [];
  const vues = new Set();
  const ajouter = (url, { texte = '', avant = '', groupe = '' }) => {
    const s = classerLien(url, hebergeurs);
    if (!s) return;
    const cle = s.cle || url;
    if (vues.has(cle)) return;
    vues.add(cle);
    const action = propre(texte).match(RE_ACTION);
    const nom = nomDansLien(url) || s.nom || '';
    const ep = episodeDuNom(nom) || episodeDuNom(action ? '' : texte);
    sources.push({
      url,
      type: s.type,
      hebergeur: action?.[1] || s.hebergeur,
      protecteur: s.type === 'protege' ? s.hebergeur : '',
      // Hébergeur annoncé devant un lien protégé : évite de tester ceux qu'AllDebrid ne gère pas.
      annonce: s.type === 'protege' ? action?.[1] || propre(texte).match(RE_ANNONCE)?.[1] || '' : '',
      streaming: !!action && /regarder|stream|voir|lire/i.test(action[2]),
      nom,
      saison: ep?.saison ?? null,
      episode: ep?.episode ?? null,
      libelle: action ? nom : libelleSource(texte, avant, s),
      groupe,
    });
  };
  for (const l of doc.liens) ajouter(l.url, { texte: l.texte || l.titre || l.alt, avant: l.avant, groupe: l.groupe });
  // Liens écrits en clair dans la page (blocs <pre>, listes à copier…).
  for (const t of doc.textes) {
    for (const m of t.texte.matchAll(/magnet:\?xt=[^\s"'<>]+|https?:\/\/[^\s"'<>]+/gi)) {
      ajouter(m[0].replace(/[),.;:!?]+$/, ''), { groupe: t.groupe });
    }
  }
  return sources;
}

// ---------- hébergeurs reconnus ----------

// Si AllDebrid ne répond pas (pas de clé, hors ligne), on se rabat sur les plus courants.
const SECOURS = {
  hebergeurs: {
    '1fichier': ['1fichier.com', 'alterupload.com', 'cjoint.net', 'desfichiers.com', 'dfichiers.com', 'megadl.fr', 'mesfichiers.org', 'piecejointe.net', 'pjointe.com', 'tenvoi.com', 'dl4free.com'],
    uptobox: ['uptobox.com', 'uptobox.eu', 'uptobox.fr', 'uptobox.link', 'uptostream.com'],
    rapidgator: ['rapidgator.net', 'rg.to'],
    turbobit: ['turbobit.net'],
    nitroflare: ['nitroflare.com'],
    mega: ['mega.nz', 'mega.co.nz'],
    mediafire: ['mediafire.com'],
    uploaded: ['uploaded.net', 'ul.to'],
    katfile: ['katfile.com'],
    ddownload: ['ddownload.com', 'ddl.to'],
    filefactory: ['filefactory.com'],
    gofile: ['gofile.io'],
    pixeldrain: ['pixeldrain.com'],
    'send.cm': ['send.cm'],
  },
  redirecteurs: { 'dl-protect': ['dl-protect.link', 'dl-protect.net', 'dl-protect.org', 'dl-protect.info'] },
};

function versCarte(groupe) {
  const m = new Map();
  for (const [nom, domaines] of Object.entries(groupe)) for (const d of domaines) m.set(d.toLowerCase().replace(/^www\./, ''), nom);
  return m;
}

let cacheHebergeurs = null;
export async function hebergeursConnus(ad, signal) {
  if (cacheHebergeurs && Date.now() < cacheHebergeurs.expire) return cacheHebergeurs.v;
  let v;
  let duree = 12 * 3600e3;
  try {
    v = await ad.hebergeurs(signal);
    if (!v.hebergeurs.size) throw new Error('liste vide');
  } catch {
    v = { hebergeurs: versCarte(SECOURS.hebergeurs), redirecteurs: versCarte(SECOURS.redirecteurs) };
    duree = 5 * 60e3;
  }
  cacheHebergeurs = { v, expire: Date.now() + duree };
  return v;
}

// La disponibilité des liens et des fiches (encore en ligne ?) est dans disponibilite.mjs.

// ---------- accès au site ----------

async function telecharger(url, { methode = 'GET', corps, referer, signal } = {}) {
  let res;
  try {
    const sig = signal ? AbortSignal.any([signal, AbortSignal.timeout(25_000)]) : AbortSignal.timeout(25_000);
    res = await fetch(url, {
      method: methode,
      headers: {
        ...NAVIGATEUR,
        ...(corps ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
        ...(referer ? { Referer: referer } : {}),
      },
      body: corps,
      redirect: 'follow',
      signal: sig,
    });
  } catch (e) {
    if (signal?.aborted) throw e;
    const cause = e.name === 'TimeoutError' ? 'trop long à répondre' : e.cause?.code || e.message;
    throw new ErreurRecherche(`${hoteDe(url) || 'Le site'} est injoignable (${cause}).`);
  }
  const morceaux = [];
  let n = 0;
  for await (const c of res.body || []) {
    n += c.length;
    if (n > TAILLE_MAX) throw new ErreurRecherche('Page trop lourde pour être lue.');
    morceaux.push(c);
  }
  const brut = Buffer.concat(morceaux);
  const charset =
    (res.headers.get('content-type') || '').match(/charset=["']?([\w-]+)/i)?.[1] ||
    brut.subarray(0, 4096).toString('latin1').match(/<meta[^>]+charset=["']?([\w-]+)/i)?.[1] ||
    'utf-8';
  let html;
  try {
    html = new TextDecoder(charset).decode(brut);
  } catch {
    html = new TextDecoder().decode(brut);
  }
  if (res.headers.get('cf-mitigated') === 'challenge' || ([403, 429, 503].includes(res.status) && /cf-chl|challenge-platform|<title>just a moment/i.test(html))) {
    throw new ErreurRecherche(`${hoteDe(url)} affiche une vérification anti-robot : la recherche automatique n'y est pas possible.`);
  }
  if (!res.ok) throw new ErreurRecherche(`${hoteDe(url)} a répondu « HTTP ${res.status} ».`);
  return { html, url: res.url || url };
}

// Le site configuré : soit une adresse de recherche avec {q}, soit l'adresse du site
// (dont on lit la page d'accueil pour trouver la barre de recherche).
export function lireSite(site) {
  const s = propre(site);
  if (!s) throw new ErreurRecherche("Indique d'abord le site où chercher (Réglages).");
  const modele = /\{q\}/.test(s) ? s : null;
  let accueil;
  try {
    const u = new URL(s.replace(/\{q\}/g, 'x'));
    if (!/^https?:$/.test(u.protocol)) throw new Error();
    accueil = modele ? `${u.origin}/` : u.href;
  } catch {
    throw new ErreurRecherche('Adresse du site de recherche invalide (Réglages).');
  }
  return { modele, accueil };
}

const cacheSites = new Map();

// Pages qu'on accepte d'aller lire : celles du site configuré (port compris) et de ses sous-domaines.
const hotesAutorises = new Set();
const hoteComplet = (url) => {
  try {
    return new URL(url).host.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
};
const autoriser = (url) => hotesAutorises.add(hoteComplet(url));
const estAutorise = (url) => {
  const h = hoteComplet(url);
  return [...hotesAutorises].some((a) => h === a || h.endsWith(`.${a}`) || a.endsWith(`.${h}`));
};

async function infosSite(accueil, signal) {
  const c = cacheSites.get(accueil);
  if (c && Date.now() < c.expire) return c;
  const page = await telecharger(accueil, { signal });
  const doc = lireHtml(page.html, page.url);
  const v = { url: page.url, barre: trouverBarre(doc.formulaires), liens: new Set(doc.liens.map((l) => sansAncre(l.url))), expire: Date.now() + 6 * 3600e3 };
  cacheSites.set(accueil, v);
  autoriser(page.url);
  return v;
}

export function viderCacheRecherche() {
  cacheSites.clear();
  cachePages.clear();
  hotesAutorises.clear();
}

// Pour chaque recherche faite : comment obtenir les pages suivantes.
// { modele (adresse avec {page}), total, devine, premiers (fiches de la page 1) }
const cachePages = new Map();
const clePages = (site, requete, categorie) => `${site}\n${normaliser(requete)}\n${categorie ? `${categorie.nom}=${categorie.valeur}` : ''}`;
const avecCategorie = (adresse, categorie) => {
  if (!categorie) return adresse;
  const u = new URL(adresse.replace(/\{page\}/g, '__PAGE__'));
  ajouterCategorie(u.searchParams, categorie);
  return u.href.replace(/__PAGE__/g, '{page}');
};
const contientRequete = (url, requete) => {
  let texte = url;
  try {
    texte = decodeURIComponent(url.replace(/\+/g, ' '));
  } catch {}
  return normaliser(texte).includes(normaliser(requete));
};

async function premierePage(site, requete, categorie, signal) {
  const { modele, accueil } = lireSite(site);
  autoriser(accueil);
  let page;
  let menu = new Set();
  let get = true;
  if (modele) {
    const [p, infos] = await Promise.all([
      telecharger(avecCategorie(modele.replace(/\{q\}/g, encodeURIComponent(requete)), categorie).replace(/\{page\}/g, '1'), { signal }),
      infosSite(accueil, signal).catch(() => null),
    ]);
    page = p;
    if (infos) menu = infos.liens;
  } else {
    const infos = await infosSite(accueil, signal);
    if (!infos.barre) {
      const exemple = `${new URL(infos.url).origin}/?s={q}`;
      throw new ErreurRecherche(
        `Pas de barre de recherche reconnue sur ${hoteDe(infos.url)}. Dans les Réglages, mets plutôt l'adresse d'une page de résultats avec {q} à la place des mots (par exemple ${exemple}).`,
      );
    }
    const r = requeteRecherche(infos.barre, requete, categorie);
    page = await telecharger(r.url, { methode: r.methode, corps: r.corps, referer: infos.url, signal });
    menu = infos.liens;
    get = r.methode === 'GET';
  }
  autoriser(page.url);
  const doc = lireHtml(page.html, page.url);
  const pagination = trouverPagination(doc);
  if (!get && pagination.modele && !contientRequete(pagination.modele, requete)) {
    // Recherche en POST : un « /page/2/ » sans les mots cherchés est la pagination du site, pas des résultats.
    Object.assign(pagination, { modele: null, total: 1 });
  }
  const r = extraireResultats(doc, requete, { accueil: menu, exclus: pagination.liens });

  // Pages suivantes : d'après les liens de la page ; sinon {page} dans l'adresse des Réglages ;
  // sinon, si la recherche est une simple adresse et remplit la page, on tente « &page=2 ».
  let suite = { modele: pagination.modele, total: pagination.total, devine: false };
  if (!suite.modele && modele && /\{page\}/.test(modele)) {
    suite = { modele: avecCategorie(modele.replace(/\{q\}/g, encodeURIComponent(requete)), categorie), total: 1, devine: true };
  } else if (!suite.modele && get && r.resultats.length >= 8) {
    const u = new URL(page.url);
    u.searchParams.set('page', '__PAGE__');
    suite = { modele: u.href.replace('__PAGE__', '{page}'), total: 1, devine: true };
  }
  const cle = clePages(site, requete, categorie);
  cachePages.delete(cle);
  cachePages.set(cle, { ...suite, premiers: new Set(r.resultats.map((x) => x.url)), menu });
  if (cachePages.size > 50) cachePages.delete(cachePages.keys().next().value);
  return { site: hoteDe(page.url), ...r, page: 1, pages: etatPages(suite, 1, r.resultats.length > 0) };
}

const etatPages = (suite, page, trouve) => ({
  total: Math.max(page, suite.total),
  suivante: !!suite.modele && (suite.devine ? trouve : suite.total > page),
  devine: suite.devine,
});

// categorie : { nom, valeur } ajouté à l'adresse de recherche (ex. « &p=series »), ou null.
export async function rechercher(site, requete, { page = 1, categorie = null, signal } = {}) {
  if (page <= 1) return premierePage(site, requete, categorie, signal);
  const cle = clePages(site, requete, categorie);
  if (!cachePages.has(cle)) await premierePage(site, requete, categorie, signal);
  const suite = cachePages.get(cle);
  if (!suite?.modele) throw new ErreurRecherche("Cette recherche n'a qu'une page de résultats.");
  const adresse = suite.modele.replace(/\{page\}/g, String(page));
  if (!estAutorise(adresse)) throw new ErreurRecherche("La page suivante n'est pas sur le site de recherche configuré.");
  const p = await telecharger(adresse, { referer: lireSite(site).accueil, signal });
  const doc = lireHtml(p.html, p.url);
  const pagination = trouverPagination(doc);
  if (pagination.modele) suite.total = Math.max(suite.total, pagination.total);
  let r = extraireResultats(doc, requete, { accueil: suite.menu, exclus: pagination.liens });
  // Numéro de page deviné : si le site renvoie encore la page 1, c'est qu'il n'y a pas de suite.
  if (suite.devine && r.resultats.every((x) => suite.premiers.has(x.url))) r = { resultats: [], approximatif: false };
  return { site: hoteDe(p.url), ...r, page, pages: etatPages(suite, page, r.resultats.length > 0) };
}

// Nouveautés du site, pour la page d'accueil d'Ondi : la rubrique choisie (« ?p=films »)
// si elle donne quelque chose, sinon la page d'accueil du site.
export async function nouveautes(site, { categorie = null, signal } = {}) {
  const { accueil } = lireSite(site);
  autoriser(accueil);
  const adresses = [];
  if (categorie) {
    const u = new URL(accueil);
    ajouterCategorie(u.searchParams, categorie);
    adresses.push(u.href);
  }
  adresses.push(accueil);
  let derniere = null;
  for (const adresse of adresses) {
    try {
      const page = await telecharger(adresse, { signal });
      autoriser(page.url);
      let resultats = extraireNouveautes(lireHtml(page.html, page.url));
      // Une rubrique montre souvent aussi des encadrés « derniers films / dernières séries » : on garde
      // les fiches dont l'adresse porte le nom de la rubrique (« ?p=manga&id=… » pour « mangas »),
      // sinon celles du bon type (série ou film).
      if (adresse !== accueil) {
        const radical = categorie.valeur.toLowerCase().replace(/s$/, '');
        const parAdresse = resultats.filter((r) => r.url.toLowerCase().includes(radical));
        const veutSerie = /serie|manga|anim/i.test(radical) ? true : /film/i.test(radical) ? false : null;
        if (parAdresse.length) resultats = parAdresse;
        else if (veutSerie !== null && resultats.some((r) => r.serie === veutSerie)) resultats = resultats.filter((r) => r.serie === veutSerie);
      }
      if (resultats.length || adresse === accueil) return { site: hoteDe(page.url), resultats, rubrique: adresse !== accueil };
    } catch (e) {
      if (signal?.aborted) throw e;
      derniere = e;
    }
  }
  throw derniere || new ErreurRecherche("Rien trouvé sur la page d'accueil du site.");
}

export async function sourcesDe(site, adresse, { ad, signal } = {}) {
  const { accueil } = lireSite(site);
  autoriser(accueil);
  let u;
  try {
    u = new URL(adresse);
  } catch {
    throw new ErreurRecherche('Adresse de page invalide.');
  }
  if (!/^https?:$/.test(u.protocol) || !estAutorise(u.href)) {
    throw new ErreurRecherche("Cette page n'est pas sur le site de recherche configuré.");
  }
  const [page, hebergeurs] = await Promise.all([telecharger(u.href, { referer: accueil, signal }), hebergeursConnus(ad, signal)]);
  const doc = lireHtml(page.html, page.url);
  return { titre: doc.titre, adresse: page.url, sources: extraireSources(doc, hebergeurs) };
}
