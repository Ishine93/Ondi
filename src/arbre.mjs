// Arbre d'une page HTML ou d'une réponse XML, et sélecteurs CSS pour y chercher.
// Sert aux descriptions de sources (catalogue de Prowlarr), écrites pour un vrai navigateur :
// on reproduit donc ce qu'il fait d'important (balises non refermées, <tbody> ajouté d'office…)
// et les sélecteurs qu'elles emploient (:contains, :has, :not, :nth-child…). Aucune dépendance.
import { decoderEntites } from './recherche.mjs';

export class ErreurSelecteur extends Error {}

// Un élément : { nom, attrs, enfants (éléments et textes), parent }. Un texte est une simple chaîne.
const creer = (nom, attrs = {}, parent = null) => {
  const el = { nom, attrs, enfants: [], parent };
  if (parent) {
    parent.enfants.push(el);
    parent._fils = null;
  }
  return el;
};
const estElement = (n) => typeof n !== 'string';

export const filsDe = (el) => (el._fils ||= el.enfants.filter(estElement));

export function texteDe(n) {
  if (!estElement(n)) return n;
  let t = '';
  for (const e of n.enfants) t += estElement(e) ? texteDe(e) : e;
  return t;
}

export const attributDe = (el, nom) => el.attrs[nom.toLowerCase()] ?? null;

export function retirer(el) {
  const p = el.parent;
  if (!p) return;
  p.enfants.splice(p.enfants.indexOf(el), 1);
  p._fils = null;
  el.parent = null;
}

// Déplace les enfants de « source » à la fin de « cible » (lignes de tableau à fusionner).
export function deplacerEnfants(source, cible) {
  for (const e of source.enfants) {
    if (estElement(e)) e.parent = cible;
    cible.enfants.push(e);
  }
  source.enfants = [];
  source._fils = cible._fils = null;
}

export function frerePrecedent(el) {
  const f = el.parent ? filsDe(el.parent) : [];
  return f[f.indexOf(el) - 1] || null;
}

export function racineDe(el) {
  while (el.parent) el = el.parent;
  return el;
}

// ---------- lecture HTML ----------

const RE_ATTRIBUT = /([^\s"'=<>/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
function lireAttributs(s, decoder = decoderEntites) {
  const a = {};
  for (const m of s.matchAll(RE_ATTRIBUT)) {
    const nom = m[1].toLowerCase();
    if (!(nom in a)) a[nom] = decoder(m[2] ?? m[3] ?? m[4] ?? '');
  }
  return a;
}

const VIDES = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
const TEXTE_BRUT = new Set(['script', 'style', 'textarea', 'title', 'xmp', 'iframe', 'noembed', 'noframes']);
const DANS_ENTETE = new Set(['title', 'meta', 'link', 'base', 'script', 'style', 'noscript', 'template']);
// Balises « de structure » : une balise fermante de mise en forme (</span>, </a>…) ne les traverse pas.
const STRUCTURE = new Set(
  'address article aside blockquote body button caption center dd details dir div dl dt fieldset figcaption figure footer form h1 h2 h3 h4 h5 h6 header hgroup html li main menu nav ol p pre section select summary table tbody td tfoot th thead tr ul'.split(' '),
);
// Balises qui referment un <p> resté ouvert.
const FERME_P = new Set(
  'address article aside blockquote center details dir div dl fieldset figcaption figure footer form h1 h2 h3 h4 h5 h6 header hgroup hr main menu nav ol p pre section table ul li dd dt'.split(' '),
);
const TITRES = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
const DE_TABLEAU = new Set(['table', 'tbody', 'thead', 'tfoot', 'tr', 'td', 'th', 'caption']);

const RE_JETON_HTML = /<!--[\s\S]*?(?:-->|$)|<!\[CDATA\[[\s\S]*?(?:\]\]>|$)|<![^>]*>|<\?[^>]*>|<\/?[a-zA-Z][^\s/>]*(?:[^>"']|"[^"]*"|'[^']*')*>|[^<]+|</g;

export function lireArbreHtml(html) {
  const document = creer('#document');
  const racine = creer('html', {}, document);
  const entete = creer('head', {}, racine);
  const corps = creer('body', {}, racine);
  let pile = [entete]; // éléments ouverts, du plus ancien au plus récent
  let dansCorps = false;
  const courant = () => pile[pile.length - 1];
  const versCorps = () => {
    if (!dansCorps) {
      dansCorps = true;
      pile = [corps];
    }
  };
  // Referme les éléments ouverts jusqu'au plus récent de « noms », sans franchir « bornes ».
  const fermerJusqua = (noms, bornes) => {
    for (let k = pile.length - 1; k > 0; k--) {
      if (noms.has(pile[k].nom)) return void (pile.length = k);
      if (bornes.has(pile[k].nom)) return;
    }
  };
  const ouvert = (nom, bornes) => {
    for (let k = pile.length - 1; k > 0; k--) {
      if (pile[k].nom === nom) return true;
      if (bornes.has(pile[k].nom)) return false;
    }
    return false;
  };
  const CELLULE = new Set(['td', 'th', 'caption', 'table']);
  const un = (...n) => new Set(n);

  const s = String(html);
  RE_JETON_HTML.lastIndex = 0;
  let m;
  while ((m = RE_JETON_HTML.exec(s))) {
    const j = m[0];
    if (j[0] !== '<' || j === '<') {
      if (!dansCorps) {
        if (!j.trim()) continue;
        versCorps();
      }
      courant().enfants.push(decoderEntites(j));
      continue;
    }
    if (j[1] === '!' || j[1] === '?') continue;
    const t = j.match(/^<(\/?)([a-zA-Z][^\s/>]*)/);
    const nom = t[2].toLowerCase();

    if (t[1]) {
      // ----- balise fermante -----
      if (nom === 'html' || nom === 'body' || nom === 'head') {
        if (nom === 'head') versCorps();
        continue;
      }
      if (nom === 'br') {
        versCorps();
        creer('br', {}, courant());
        continue;
      }
      if (nom === 'p' && !ouvert('p', CELLULE)) continue;
      if (DE_TABLEAU.has(nom)) fermerJusqua(un(nom), nom === 'table' ? un('html') : un('table'));
      else if (STRUCTURE.has(nom)) fermerJusqua(TITRES.has(nom) ? TITRES : un(nom), CELLULE);
      else fermerJusqua(un(nom), STRUCTURE);
      continue;
    }

    // ----- balise ouvrante -----
    const attrs = lireAttributs(j.slice(t[0].length, j.endsWith('/>') ? -2 : -1));
    if (nom === 'html' || nom === 'body') {
      const cible = nom === 'html' ? racine : corps;
      for (const [k, v] of Object.entries(attrs)) cible.attrs[k] ??= v;
      if (nom === 'body') versCorps();
      continue;
    }
    if (nom === 'head') continue;
    if (!dansCorps && !DANS_ENTETE.has(nom)) versCorps();

    if (dansCorps) {
      if (FERME_P.has(nom) && ouvert('p', CELLULE)) fermerJusqua(un('p'), CELLULE);
      if (nom === 'li') fermerJusqua(un('li'), un('ul', 'ol', 'td', 'th', 'table'));
      else if (nom === 'dt' || nom === 'dd') fermerJusqua(un('dt', 'dd'), un('dl', 'td', 'th', 'table'));
      else if (nom === 'option') fermerJusqua(un('option'), un('select', 'optgroup', 'td', 'th', 'table'));
      else if (nom === 'optgroup') fermerJusqua(un('optgroup'), un('select', 'td', 'th', 'table'));
      else if (TITRES.has(nom) && TITRES.has(courant().nom)) pile.pop();
      else if (nom === 'a' && ouvert('a', STRUCTURE)) fermerJusqua(un('a'), STRUCTURE);
      else if (nom === 'thead' || nom === 'tbody' || nom === 'tfoot') fermerJusqua(un('thead', 'tbody', 'tfoot'), un('table'));
      else if (nom === 'tr') {
        fermerJusqua(un('tr'), un('table'));
        // Comme un navigateur : une ligne posée directement dans <table> va dans un <tbody>.
        if (courant().nom === 'table') pile.push(creer('tbody', {}, courant()));
      } else if (nom === 'td' || nom === 'th') {
        fermerJusqua(un('td', 'th'), un('tr', 'table'));
        if (courant().nom === 'table') pile.push(creer('tbody', {}, courant()));
        if (['tbody', 'thead', 'tfoot'].includes(courant().nom)) pile.push(creer('tr', {}, courant()));
      }
    }

    const el = creer(nom, attrs, courant());
    // « <div/> » n'est pas refermé en HTML (la barre est ignorée) : seules les balises vides le sont.
    if (VIDES.has(nom)) continue;
    // Un <form> posé entre <table> et ses lignes reste vide, comme dans un navigateur : les lignes
    // qui suivent vont dans le tableau, pas dans le formulaire.
    if (nom === 'form' && ['table', 'tbody', 'thead', 'tfoot', 'tr'].includes(el.parent.nom)) continue;
    if (TEXTE_BRUT.has(nom)) {
      // Contenu pris tel quel jusqu'à la balise fermante (un script contient des « < »).
      const fin = new RegExp(`</${nom}\\s*>`, 'i').exec(s.slice(RE_JETON_HTML.lastIndex));
      const brut = fin ? s.slice(RE_JETON_HTML.lastIndex, RE_JETON_HTML.lastIndex + fin.index) : s.slice(RE_JETON_HTML.lastIndex);
      if (brut) el.enfants.push(nom === 'title' || nom === 'textarea' ? decoderEntites(brut) : brut);
      RE_JETON_HTML.lastIndex += brut.length + (fin ? fin[0].length : 0);
      continue;
    }
    pile.push(el);
  }
  return document;
}

// ---------- lecture XML ----------

const ENTITES_XML = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const decoderXml = (t) =>
  String(t).replace(/&(?:#(x[0-9a-f]+|\d+)|([a-z]+));/gi, (m, num, nom) => {
    if (num) {
      const n = /^x/i.test(num) ? parseInt(num.slice(1), 16) : parseInt(num, 10);
      return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
    }
    return ENTITES_XML[nom] ?? m;
  });

const RE_JETON_XML = /<!--[\s\S]*?(?:-->|$)|<!\[CDATA\[([\s\S]*?)(?:\]\]>|$)|<![^>]*>|<\?[\s\S]*?\?>|<\/?[^\s/>!?][^\s/>]*(?:[^>"']|"[^"]*"|'[^']*')*>|[^<]+|</g;

// Les noms de balises et d'attributs sont mis en minuscules (« pubDate » se cherche « pubdate ») :
// les sélecteurs le sont aussi.
export function lireArbreXml(xml) {
  const document = creer('#document');
  const pile = [document];
  for (const m of String(xml).matchAll(RE_JETON_XML)) {
    const j = m[0];
    const haut = pile[pile.length - 1];
    if (j.startsWith('<![CDATA[')) {
      haut.enfants.push(m[1]);
      continue;
    }
    if (j[0] !== '<' || j === '<') {
      if (pile.length > 1 && j.trim()) haut.enfants.push(decoderXml(j));
      continue;
    }
    if (j[1] === '!' || j[1] === '?') continue;
    const t = j.match(/^<(\/?)([^\s/>]+)/);
    const nom = t[2].toLowerCase();
    if (t[1]) {
      for (let k = pile.length - 1; k > 0; k--) {
        if (pile[k].nom === nom) {
          pile.length = k;
          break;
        }
      }
      continue;
    }
    const auto = j.endsWith('/>');
    const el = creer(nom, lireAttributs(j.slice(t[0].length, auto ? -2 : -1), decoderXml), haut);
    if (!auto) pile.push(el);
  }
  return document;
}

// ---------- sélecteurs ----------

const cacheSelecteurs = new Map();

function lireIdentifiant(s, p) {
  let r = '';
  for (; p < s.length; p++) {
    const c = s[p];
    if (c === '\\' && p + 1 < s.length) r += s[++p];
    else if (/[\w-]/.test(c) || c > '\u007f') r += c;
    else break;
  }
  return [r, p];
}

function lireChaine(s, p) {
  const q = s[p++];
  let r = '';
  for (; p < s.length && s[p] !== q; p++) r += s[p] === '\\' && p + 1 < s.length ? s[++p] : s[p];
  if (s[p] !== q) throw new ErreurSelecteur(`guillemet non refermé dans « ${s} »`);
  return [r, p + 1];
}

// Contenu d'une parenthèse, en respectant guillemets, crochets et parenthèses internes.
function lireParenthese(s, p) {
  const d = p;
  let niveau = 1;
  for (; p < s.length; p++) {
    const c = s[p];
    if (c === '"' || c === "'") p = lireChaine(s, p)[1] - 1;
    else if (c === '\\') p++;
    else if (c === '(') niveau++;
    else if (c === ')' && --niveau === 0) return [s.slice(d, p), p + 1];
  }
  throw new ErreurSelecteur(`parenthèse non refermée dans « ${s} »`);
}

// « 2n+1 », « odd », « 3 », « -n+4 » → [a, b]
function lireNieme(t) {
  const s = t.replace(/\s+/g, '').toLowerCase();
  if (s === 'odd') return [2, 1];
  if (s === 'even') return [2, 0];
  let m = s.match(/^([+-]?\d+)$/);
  if (m) return [0, Number(m[1])];
  m = s.match(/^([+-]?\d*)n([+-]\d+)?$/);
  if (!m) throw new ErreurSelecteur(`« nth » non compris : « ${t} »`);
  const a = m[1] === '' || m[1] === '+' ? 1 : m[1] === '-' ? -1 : Number(m[1]);
  return [a, Number(m[2] || 0)];
}

const PSEUDOS_SIMPLES = new Set(['first-child', 'last-child', 'only-child', 'first-of-type', 'last-of-type', 'only-of-type', 'empty', 'root', 'scope', 'checked', 'selected', 'disabled', 'enabled', 'link', 'any-link']);
// L'élément depuis lequel on cherche : c'est lui que désigne « :scope ».
let portee = null;
const PSEUDOS_LISTE = new Set(['not', 'has', 'is', 'matches', 'where']);
const PSEUDOS_NIEME = new Set(['nth-child', 'nth-last-child', 'nth-of-type', 'nth-last-of-type']);

// Texte → liste d'alternatives ; une alternative = suite de parties { lien, tests }.
// « lien » relie la partie à celle d'avant : ' ' (descendant), '>', '+', '~' ; null pour la première.
export function analyserSelecteur(texte, relatif = false) {
  const cle = (relatif ? '~' : '') + texte;
  if (cacheSelecteurs.has(cle)) return cacheSelecteurs.get(cle);
  const s = String(texte).trim();
  if (!s) throw new ErreurSelecteur('sélecteur vide');
  const alternatives = [];
  let parties = [];
  let lien = null;
  let p = 0;
  const blancs = () => {
    while (p < s.length && /\s/.test(s[p])) p++;
  };
  while (p < s.length) {
    blancs();
    if ('>+~'.includes(s[p]) && s[p + 1] !== '=') {
      if (lien && lien !== ' ') throw new ErreurSelecteur(`deux liens de suite dans « ${s} »`);
      if (!parties.length && !relatif) throw new ErreurSelecteur(`« ${s} » commence par un lien`);
      lien = s[p++];
      blancs();
    }
    const tests = [];
    let etoile = false;
    for (;;) {
      const c = s[p];
      if (c === undefined || /[\s,>+~]/.test(c)) break;
      if (c === '*') {
        etoile = true;
        p++;
      } else if (c === '#' || c === '.') {
        const [v, q] = lireIdentifiant(s, p + 1);
        if (!v) throw new ErreurSelecteur(`nom attendu après « ${c} » dans « ${s} »`);
        tests.push({ t: c === '#' ? 'id' : 'classe', v });
        p = q;
      } else if (c === '[') {
        p++;
        blancs();
        let nom;
        [nom, p] = lireIdentifiant(s, p);
        if (s[p] === '|' && s[p + 1] !== '=') [nom, p] = lireIdentifiant(s, p + 1); // « ns|attr »
        if (s[p] === ':') {
          // « torznab:attr » écrit sans barre d'échappement
          const [suite, q] = lireIdentifiant(s, p + 1);
          nom += `:${suite}`;
          p = q;
        }
        blancs();
        let op = null;
        let v = '';
        let insensible = false;
        if (s[p] !== ']') {
          const mo = s.slice(p).match(/^([~|^$*!]?=)/);
          if (!mo) throw new ErreurSelecteur(`attribut mal écrit dans « ${s} »`);
          op = mo[1];
          p += op.length;
          blancs();
          if (s[p] === '"' || s[p] === "'") [v, p] = lireChaine(s, p);
          else {
            const d = p;
            while (p < s.length && s[p] !== ']' && !/\s/.test(s[p])) p++;
            v = s.slice(d, p);
          }
          blancs();
          if (/[is]/i.test(s[p] || '') && /^\s*\]/.test(s.slice(p + 1))) insensible = s[p++].toLowerCase() === 'i';
          blancs();
        }
        if (s[p] !== ']') throw new ErreurSelecteur(`« ] » manquant dans « ${s} »`);
        p++;
        tests.push({ t: 'attr', nom: nom.toLowerCase(), op, v: insensible ? v.toLowerCase() : v, insensible });
      } else if (c === ':') {
        if (s[p + 1] === ':') throw new ErreurSelecteur(`pseudo-élément non géré dans « ${s} »`);
        let nom;
        [nom, p] = lireIdentifiant(s, p + 1);
        nom = nom.toLowerCase();
        if (s[p] === '(') {
          let arg;
          [arg, p] = lireParenthese(s, p + 1);
          if (nom === 'contains') {
            const a = arg.trim();
            tests.push({ t: 'contient', v: a[0] === '"' || a[0] === "'" ? lireChaine(a, 0)[0] : a });
          } else if (PSEUDOS_LISTE.has(nom)) {
            tests.push({ t: nom === 'not' ? 'non' : nom === 'has' ? 'a' : 'parmi', liste: analyserSelecteur(arg, nom === 'has') });
          } else if (PSEUDOS_NIEME.has(nom)) {
            const [formule, de] = arg.split(/\s+of\s+/i);
            const [a, b] = lireNieme(formule);
            tests.push({ t: 'nieme', a, b, fin: nom.includes('last'), type: nom.includes('of-type'), de: de ? analyserSelecteur(de) : null });
          } else if (nom === 'eq' || nom === 'lt' || nom === 'gt') {
            throw new ErreurSelecteur(`« :${nom}() » (jQuery) n'est pas géré`);
          } else throw new ErreurSelecteur(`« :${nom}() » n'est pas géré`);
        } else if (PSEUDOS_SIMPLES.has(nom)) tests.push({ t: 'etat', v: nom });
        else throw new ErreurSelecteur(`« :${nom} » n'est pas géré`);
      } else {
        const [v, q] = lireIdentifiant(s, p);
        if (!v) throw new ErreurSelecteur(`caractère inattendu « ${c} » dans « ${s} »`);
        tests.push({ t: 'nom', v: v.toLowerCase() });
        p = q;
      }
    }
    if (!tests.length && !etoile && s[p] !== ',' && p < s.length) throw new ErreurSelecteur(`sélecteur mal écrit : « ${s} »`);
    if (tests.length || etoile || lien) {
      parties.push({ lien: parties.length || relatif ? (lien ?? ' ') : null, tests });
      lien = null;
    }
    const avant = p;
    blancs();
    if (s[p] === ',') {
      if (!parties.length) throw new ErreurSelecteur(`virgule en trop dans « ${s} »`);
      alternatives.push(parties);
      parties = [];
      lien = null;
      p++;
    } else if (p > avant && p < s.length && !'>+~'.includes(s[p])) lien = ' ';
  }
  if (parties.length) alternatives.push(parties);
  if (!alternatives.length) throw new ErreurSelecteur(`sélecteur vide : « ${s} »`);
  // Dans « :has(a) », la première partie est un descendant de l'élément testé.
  if (relatif) for (const alt of alternatives) alt[0].lien ??= ' ';
  if (cacheSelecteurs.size > 5000) cacheSelecteurs.clear();
  cacheSelecteurs.set(cle, alternatives);
  return alternatives;
}

function testAttribut(el, { nom, op, v, insensible }) {
  let a = el.attrs[nom];
  if (a === undefined) return op === '!=';
  if (op === null) return true;
  if (insensible) a = a.toLowerCase();
  switch (op) {
    case '=': return a === v;
    case '!=': return a !== v;
    case '^=': return v !== '' && a.startsWith(v);
    case '$=': return v !== '' && a.endsWith(v);
    case '*=': return v !== '' && a.includes(v);
    case '~=': return v !== '' && a.split(/\s+/).includes(v);
    case '|=': return a === v || a.startsWith(`${v}-`);
    default: return false;
  }
}

function rang(el, test) {
  if (!el.parent) return 1;
  let freres = filsDe(el.parent);
  if (test.type) freres = freres.filter((f) => f.nom === el.nom);
  if (test.de) freres = freres.filter((f) => f === el || correspond(f, test.de));
  const k = freres.indexOf(el);
  return test.fin ? freres.length - k : k + 1;
}

function testSimple(el, test) {
  switch (test.t) {
    case 'nom': return el.nom === test.v;
    case 'id': return el.attrs.id === test.v;
    case 'classe': return el.attrs.class !== undefined && el.attrs.class.split(/\s+/).includes(test.v);
    case 'attr': return testAttribut(el, test);
    case 'contient': return texteDe(el).includes(test.v);
    case 'non': return !correspond(el, test.liste);
    case 'parmi': return correspond(el, test.liste);
    case 'a': return possede(el, test.liste);
    case 'nieme': {
      const n = rang(el, test);
      const { a, b } = test;
      return a === 0 ? n === b : (n - b) / a >= 0 && (n - b) % a === 0;
    }
    case 'etat':
      switch (test.v) {
        case 'first-child': return !el.parent || filsDe(el.parent)[0] === el;
        case 'last-child': return !el.parent || filsDe(el.parent).at(-1) === el;
        case 'only-child': return !el.parent || filsDe(el.parent).length === 1;
        case 'first-of-type': return rang(el, { type: true }) === 1;
        case 'last-of-type': return rang(el, { type: true, fin: true }) === 1;
        case 'only-of-type': return rang(el, { type: true }) === 1 && rang(el, { type: true, fin: true }) === 1;
        case 'empty': return !el.enfants.length;
        case 'root': return el.parent?.nom === '#document';
        case 'scope': return portee ? el === portee : el.parent?.nom === '#document';
        case 'checked': return 'checked' in el.attrs || 'selected' in el.attrs;
        case 'selected': return 'selected' in el.attrs;
        case 'disabled': return 'disabled' in el.attrs;
        case 'enabled': return !('disabled' in el.attrs);
        default: return el.nom === 'a' && 'href' in el.attrs;
      }
    default: return false;
  }
}

// « el » correspond-il à la partie k de l'alternative, et ce qui précède à ses ancêtres / frères ?
// « ancre » : l'élément testé par un :has() (la première partie se situe par rapport à lui).
function correspondPartie(el, alt, k, ancre) {
  const partie = alt[k];
  for (const t of partie.tests) if (!testSimple(el, t)) return false;
  const lien = partie.lien;
  if (k === 0) {
    if (!ancre) return true;
    if (lien === '>') return el.parent === ancre;
    if (lien === '+') return frerePrecedent(el) === ancre;
    if (lien === '~') return el.parent === ancre.parent && filsDe(el.parent).indexOf(ancre) < filsDe(el.parent).indexOf(el);
    for (let a = el.parent; a; a = a.parent) if (a === ancre) return true;
    return false;
  }
  if (lien === '>') return !!el.parent && el.parent.nom !== '#document' && correspondPartie(el.parent, alt, k - 1, ancre);
  if (lien === '+') {
    const f = frerePrecedent(el);
    return !!f && correspondPartie(f, alt, k - 1, ancre);
  }
  if (lien === '~') {
    if (!el.parent) return false;
    for (const f of filsDe(el.parent)) {
      if (f === el) break;
      if (correspondPartie(f, alt, k - 1, ancre)) return true;
    }
    return false;
  }
  for (let a = el.parent; a && a.nom !== '#document'; a = a.parent) if (correspondPartie(a, alt, k - 1, ancre)) return true;
  return false;
}

function correspond(el, alternatives, ancre = null) {
  for (const alt of alternatives) if (correspondPartie(el, alt, alt.length - 1, ancre)) return true;
  return false;
}

function* descendants(el) {
  for (const e of filsDe(el)) {
    yield e;
    yield* descendants(e);
  }
}

// :has(...) : un élément placé comme le dit la liste (descendant, enfant, frère suivant…).
function possede(el, alternatives) {
  const freres = alternatives.some((alt) => alt[0].lien === '+' || alt[0].lien === '~');
  if (freres && el.parent) {
    const f = filsDe(el.parent);
    for (const candidat of f.slice(f.indexOf(el) + 1)) {
      if (correspond(candidat, alternatives, el)) return true;
      for (const d of descendants(candidat)) if (correspond(d, alternatives, el)) return true;
    }
  }
  for (const d of descendants(el)) if (correspond(d, alternatives, el)) return true;
  return false;
}

function depuis(el, fn) {
  const avant = portee;
  portee = el.nom === '#document' ? null : el;
  try {
    return fn();
  } finally {
    portee = avant;
  }
}

// L'élément lui-même correspond-il ?
export const correspondA = (el, selecteur) => el.nom !== '#document' && depuis(el, () => correspond(el, analyserSelecteur(selecteur)));

// Tous les descendants de « el » qui correspondent, dans l'ordre de la page.
export function chercherTous(el, selecteur) {
  const alternatives = analyserSelecteur(selecteur);
  return depuis(el, () => {
    const trouves = [];
    for (const d of descendants(el)) if (correspond(d, alternatives)) trouves.push(d);
    return trouves;
  });
}

export function chercher(el, selecteur) {
  const alternatives = analyserSelecteur(selecteur);
  return depuis(el, () => {
    for (const d of descendants(el)) if (correspond(d, alternatives)) return d;
    return null;
  });
}
