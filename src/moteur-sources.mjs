// Moteur d'une source de recherche décrite dans le format du catalogue de Prowlarr (« Cardigann ») :
// à partir de la description (YAML déjà lu) et des réglages de l'utilisateur, il fabrique les requêtes,
// se connecte si besoin, lit les réponses (HTML, XML ou JSON) et rend des versions à télécharger.
// Le comportement suit celui de Prowlarr, pour que les descriptions du catalogue marchent telles quelles.
import { lireArbreHtml, lireArbreXml, chercher, chercherTous, correspondA, texteDe, attributDe, retirer, deplacerEnfants, racineDe, analyserSelecteur } from './arbre.mjs';
import { decoderEntites, NAVIGATEUR } from './recherche.mjs';
import { normaliser } from './titres.mjs';

export class ErreurSource extends Error {}

const vide = (v) => v === null || v === undefined || String(v).trim() === '';
const vrai = (v) => v === true || v === 'true' || v === 'True';
const liste = (v) => (Array.isArray(v) ? v : v === null || v === undefined ? [] : [v]);

// ---------- expressions régulières écrites pour .NET ----------

const cacheRegExp = new Map();
const BLOCS_UNICODE = {
  BasicLatin: '\\u0000-\\u007F', Cyrillic: '\\u0400-\\u04FF', Greek: '\\u0370-\\u03FF', Hebrew: '\\u0590-\\u05FF', Arabic: '\\u0600-\\u06FF',
  Thai: '\\u0E00-\\u0E7F', Hiragana: '\\u3040-\\u309F', Katakana: '\\u30A0-\\u30FF', CJKUnifiedIdeographs: '\\u4E00-\\u9FFF', HangulSyllables: '\\uAC00-\\uD7AF',
};

export function versRegExp(motif) {
  let r = cacheRegExp.get(motif);
  if (r) return r;
  let drapeaux = 'g';
  let etendu = false;
  const noter = (d) => {
    for (const c of d) {
      if ('ims'.includes(c) && !drapeaux.includes(c)) drapeaux += c;
      if (c === 'x') etendu = true;
    }
  };
  let src = String(motif)
    // (?i), (?s)… : pour tout le motif ; (?i:…) : simple groupe.
    .replace(/\(\?([imsxn]+)(?:-[imsxn]+)?\)/g, (m, d) => (noter(d), ''))
    .replace(/\(\?([imsxn]+)(?:-[imsxn]+)?:/g, (m, d) => (noter(d), '(?:'))
    .replace(/\(\?>/g, '(?:')
    .replace(/\(\?'(\w+)'/g, '(?<$1>')
    .replace(/\\([\s\S])/g, (m, c) => (c === 'A' ? '^' : c === 'z' || c === 'Z' ? '$' : c === 'h' ? '[ \\t]' : m));
  // Blocs Unicode à la façon de .NET (« \p{IsCyrillic} ») : remplacés par leur plage de caractères.
  if (/\\p\{Is\w+\}/.test(src)) {
    let dansClasse = false;
    src = src.replace(/\\p\{Is(\w+)\}|\\[\s\S]|\[|\]/g, (m, bloc) => {
      if (m === '[') dansClasse = true;
      else if (m === ']') dansClasse = false;
      if (!bloc) return m;
      const plage = BLOCS_UNICODE[bloc];
      if (!plage) throw new ErreurSource(`Expression non comprise « ${motif} » (bloc ${bloc} inconnu).`);
      return dansClasse ? plage : `[${plage}]`;
    });
  }
  if (etendu) src = src.replace(/\\[\s\S]|\[(?:\\[\s\S]|[^\]])*\]|\s+|#.*$/gm, (m) => (/^\s|^#/.test(m) ? '' : m));
  try {
    r = new RegExp(src, /\\[pP]\{/.test(src) ? `${drapeaux}u` : drapeaux);
  } catch (e) {
    throw new ErreurSource(`Expression non comprise « ${motif} » (${e.message}).`);
  }
  if (cacheRegExp.size > 5000) cacheRegExp.clear();
  cacheRegExp.set(motif, r);
  return r;
}

// « ${1} », « ${nom} », « $0 » (.NET) → « $1 », « $<nom> », « $& » (JavaScript).
const versRemplacement = (t) =>
  String(t ?? '')
    .replace(/\$\{(\w+)\}/g, (m, n) => (/^\d+$/.test(n) ? `$${n}` : `$<${n}>`))
    .replace(/\$0(?!\d)/g, '$$&');

// ---------- nombres, tailles, dates ----------

// « 1,234 » → 1234 ; « 12 » → 12 ; « 1.5 » → 1.5
function nombre(texte) {
  let s = String(texte ?? '').replace(/[^\d.,-]/g, '');
  if (/^-?\d{1,3}([.,]\d{3})+$/.test(s)) s = s.replace(/[.,]/g, '');
  s = s.replace(/,/g, '.');
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

// « 1.4 GB », « 700 MiB », « 1,234.5 MB », « 123456 » (octets)
export function lireTaille(texte) {
  const t = String(texte ?? '');
  let val = t.replace(/[^\d.,]/g, '').replace(/,/g, '.') || '0';
  const dernier = val.lastIndexOf('.');
  if (val.indexOf('.') !== dernier) val = val.slice(0, dernier).replace(/\./g, '') + val.slice(dernier);
  const unite = t.replace(/[^\p{L}]/gu, '').replace(/i/g, '').toLowerCase();
  const n = parseFloat(val) || 0;
  const mult = unite.includes('kb') ? 1024 : unite.includes('mb') ? 1024 ** 2 : unite.includes('gb') ? 1024 ** 3 : unite.includes('tb') ? 1024 ** 4 : 1;
  return Math.round(n * mult);
}

const MOIS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const MOIS_AUTRES = { janvier: 1, fevrier: 2, mars: 3, avril: 4, mai: 5, juin: 6, juillet: 7, aout: 8, septembre: 9, octobre: 10, novembre: 11, decembre: 12, sept: 9 };
const sansAccent = (t) => t.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
function numeroMois(nom) {
  const n = sansAccent(nom).replace(/\.$/, '');
  if (MOIS_AUTRES[n]) return MOIS_AUTRES[n];
  const k = MOIS.findIndex((m) => n.length >= 3 && m.startsWith(n));
  return k < 0 ? null : k + 1;
}

// Lit une date écrite selon un format .NET (« dd/MM/yyyy HH:mm », « ddd, dd MMM yyyy HH:mm:ss zzz »…).
// Sans fuseau dans le format, l'heure est prise comme universelle. Rend un nombre de millisecondes, ou null.
export function lireDateFormat(texte, format) {
  let re = '';
  const champs = [];
  const f = String(format);
  for (let p = 0; p < f.length; ) {
    const c = f[p];
    if (c === "'" || c === '"') {
      const fin = f.indexOf(c, p + 1);
      re += f.slice(p + 1, fin < 0 ? f.length : fin).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      p = fin < 0 ? f.length : fin + 1;
      continue;
    }
    if (c === '\\' && p + 1 < f.length) {
      re += f[p + 1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      p += 2;
      continue;
    }
    if ('yMdHhmsfFtzK'.includes(c)) {
      let n = 1;
      while (f[p + n] === c) n++;
      p += n;
      const ajouter = (motif, champ) => {
        re += `(${motif})`;
        champs.push(champ);
      };
      if (c === 'y') ajouter(n >= 3 ? '\\d{4}' : '\\d{2}', n >= 3 ? 'annee' : 'annee2');
      else if (c === 'M') ajouter(n >= 3 ? '[\\p{L}.]+' : n === 2 ? '\\d{2}' : '\\d{1,2}', n >= 3 ? 'nomMois' : 'mois');
      else if (c === 'd') ajouter(n >= 3 ? '[\\p{L}.]+' : n === 2 ? '\\d{2}' : '\\d{1,2}', n >= 3 ? null : 'jour');
      else if (c === 'H' || c === 'h') ajouter(n === 2 ? '\\d{2}' : '\\d{1,2}', 'heure');
      else if (c === 'm') ajouter(n === 2 ? '\\d{2}' : '\\d{1,2}', 'minute');
      else if (c === 's') ajouter(n === 2 ? '\\d{2}' : '\\d{1,2}', 'seconde');
      else if (c === 'f' || c === 'F') ajouter(c === 'f' ? `\\d{${n}}` : `\\d{0,${n}}`, 'fraction');
      else if (c === 't') ajouter(n === 2 ? '[AP]\\.?M\\.?' : '[AP]', 'midi');
      else if (c === 'K') ajouter('Z|[+-]\\d{2}:?\\d{2}|', 'fuseau');
      else ajouter(n >= 3 ? 'Z|[+-]\\d{2}:?\\d{2}' : '[+-]\\d{1,2}', 'fuseau');
      continue;
    }
    re += /\s/.test(c) ? '\\s+' : c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    p++;
    if (/\s/.test(c)) while (/\s/.test(f[p] || '')) p++;
  }
  const m = String(texte ?? '').trim().match(new RegExp(`^${re}$`, 'iu'));
  if (!m) return null;
  const v = { annee: new Date().getUTCFullYear(), mois: 1, jour: 1, heure: 0, minute: 0, seconde: 0, fraction: 0, decalage: 0 };
  let apresMidi = null;
  champs.forEach((champ, k) => {
    const t = m[k + 1];
    if (!champ || t === undefined) return;
    if (champ === 'annee2') v.annee = Number(t) + (Number(t) < 50 ? 2000 : 1900);
    else if (champ === 'nomMois') v.mois = numeroMois(t) ?? NaN;
    else if (champ === 'fraction') v.fraction = t ? Number(`0.${t}`) * 1000 : 0;
    else if (champ === 'midi') apresMidi = /^p/i.test(t);
    else if (champ === 'fuseau') {
      const z = t.match(/^([+-])(\d{1,2}):?(\d{2})?$/);
      if (z) v.decalage = (z[1] === '-' ? -1 : 1) * (Number(z[2]) * 60 + Number(z[3] || 0));
    } else v[champ] = Number(t);
  });
  if (apresMidi !== null) v.heure = (v.heure % 12) + (apresMidi ? 12 : 0);
  // Un « mois 19 » veut dire que ce n'est pas ce format (jour et mois inversés, par exemple).
  if (!(v.mois >= 1 && v.mois <= 12 && v.jour >= 1 && v.jour <= 31 && v.heure <= 23 && v.minute <= 59 && v.seconde <= 60)) return null;
  const ms = Date.UTC(v.annee, v.mois - 1, v.jour, v.heure, v.minute, v.seconde, v.fraction) - v.decalage * 60_000;
  return Number.isFinite(ms) ? ms : null;
}

const UNITES = [
  [/^(s|sec|secs|second|seconds|seconde|secondes)$/, 1000],
  [/^(m|min|mins|minute|minutes)$/, 60_000],
  [/^(h|hr|hrs|hour|hours|heure|heures)$/, 3600_000],
  [/^(d|day|days|jour|jours|j)$/, 86400_000],
  [/^(w|wk|wks|week|weeks|semaine|semaines)$/, 7 * 86400_000],
  [/^(mo|mon|mos|month|months|mois)$/, 30 * 86400_000],
  [/^(y|yr|yrs|year|years|an|ans|annee|annees)$/, 365 * 86400_000],
];

// « 2 hours ago », « 1 day, 3 hrs », « il y a 3 jours », « an hour ago » → millisecondes, ou null.
export function lireDepuis(texte, maintenant = Date.now()) {
  const t = sansAccent(String(texte ?? '')).replace(/\b(ago|il y a|about|over|almost|and|et|environ)\b/g, ' ').replace(/,/g, ' ');
  if (/\b(now|just now|maintenant|a l'instant)\b/.test(t)) return maintenant;
  let total = 0;
  let trouve = false;
  for (const m of t.matchAll(/(\d+(?:\.\d+)?|\ban?\b|\bune?\b)\s*([a-z]+)/g)) {
    const u = UNITES.find(([re]) => re.test(m[2]));
    if (!u) continue;
    total += (/^\d/.test(m[1]) ? Number(m[1]) : 1) * u[1];
    trouve = true;
  }
  return trouve ? maintenant - total : null;
}

// Date de forme inconnue : horodatage, « today 14:05 », « yesterday », durée écoulée, formats courants.
export function lireDate(valeur, maintenant = Date.now()) {
  const t = String(valeur ?? '').trim();
  if (!t) return null;
  if (/^\d{9,10}$/.test(t)) return Number(t) * 1000;
  if (/^\d{13}$/.test(t)) return Number(t);
  const bas = sansAccent(t);
  if (bas === 'now') return maintenant;
  const jour = bas.match(/^(today|yesterday|aujourd'hui|hier)\b[\s,at]*(?:(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([ap]m)?)?/);
  if (jour) {
    const d = new Date(maintenant - (/^(yesterday|hier)/.test(jour[1]) ? 86400_000 : 0));
    let h = Number(jour[2] ?? 0);
    if (jour[5]) h = (h % 12) + (jour[5] === 'pm' ? 12 : 0);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), h, Number(jour[3] ?? 0), Number(jour[4] ?? 0));
  }
  if (/\bago\b|^il y a\b/.test(bas) || /^\d+(\.\d+)?\s*[a-z]+(\s+\d+\s*[a-z]+)*$/.test(bas)) {
    const d = lireDepuis(t, maintenant);
    if (d !== null) return d;
  }
  // Une date à barres sans format annoncé est à l'américaine (mois d'abord), comme pour Prowlarr ;
  // les sites qui écrivent le jour d'abord le disent dans leur description.
  for (const format of ['yyyy-MM-dd HH:mm:ss', 'yyyy-MM-dd HH:mm', 'yyyy-MM-dd', 'M/d/yyyy H:mm:ss', 'M/d/yyyy H:mm', 'M/d/yyyy', 'd/M/yyyy H:mm:ss', 'd/M/yyyy H:mm', 'd/M/yyyy', 'dd-MM-yyyy HH:mm:ss', 'dd-MM-yyyy', 'dd.MM.yyyy HH:mm:ss', 'dd.MM.yyyy', 'd MMM yyyy', 'MMM d, yyyy']) {
    const d = lireDateFormat(t, format);
    if (d !== null) return d;
  }
  const d = Date.parse(/[zZ]$|[+-]\d{2}:?\d{2}$|GMT|UTC/.test(t) ? t : `${t} UTC`);
  if (Number.isFinite(d)) return d;
  const d2 = Date.parse(t);
  return Number.isFinite(d2) ? d2 : null;
}

const JOURS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
// Forme sous laquelle une date circule entre les filtres (« Tue, 31 Mar 2026 19:06:13 +0000 »).
const ecrireDate = (ms) => {
  const d = new Date(ms);
  const deux = (n) => String(n).padStart(2, '0');
  return `${JOURS[d.getUTCDay()]}, ${deux(d.getUTCDate())} ${MOIS[d.getUTCMonth()].slice(0, 3).replace(/^./, (c) => c.toUpperCase())} ${d.getUTCFullYear()} ${deux(d.getUTCHours())}:${deux(d.getUTCMinutes())}:${deux(d.getUTCSeconds())} +0000`;
};

// ---------- modèles « {{ … }} » ----------

const RE_LOGIQUE = /\b(and|or|eq|ne)((?:\s+(?:\(?\.[^)\s]+\)?|"[^"]+")){2,})/;
const RE_PARAMETRE = /\(?\.[^)\s]+\)?|"[^"]+"/g;

const texteDeVariable = (v) => (Array.isArray(v) ? v.join(',') : v === null || v === undefined ? '' : String(v));
const remplacerTout = (t, quoi, par) => t.split(quoi).join(par);

// Suit pas à pas ce que fait Prowlarr : re_replace, join, fonctions logiques, if/else, range, variables.
// « modifier » : transformation appliquée aux valeurs insérées (encodage pour une adresse).
export function appliquerModele(modele, variables, modifier = null) {
  if (modele === null || modele === undefined) return modele;
  let t = String(modele);
  if (!t.includes('{{')) return t;
  const mod = (v) => (modifier ? modifier(v) : v);
  const lire = (nom) => variables[nom] ?? null;

  for (const m of [...t.matchAll(/{{\s*re_replace\s+(\..+?)\s+"(.*?)"\s+"(.*?)"\s*}}/g)]) {
    t = remplacerTout(t, m[0], mod(texteDeVariable(lire(m[1])).replace(versRegExp(m[2]), versRemplacement(m[3]))));
  }
  for (const m of [...t.matchAll(/{{\s*join\s+(\..+?)\s+"(.*?)"\s*}}/g)]) {
    t = remplacerTout(t, m[0], mod(liste(lire(m[1])).join(m[2])));
  }
  for (let tours = 0, m; tours < 100 && (m = RE_LOGIQUE.exec(t)); tours++) {
    const fonction = m[1];
    const trouves = [...m[2].matchAll(RE_PARAMETRE)];
    let parametres = trouves.map((p) => p[0].replace(/^[()]+|[()]+$/g, ''));
    let longueur = m[0].length;
    let resultat = '';
    if (fonction === 'and' || fonction === 'or') {
      parametres = parametres.filter((p) => !p.startsWith('"'));
      for (const p of parametres) {
        resultat = p;
        const v = lire(p);
        if ((typeof v !== 'string' || !v.trim()) === (fonction === 'and')) break;
      }
    } else {
      // eq / ne : deux paramètres ; ce qui suit reste dans le modèle.
      if (trouves.length > 2) longueur = m[1].length + trouves[2].index;
      const [a, b] = parametres.slice(0, 2).map((p) => (p.startsWith('"') ? p.replace(/^"|"$/g, '') : lire(p)));
      const egal = (typeof a === 'string' || a === null) && (typeof b === 'string' || b === null) && a === b;
      resultat = egal === (fonction === 'eq') ? '.True' : '.False';
    }
    t = t.slice(0, m.index) + resultat + t.slice(m.index + longueur);
  }
  for (const m of [...t.matchAll(/{{\s*if\s*(.+?)\s*}}(.*?){{\s*else\s*}}(.*?){{\s*end\s*}}/g)]) {
    if (!m[1].startsWith('.')) throw new ErreurSource(`Condition non gérée dans la description : « ${m[1]} ».`);
    const v = lire(m[1]);
    const oui = Array.isArray(v) ? v.length > 0 : typeof v === 'string' ? v.trim() !== '' : v !== null && v !== false;
    t = remplacerTout(t, m[0], oui ? m[2] : m[3]);
  }
  for (const m of [...t.matchAll(/{{\s*range\s*(((?<index>\$.+?),)((\s*(?<element>.+?)\s*(:=)\s*)))?(?<variable>.+?)\s*}}(?<prefix>.*?){{\.}}(?<postfix>.*?){{end}}/g)]) {
    const { index, variable, prefix, postfix } = m.groups;
    const balise = `{{${index}}}`;
    const morceaux = liste(lire(variable)).map((v, k) => (index ? remplacerTout(prefix, balise, String(k)) + mod(String(v)) + remplacerTout(postfix, balise, String(k)) : prefix + mod(String(v)) + postfix));
    t = remplacerTout(t, m[0], morceaux.join(''));
  }
  for (const m of [...t.matchAll(/{{\s*(\..+?)\s*}}/g)]) {
    t = remplacerTout(t, m[0], mod(texteDeVariable(lire(m[1]))));
  }
  return t;
}

// ---------- filtres ----------

const SEPARATEURS_VALIDE = /[, /)(.;[\]"|:]+/;

export function appliquerFiltres(donnee, filtres, variables = {}, maintenant = Date.now()) {
  let d = donnee;
  for (const f of liste(filtres)) {
    const a = f.args;
    const a0 = Array.isArray(a) ? a[0] : a;
    const a1 = Array.isArray(a) ? a[1] : undefined;
    if (d === null || d === undefined) d = '';
    switch (f.name) {
      case 'querystring': {
        const q = d.includes('?') ? d.slice(d.indexOf('?') + 1) : d;
        d = new URLSearchParams(q.split('#')[0]).get(a0) ?? '';
        break;
      }
      case 'timeparse':
      case 'dateparse': {
        const ms = lireDateFormat(d, a0);
        if (ms !== null) d = ecrireDate(ms);
        break;
      }
      case 'regexp': {
        const r = versRegExp(a0);
        r.lastIndex = 0;
        d = r.exec(d)?.[1] ?? '';
        break;
      }
      case 're_replace':
        d = d.replace(versRegExp(a0), versRemplacement(appliquerModele(a1 ?? '', variables)));
        break;
      case 'split': {
        const parts = d.split(String(a0)[0]);
        let pos = parseInt(a1, 10);
        if (pos < 0) pos += parts.length;
        if (!(pos in parts)) throw new ErreurSource('filtre « split » : morceau absent');
        d = parts[pos];
        break;
      }
      case 'replace':
        d = remplacerTout(d, String(a0), appliquerModele(String(a1 ?? ''), variables));
        break;
      case 'trim':
        if (vide(a0)) d = d.trim();
        else {
          const c = String(a0)[0];
          while (d.startsWith(c)) d = d.slice(1);
          while (d.endsWith(c)) d = d.slice(0, -1);
        }
        break;
      case 'prepend':
        d = appliquerModele(String(a0 ?? ''), variables) + d;
        break;
      case 'append':
        d += appliquerModele(String(a0 ?? ''), variables);
        break;
      case 'tolower':
        d = d.toLowerCase();
        break;
      case 'toupper':
        d = d.toUpperCase();
        break;
      case 'base64decode':
        d = Buffer.from(d, 'base64url').toString('utf8');
        break;
      case 'base64encode':
        d = Buffer.from(d, 'utf8').toString('base64url');
        break;
      case 'urldecode':
        try {
          d = decodeURIComponent(d.replace(/\+/g, ' '));
        } catch {}
        break;
      case 'urlencode':
        d = encoder(d);
        break;
      case 'htmldecode':
        d = decoderEntites(d);
        break;
      case 'htmlencode':
        d = d.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
        break;
      case 'timeago':
      case 'reltime': {
        const ms = lireDepuis(d, maintenant);
        if (ms === null) throw new ErreurSource(`durée non comprise : « ${d} »`);
        d = ecrireDate(ms);
        break;
      }
      case 'fuzzytime': {
        const ms = lireDate(d, maintenant);
        if (ms === null) throw new ErreurSource(`date non comprise : « ${d} »`);
        d = ecrireDate(ms);
        break;
      }
      case 'validfilename':
        d = d.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_');
        break;
      case 'diacritics':
        if (a0 !== 'replace') throw new ErreurSource('filtre « diacritics » : option inconnue');
        d = d.normalize('NFD').replace(/\p{Mn}/gu, '').normalize('NFC');
        break;
      case 'jsonjoinarray': {
        const v = jetonJson(JSON.parse(d), String(a0));
        d = liste(v).map((x) => texteJson(x) ?? '').join(String(a1 ?? ''));
        break;
      }
      case 'validate': {
        const permis = new Set(String(a0).toLowerCase().split(SEPARATEURS_VALIDE).filter(Boolean));
        d = d.toLowerCase().split(SEPARATEURS_VALIDE).filter((x) => x && permis.has(x)).join(', ');
        break;
      }
      case 'hexdump':
      case 'strdump':
        break;
      default:
        throw new ErreurSource(`Filtre inconnu dans la description : « ${f.name} ».`);
    }
  }
  return d;
}

export const FILTRES_CONNUS = new Set(
  'querystring timeparse dateparse regexp re_replace split replace trim prepend append tolower toupper base64decode base64encode urldecode urlencode htmldecode htmlencode timeago reltime fuzzytime validfilename diacritics jsonjoinarray validate hexdump strdump'.split(' '),
);

// Comme WebUtility.UrlEncode : espace → « + ».
const encoder = (v) => encodeURIComponent(String(v ?? '')).replace(/%20/g, '+').replace(/[~']/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
const chaineRequete = (paires, separateur = '&') => paires.map(([k, v]) => `${k}=${encoder(v)}`).join(separateur);

// ---------- JSON ----------

// « data.torrents », « $ », « a.b[0].c », « ..titre » (les points de tête sont retirés par l'appelant).
function jetonJson(objet, chemin) {
  let v = objet;
  const c = String(chemin ?? '').trim().replace(/^\$\.?/, '');
  if (!c) return v;
  for (const part of c.split('.')) {
    if (v === null || v === undefined) return undefined;
    const m = part.match(/^([^[]*)((?:\[\d+\])*)$/);
    if (!m) return undefined;
    if (m[1]) v = typeof v === 'object' ? v[m[1]] : undefined;
    for (const k of m[2].matchAll(/\[(\d+)\]/g)) v = v?.[Number(k[1])];
  }
  return v;
}

// Une valeur JSON en texte, comme la donne la bibliothèque de Prowlarr : true → « True », et une date
// ISO (« 2026-03-31T20:06:13Z ») → « 03/31/2026 20:06:13 » (les descriptions comptent dessus).
const RE_DATE_ISO = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(\.\d+)?(Z|[+-]\d{2}:\d{2})?$/;
function texteJson(v) {
  if (v === null || v === undefined) return null;
  if (Array.isArray(v)) return v.map((x) => (x !== null && typeof x === 'object' ? JSON.stringify(x) : (texteJson(x) ?? ''))).join(',');
  if (typeof v === 'object') return null;
  if (typeof v === 'boolean') return v ? 'True' : 'False';
  if (typeof v === 'string' && v.length >= 19 && v.length <= 40) {
    const m = v.match(RE_DATE_ISO);
    if (m) {
      const ms = m[8] ? Date.parse(v) : Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
      if (Number.isFinite(ms)) {
        const d = new Date(ms);
        const deux = (n) => String(n).padStart(2, '0');
        return `${deux(d.getUTCMonth() + 1)}/${deux(d.getUTCDate())}/${d.getUTCFullYear()} ${deux(d.getUTCHours())}:${deux(d.getUTCMinutes())}:${deux(d.getUTCSeconds())}`;
      }
    }
  }
  return String(v);
}

const RE_FILTRE_JSON = /:(?<filtre>.+?)\((?<cle>.+?)\)(?=:|$)/g;

// « chemin:has(cle):not(autre:contains(x)) » : rend le chemin si l'objet passe les conditions, sinon null.
function selecteurJson(objet, selecteur) {
  const chemin = selecteur.split(':')[0];
  let cible = objet;
  if (chemin.trim()) {
    cible = jetonJson(objet, chemin);
    if (cible === undefined || cible === null) return null;
  }
  for (const m of selecteur.matchAll(RE_FILTRE_JSON)) {
    const { filtre, cle } = m.groups;
    const imbrique = /:.+?\(.+?\)(?=:|$)/.test(cle);
    const present = () => (imbrique ? selecteurJson(cible, cle) !== null : jetonJson(cible, cle) !== undefined);
    if (filtre === 'has' && !present()) return null;
    else if (filtre === 'not' && present()) return null;
    else if (filtre === 'contains' && !(typeof cible === 'object' ? JSON.stringify(cible, null, 2) : String(cible)).includes(cle)) return null;
  }
  return chemin;
}

// ---------- description ----------

const CATEGORIES_VIDEO = /^(Movies|TV)\b/;

// Réglages demandés à l'utilisateur par une description, prêts pour un formulaire.
export function reglagesDe(description) {
  return liste(description.settings)
    .filter((r) => r && r.name)
    .map((r) => {
      const type = r.type || 'text';
      const base = { nom: r.name, libelle: sansBalises(r.label || r.name) };
      if (type === 'text') return { ...base, type: 'texte', defaut: r.default ?? '' };
      if (type === 'password') return { ...base, type: 'secret', defaut: '' };
      if (type === 'checkbox') return { ...base, type: 'case', defaut: vrai(r.default) };
      if (type === 'select') {
        const options = Object.entries(r.options || {}).map(([valeur, libelle]) => ({ valeur, libelle: String(libelle ?? valeur) }));
        return { ...base, type: 'choix', options, defaut: options.some((o) => o.valeur === r.default) ? r.default : (options[0]?.valeur ?? '') };
      }
      return { ...base, type: 'info', texte: sansBalises(r.default || ''), genre: type };
    });
}
const sansBalises = (t) => decoderEntites(String(t ?? '').replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();

// Ce qu'on affiche d'une source dans le catalogue.
export function resumerDescription(d) {
  const cats = [...liste(d.caps?.categorymappings).map((c) => c?.cat), ...Object.values(d.caps?.categories || {})].filter(Boolean);
  const reglages = reglagesDe(d);
  return {
    id: d.id,
    nom: d.name || d.id,
    description: d.description || '',
    langue: d.language || '',
    acces: d.type === 'public' ? 'libre' : d.type === 'semi-private' ? 'inscription' : 'prive',
    lien: liste(d.links)[0] || '',
    films: cats.some((c) => /^Movies\b/.test(c)),
    series: cats.some((c) => /^TV\b/.test(c)),
    connexion: d.login?.method || '',
    antiRobot: reglages.some((r) => r.genre === 'info_flaresolverr'),
  };
}

// Vérifie, sans rien demander au site, que le moteur sait tout lire de la description.
// Rend la liste des empêchements (vide = source utilisable).
export function verifierDescription(d) {
  const soucis = [];
  const noter = (quoi) => {
    if (!soucis.includes(quoi)) soucis.push(quoi);
  };
  const essayer = (quoi, fn) => {
    try {
      fn();
    } catch (e) {
      noter(`${quoi} : ${e.message}`);
    }
  };
  if (!d || typeof d !== 'object' || !d.id || !d.search) return ['description incomplète'];
  if (!liste(d.links).length) noter('aucune adresse de site');
  const login = d.login;
  if (login) {
    if (login.method && !['post', 'form', 'cookie', 'get', 'oneurl'].includes(login.method)) noter(`connexion « ${login.method} » non gérée`);
    if (login.captcha) noter('connexion avec image à recopier (captcha)');
  }
  for (const r of liste(d.settings)) {
    if (!['text', 'password', 'checkbox', 'select', undefined, null].includes(r?.type) && !String(r?.type).startsWith('info') && r?.type !== 'cardigannCaptcha') noter(`réglage de type « ${r.type} » non géré`);
  }
  // Variables factices : toutes les branches des modèles doivent donner des sélecteurs lisibles.
  const variables = new Proxy({}, { get: (o, k) => (k === '.Categories' || k === '.Query.Categories' ? ['1'] : 'x') });
  const variablesVides = new Proxy({}, { get: (o, k) => (k === '.Categories' || k === '.Query.Categories' ? [] : k === '.True' ? 'True' : null) });
  const modele = (quoi, t) => {
    if (t === null || t === undefined) return [];
    const sorties = [];
    for (const v of [variables, variablesVides]) essayer(quoi, () => sorties.push(appliquerModele(String(t), v)));
    return sorties;
  };
  const filtres = (quoi, fs) => {
    for (const f of liste(fs)) {
      if (!f || !FILTRES_CONNUS.has(f.name)) noter(`${quoi} : filtre « ${f?.name} » inconnu`);
      else if (f.name === 'regexp' || f.name === 're_replace') essayer(quoi, () => versRegExp(Array.isArray(f.args) ? f.args[0] : f.args));
    }
  };
  const selecteurCss = (quoi, t) => {
    for (const s of modele(quoi, t)) if (s && s.trim()) essayer(quoi, () => analyserSelecteur(s.trim()));
  };
  const bloc = (quoi, b, json) => {
    if (!b || typeof b !== 'object') return;
    modele(quoi, b.text);
    modele(quoi, b.default);
    if (!json) {
      selecteurCss(quoi, b.selector);
      if (b.remove) selecteurCss(quoi, b.remove);
      for (const [cle, v] of Object.entries(b.case || {})) {
        if (cle !== '*') selecteurCss(quoi, cle);
        modele(quoi, v);
      }
    } else modele(quoi, b.selector);
    filtres(quoi, b.filters);
  };
  const s = d.search;
  const chemins = liste(s.paths).length ? liste(s.paths) : s.path ? [{ path: s.path }] : [];
  if (!chemins.length) noter('aucune adresse de recherche');
  const typesReponse = new Set(chemins.map((c) => c?.response?.type || 'html'));
  for (const t of typesReponse) if (!['html', 'xml', 'json'].includes(t)) noter(`réponse de type « ${t} » non gérée`);
  const json = typesReponse.has('json');
  if (json && typesReponse.size > 1) noter('réponses de types mélangés');
  for (const c of chemins) {
    modele('adresse de recherche', c?.path);
    for (const v of Object.values(c?.inputs || {})) modele('paramètre de recherche', v);
  }
  for (const v of Object.values(s.inputs || {})) modele('paramètre de recherche', v);
  for (const v of Object.values(s.headers || {})) modele('en-tête', liste(v)[0]);
  filtres('mots-clés', s.keywordsfilters);
  filtres('prétraitement', s.preprocessingfilters);
  if (!s.rows?.selector) noter('lignes de résultats non décrites');
  else if (json) modele('lignes', s.rows.selector);
  else selecteurCss('lignes', s.rows.selector);
  for (const f of liste(s.rows?.filters)) if (!['andmatch', 'strdump'].includes(f?.name)) noter(`lignes : filtre « ${f?.name} » inconnu`);
  if (s.rows?.count) bloc('nombre de lignes', s.rows.count, json);
  if (s.rows?.dateheaders) bloc('date des lignes', s.rows.dateheaders, false);
  const champs = Object.keys(s.fields || {}).map((k) => k.split('|')[0]);
  if (!champs.includes('title')) noter('champ « title » absent');
  if (!champs.some((c) => ['download', 'magnet', 'infohash'].includes(c))) noter('aucun champ de téléchargement');
  for (const [nom, b] of Object.entries(s.fields || {})) bloc(`champ « ${nom} »`, b, json);
  for (const e of liste(s.error)) selecteurCss('erreur de recherche', e?.selector);
  if (login) {
    modele('connexion', login.path);
    modele('connexion', login.submitpath);
    for (const [k, v] of Object.entries(login.inputs || {})) {
      modele('connexion', v);
      if (vrai(login.selectors)) selecteurCss('connexion', k);
    }
    if (login.form) selecteurCss('connexion', login.form);
    for (const b of Object.values(login.selectorinputs || {})) bloc('connexion', b, false);
    for (const b of Object.values(login.getselectorinputs || {})) bloc('connexion', b, false);
    for (const e of liste(login.error)) {
      selecteurCss('erreur de connexion', e?.selector);
      if (e?.message) bloc('erreur de connexion', e.message, false);
    }
    if (login.test?.selector) selecteurCss('test de connexion', login.test.selector);
    modele('test de connexion', login.test?.path);
  }
  const dl = d.download;
  if (dl) {
    for (const b of liste(dl.selectors)) bloc('téléchargement', b, false);
    if (dl.infohash) {
      bloc('téléchargement', dl.infohash.hash, false);
      bloc('téléchargement', dl.infohash.title, false);
    }
    if (dl.before) {
      modele('téléchargement', dl.before.path);
      if (dl.before.pathselector) bloc('téléchargement', dl.before.pathselector, false);
      for (const v of Object.values(dl.before.inputs || {})) modele('téléchargement', v);
    }
    for (const v of Object.values(dl.headers || {})) modele('en-tête', liste(v)[0]);
  }
  return soucis;
}

// ---------- accès au site ----------

const TAILLE_MAX = 8e6;

// Adresses de la maison (box, NAS, cette machine) : une description venue d'Internet n'a pas à y toucher.
export function adresseLocale(url) {
  let h;
  try {
    h = new URL(url).hostname.toLowerCase().replace(/^\[|\]$/g, '');
  } catch {
    return true;
  }
  return (
    h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.lan') || h.endsWith('.home') || h.endsWith('.internal') ||
    /^(127|10|0)\./.test(h) || /^192\.168\./.test(h) || /^169\.254\./.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h) ||
    h === '::1' || h === '::' || /^f[cd][0-9a-f]{2}:/.test(h) || /^fe80:/.test(h) || !h.includes('.')
  );
}

// Un site qui répond en JSON dit son erreur dans un champ : « {"error":"Invalid API key"} » → « Invalid API key ».
function messageLisible(texte) {
  const t = String(texte ?? '').trim();
  if (t[0] !== '{') return t;
  try {
    const o = JSON.parse(t);
    for (const cle of ['error', 'erreur', 'message', 'msg', 'error_message', 'status_message', 'detail', 'reason']) {
      const v = o[cle];
      if (typeof v === 'string' && v.trim()) return v;
      if (v && typeof v === 'object' && typeof v.message === 'string') return v.message;
    }
  } catch {}
  return t;
}

const temoinsVersTexte = (temoins) => [...temoins].map(([k, v]) => `${k}=${v}`).join('; ');
export function texteVersTemoins(texte) {
  const m = new Map();
  for (const part of String(texte ?? '').replace(/^cookie:\s*/i, '').split(';')) {
    const k = part.indexOf('=');
    if (k > 0) m.set(part.slice(0, k).trim(), part.slice(k + 1).trim());
  }
  return m;
}

// Une requête, en suivant soi-même les redirections pour garder les témoins (cookies) posés en route.
async function requeteHttp(url, { methode = 'GET', corps = null, entetes = {}, temoins = new Map(), suivre = true, signal, encodage = 'utf-8', local = false, binaire = false } = {}) {
  let adresse = url;
  let redirection = null;
  for (let saut = 0; saut < 7; saut++) {
    if (!/^https?:/i.test(adresse)) throw new ErreurSource(`Adresse non gérée : ${String(adresse).slice(0, 80)}`);
    if (!local && adresseLocale(adresse)) throw new ErreurSource(`La source renvoie vers une adresse de ta maison (${new URL(adresse).hostname}) : refusé.`);
    const hote = new URL(adresse).hostname.replace(/^www\./, '');
    let res;
    try {
      res = await fetch(adresse, {
        method: methode,
        headers: {
          ...NAVIGATEUR,
          Accept: '*/*',
          ...(corps !== null && !Object.keys(entetes).some((k) => k.toLowerCase() === 'content-type') ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
          ...(temoins.size ? { Cookie: temoinsVersTexte(temoins) } : {}),
          ...entetes,
        },
        body: corps,
        redirect: 'manual',
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(20_000)]) : AbortSignal.timeout(20_000),
      });
    } catch (e) {
      if (signal?.aborted) throw e;
      throw new ErreurSource(`${hote} est injoignable (${e.name === 'TimeoutError' ? 'trop long à répondre' : e.cause?.code || e.message}).`);
    }
    for (const c of res.headers.getSetCookie?.() || []) {
      const paire = c.split(';')[0];
      const k = paire.indexOf('=');
      if (k <= 0) continue;
      const valeur = paire.slice(k + 1).trim();
      if (/^(deleted|)$/.test(valeur) || /max-age=0\b|expires=thu, 01[- ]jan[- ]1970/i.test(c)) temoins.delete(paire.slice(0, k).trim());
      else temoins.set(paire.slice(0, k).trim(), valeur);
    }
    const emplacement = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && emplacement) {
      await res.body?.cancel().catch(() => {});
      let suivante;
      try {
        suivante = new URL(emplacement, adresse).href;
      } catch {
        throw new ErreurSource(`${hote} renvoie vers une adresse illisible.`);
      }
      if (!suivre) return { statut: res.status, url: adresse, texte: '', redirection: suivante, type: '' };
      redirection = suivante;
      adresse = suivante;
      if (res.status !== 307 && res.status !== 308) {
        methode = 'GET';
        corps = null;
      }
      continue;
    }
    const morceaux = [];
    let n = 0;
    for await (const c of res.body || []) {
      n += c.length;
      if (n > TAILLE_MAX) throw new ErreurSource(`Réponse trop lourde de ${hote}.`);
      morceaux.push(c);
    }
    const brut = Buffer.concat(morceaux);
    const type = res.headers.get('content-type') || '';
    if (binaire) return { statut: res.status, url: adresse, brut, type, redirection };
    let texte;
    try {
      texte = new TextDecoder(encodage).decode(brut);
    } catch {
      texte = new TextDecoder().decode(brut);
    }
    if (res.headers.get('cf-mitigated') === 'challenge' || ([403, 429, 503].includes(res.status) && /cf-chl|challenge-platform|<title>just a moment/i.test(texte))) {
      throw new ErreurSource(`${hote} affiche une vérification anti-robot : Ondi ne peut pas la passer.`);
    }
    return { statut: res.status, url: adresse, texte, type, redirection };
  }
  throw new ErreurSource('Trop de redirections.');
}

// ---------- une source ----------

const TRACKERS_PUBLICS = ['udp://tracker.opentrackr.org:1337/announce', 'udp://open.demonii.com:1337/announce', 'udp://open.stealth.si:80/announce', 'udp://tracker.torrent.eu.org:451/announce', 'udp://exodus.desync.com:6969/announce'];
export const magnetDe = (hash, titre) =>
  `magnet:?xt=urn:btih:${hash}&dn=${encodeURIComponent(titre || '')}${TRACKERS_PUBLICS.map((t) => `&tr=${encodeURIComponent(t)}`).join('')}`;
const hashDuMagnet = (magnet) => String(magnet || '').match(/btih:([a-z0-9]{32,40})/i)?.[1]?.toLowerCase() || '';

export class Source {
  // options : valeurs (réglages de l'utilisateur), lien (adresse du site si différente), temoins (texte gardé
  // d'une connexion précédente), surTemoins (pour les garder), local (autorise les adresses locales : essais).
  constructor(description, { valeurs = {}, lien = null, temoins = '', surTemoins = null, local = false, maintenant = () => Date.now() } = {}) {
    this.d = description;
    this.valeurs = valeurs;
    this.local = local;
    this.maintenant = maintenant;
    this.surTemoins = surTemoins;
    this.temoins = texteVersTemoins(temoins);
    const liens = liste(description.links);
    const choisi = lien && !liste(description.legacylinks).includes(lien) ? lien : liens[0];
    this.site = String(choisi || '').replace(/\/*$/, '/');
    this.encodage = String(description.encoding || 'utf-8').toLowerCase();
    this.delai = Math.min(10, Math.max(0, Number(description.requestDelay) || 0)) * 1000;
    this.file = Promise.resolve();
    this.derniere = 0;
    this.connecte = false;
    this.categories = new Map(); // identifiant du site → catégorie (« Movies/HD »)
    this.categoriesParNom = new Map();
    for (const [id, cat] of Object.entries(description.caps?.categories || {})) this.categories.set(String(id), cat);
    for (const c of liste(description.caps?.categorymappings)) {
      if (!c || vide(c.id) || !c.cat) continue;
      this.categories.set(String(c.id), c.cat);
      if (c.desc) this.categoriesParNom.set(String(c.desc), c.cat);
    }
    this.categoriesParDefaut = liste(description.caps?.categorymappings).filter((c) => c && vrai(c.default)).map((c) => String(c.id));
  }

  get id() {
    return this.d.id;
  }
  get nom() {
    return this.d.name || this.d.id;
  }

  variablesDeBase() {
    const v = { '.Config.sitelink': this.site, '.True': 'True', '.False': null, '.Today.Year': String(new Date(this.maintenant()).getUTCFullYear()) };
    for (const r of liste(this.d.settings)) {
      if (!r?.name) continue;
      const nom = `.Config.${r.name}`;
      const choisie = this.valeurs[r.name];
      const type = r.type || 'text';
      if (type === 'text' || type === 'password') v[nom] = vide(choisie) ? (r.default ?? null) : String(choisie);
      else if (type === 'checkbox') v[nom] = vrai(choisie ?? r.default) ? '.True' : null;
      else if (type === 'select') {
        const cles = Object.keys(r.options || {});
        v[nom] = cles.includes(String(choisie)) ? String(choisie) : cles.includes(r.default) ? r.default : (cles.sort()[0] ?? null);
      }
    }
    return v;
  }

  resoudre(chemin, base = this.site) {
    try {
      return new URL(String(chemin ?? ''), base).href;
    } catch {
      throw new ErreurSource(`Adresse illisible dans la description : « ${String(chemin).slice(0, 80)} ».`);
    }
  }

  entetes(bloc, variables) {
    const h = {};
    for (const [k, v] of Object.entries(bloc || {})) h[k] = appliquerModele(String(liste(v)[0] ?? ''), variables);
    return h;
  }

  // Une requête à la fois par source, espacées comme le demande la description.
  envoyer(url, options = {}) {
    const tour = this.file.then(async () => {
      const attente = this.derniere + this.delai - Date.now();
      if (attente > 0) await new Promise((r) => setTimeout(r, attente));
      try {
        return await requeteHttp(url, { temoins: this.temoins, encodage: this.encodage, local: this.local, ...options });
      } finally {
        this.derniere = Date.now();
      }
    });
    this.file = tour.catch(() => {});
    return tour;
  }

  garderTemoins() {
    this.surTemoins?.(temoinsVersTexte(this.temoins));
  }

  // ----- connexion -----

  verifierErreurs(reponse, erreurs, quoi) {
    if (reponse.statut === 401) throw new ErreurSource(`${this.nom} refuse ${quoi} (identifiants ou clé à vérifier).`);
    if (!liste(erreurs).length) return;
    const doc = lireArbreHtml(reponse.texte);
    for (const e of liste(erreurs)) {
      if (!e?.selector) continue;
      const trouve = chercher(doc, e.selector);
      if (!trouve) continue;
      let message = texteDe(trouve);
      if (e.message) message = this.valeurBloc(e.message, chercher(doc, 'html') || doc, this.variablesDeBase(), false) ?? message;
      throw new ErreurSource(`${this.nom} : ${messageLisible(message).replace(/\s+/g, ' ').trim().slice(0, 200) || `${quoi} refusée`}`);
    }
  }

  async connecter(signal) {
    const login = this.d.login;
    // Sans « method », la description ne décrit qu'un test : rien à envoyer.
    if (!login?.method) return void (this.connecte = true);
    const variables = this.variablesDeBase();
    const entetes = this.entetes(login.headers ?? this.d.search?.headers, variables);
    const methode = login.method;
    if (login.captcha) throw new ErreurSource(`${this.nom} demande de recopier une image pour se connecter : ce n'est pas possible depuis Ondi.`);
    if (methode === 'cookie') {
      if (vide(this.valeurs.cookie)) throw new ErreurSource(`${this.nom} : colle d'abord le cookie de ta session dans les réglages de la source.`);
      this.temoins = texteVersTemoins(this.valeurs.cookie);
      this.connecte = true;
      return;
    }
    this.temoins.clear();
    const saisies = Object.entries(login.inputs || {}).map(([k, v]) => [k, appliquerModele(String(v ?? ''), variables) ?? '']);
    let reponse;
    if (methode === 'post') {
      for (const [k, v] of texteVersTemoins(liste(login.cookies).join('; '))) this.temoins.set(k, v);
      reponse = await this.envoyer(this.resoudre(appliquerModele(login.path, variables)), { methode: 'POST', corps: chaineRequete(saisies), entetes: { ...entetes, Referer: this.site }, signal });
    } else if (methode === 'get' || methode === 'oneurl') {
      const chemin = appliquerModele(login.path, variables) ?? '';
      const url = methode === 'get' ? `${chemin}?${chaineRequete(saisies)}` : chemin + (saisies.find(([k]) => k === 'oneurl')?.[1] ?? '');
      reponse = await this.envoyer(this.resoudre(url), { entetes: { ...entetes, Referer: this.site }, signal });
    } else if (methode === 'form') {
      const adresse = this.resoudre(appliquerModele(login.path, variables));
      const page = await this.envoyer(adresse, { entetes, signal });
      const doc = lireArbreHtml(page.texte);
      const formulaire = chercher(doc, login.form || 'form');
      if (!formulaire) throw new ErreurSource(`${this.nom} : formulaire de connexion introuvable sur ${new URL(adresse).hostname}.`);
      const champs = new Map();
      for (const champ of chercherTous(formulaire, 'input')) {
        const nom = attributDe(champ, 'name');
        if (nom === null || 'disabled' in champ.attrs) continue;
        if (['checkbox', 'radio'].includes((attributDe(champ, 'type') || '').toLowerCase()) && !('checked' in champ.attrs)) continue;
        champs.set(nom, attributDe(champ, 'value') ?? '');
      }
      for (const [cle, valeur] of saisies) {
        let nom = cle;
        if (vrai(login.selectors)) {
          const champ = chercher(doc, cle);
          if (!champ) throw new ErreurSource(`${this.nom} : champ de connexion introuvable (${cle}).`);
          nom = attributDe(champ, 'name');
        }
        champs.set(nom, valeur);
      }
      const racine = chercher(doc, 'html') || doc;
      for (const [cle, bloc] of Object.entries(login.selectorinputs || {})) {
        const v = this.valeurBloc(bloc, racine, variables, !vrai(bloc?.optional));
        if (v !== null) champs.set(cle, v);
      }
      const enAdresse = [];
      for (const [cle, bloc] of Object.entries(login.getselectorinputs || {})) {
        const v = this.valeurBloc(bloc, racine, variables, !vrai(bloc?.optional));
        if (v !== null) enAdresse.push([cle, v]);
      }
      let envoi = login.submitpath ?? attributDe(formulaire, 'action') ?? '';
      if (enAdresse.length) envoi += `?${chaineRequete(enAdresse)}`;
      reponse = await this.envoyer(this.resoudre(envoi, page.url), { methode: 'POST', corps: chaineRequete([...champs]), entetes: { ...entetes, Referer: adresse }, signal });
    } else throw new ErreurSource(`${this.nom} : façon de se connecter non gérée (${methode}).`);
    this.verifierErreurs(reponse, login.error, 'la connexion');
    this.connecte = true;
    this.garderTemoins();
  }

  connexionRequise(reponse) {
    const login = this.d.login;
    if (!login) return false;
    if (reponse.redirection && reponse.statut >= 300 && reponse.statut < 400) return true;
    if (reponse.statut >= 400) return true;
    if (login.test?.selector && (!reponse.type || reponse.type.includes('text/html'))) {
      return chercherTous(lireArbreHtml(reponse.texte), login.test.selector).length === 0;
    }
    return false;
  }

  // ----- lecture d'un bloc « selector / text / case / attribute / filters » -----

  chercherDans(el, selecteur) {
    const s = selecteur.trim();
    if (s.startsWith(':root')) return chercher(racineDe(el), s);
    return el.nom !== '#document' && correspondA(el, s) ? el : chercher(el, s);
  }

  valeurBloc(bloc, el, variables, requis = true) {
    if (bloc.text !== null && bloc.text !== undefined) return appliquerFiltres(appliquerModele(String(bloc.text), variables), bloc.filters, variables, this.maintenant());
    let choisi = el;
    if (!vide(bloc.selector)) {
      const s = appliquerModele(String(bloc.selector), variables);
      choisi = this.chercherDans(el, s);
      if (!choisi) {
        if (requis) throw new ErreurSource(`rien ne correspond à « ${s} »`);
        return null;
      }
    }
    if (bloc.remove) for (const x of chercherTous(choisi, bloc.remove)) retirer(x);
    let valeur = null;
    if (bloc.case) {
      for (const [cle, v] of Object.entries(bloc.case)) {
        if (cle === '*' || correspondA(choisi, cle) || chercher(choisi, cle)) {
          valeur = appliquerModele(String(v ?? ''), variables);
          break;
        }
      }
      if (valeur === null) {
        if (requis) throw new ErreurSource('aucun des cas prévus ne correspond');
        return null;
      }
    } else if (!vide(bloc.attribute)) {
      valeur = attributDe(choisi, bloc.attribute);
      if (valeur === null) {
        if (requis) throw new ErreurSource(`attribut « ${bloc.attribute} » absent`);
        return null;
      }
    } else valeur = texteDe(choisi);
    return appliquerFiltres(valeur.trim(), bloc.filters, variables, this.maintenant());
  }

  valeurBlocJson(bloc, objet, variables, requis = true) {
    if (bloc.text !== null && bloc.text !== undefined) return appliquerFiltres(appliquerModele(String(bloc.text), variables), bloc.filters, variables, this.maintenant());
    let valeur = null;
    if (!vide(bloc.selector)) {
      const s = appliquerModele(String(bloc.selector).replace(/^\.+/, ''), variables);
      const chemin = selecteurJson(objet, s);
      const choisi = chemin === null ? undefined : jetonJson(objet, chemin);
      if (choisi === undefined || choisi === null) {
        if (requis) throw new ErreurSource(`rien à « ${s} » dans la réponse`);
        return null;
      }
      valeur = texteJson(choisi);
    }
    if (bloc.case) {
      let trouve = null;
      for (const [cle, v] of Object.entries(bloc.case)) {
        if ((valeur !== null && valeur === cle) || cle === '*') {
          trouve = appliquerModele(String(v ?? ''), variables);
          break;
        }
      }
      if (trouve === null) {
        if (requis) throw new ErreurSource('aucun des cas prévus ne correspond');
        return null;
      }
      valeur = trouve;
    }
    if (valeur === null) return null;
    return appliquerFiltres(valeur.trim(), bloc.filters, variables, this.maintenant());
  }

  // ----- recherche -----

  // demande : { q, type ('film' | 'serie' | null), saison, episode, annee, imdb, tmdb }
  variablesDeRecherche(demande) {
    const v = this.variablesDeBase();
    const texte = (x) => (vide(x) ? null : String(x));
    const serie = demande.type === 'serie';
    const film = demande.type === 'film';
    const saison = texte(demande.saison);
    const episode = texte(demande.episode);
    const deux = (n) => String(n).padStart(2, '0');
    Object.assign(v, {
      '.Query.Type': serie ? 'tvsearch' : film ? 'movie' : 'search',
      '.Query.Q': texte(demande.q),
      '.Query.Limit': null, '.Query.Offset': null, '.Query.Extended': null, '.Query.APIKey': null, '.Query.Genre': null,
      '.Query.Movie': null, '.Query.Year': texte(demande.annee),
      '.Query.IMDBID': texte(demande.imdb), '.Query.IMDBIDShort': texte(demande.imdb)?.replace(/^tt/, '') ?? null, '.Query.TMDBID': texte(demande.tmdb),
      '.Query.Series': null, '.Query.Ep': serie ? episode : null, '.Query.Season': serie ? saison : null,
      '.Query.TVDBID': null, '.Query.TVRageID': null, '.Query.TVMazeID': null, '.Query.TraktID': null, '.Query.DoubanID': null,
      '.Query.Episode': serie && saison ? `S${deux(saison)}${episode ? `E${deux(episode)}` : ''}` : null,
      '.Query.Album': null, '.Query.Artist': null, '.Query.Label': null, '.Query.Track': null,
      '.Query.Author': null, '.Query.Title': null, '.Query.Publisher': null,
    });
    // Catégories du site qui correspondent à ce qu'on cherche (films, séries).
    const voulues = [...this.categories].filter(([, cat]) => (film ? /^Movies\b/.test(cat) : serie ? /^TV\b/.test(cat) : false)).map(([id]) => id);
    v['.Query.Categories'] = voulues;
    const mots = ['Q', 'Series', 'Movie', 'Year'].map((k) => v[`.Query.${k}`]).filter((x) => !vide(x));
    if (!vide(v['.Query.Episode'])) mots.push(v['.Query.Episode']);
    v['.Query.Keywords'] = mots.join(' ');
    v['.Keywords'] = appliquerFiltres(v['.Query.Keywords'], this.d.search.keywordsfilters, v, this.maintenant());
    return v;
  }

  requetes(variables) {
    const s = this.d.search;
    const chemins = liste(s.paths).length ? liste(s.paths) : [{ path: s.path }];
    const toutes = variables['.Query.Categories'].length ? variables['.Query.Categories'] : this.categoriesParDefaut;
    const faites = [];
    const vues = new Set();
    for (const chemin of chemins) {
      const vars = { ...variables, '.Categories': toutes };
      const limites = liste(chemin.categories).map(String);
      if (limites.length && toutes.length) {
        let commun = toutes.some((c) => limites.includes(c));
        if (limites[0] === '!') commun = !commun;
        if (!commun) continue;
        vars['.Categories'] = toutes.filter((c) => limites.includes(c));
      }
      let url = this.resoudre(appliquerModele(String(chemin.path ?? ''), vars, encoder).replace(/\+/g, '%20'));
      const paires = [];
      const blocs = chemin.inheritinputs === undefined || chemin.inheritinputs === null || vrai(chemin.inheritinputs) ? [s.inputs, chemin.inputs] : [chemin.inputs];
      for (const bloc of blocs) {
        for (const [cle, valeur] of Object.entries(bloc || {})) {
          if (cle === '$raw') {
            for (const part of appliquerModele(String(valeur ?? ''), vars, encoder).split('&')) {
              const k = part.indexOf('=');
              const nom = k < 0 ? part : part.slice(0, k);
              if (nom) paires.push([nom, k < 0 ? '' : part.slice(k + 1)]);
            }
          } else {
            const v = appliquerModele(String(valeur ?? ''), vars);
            if (!vide(v) || vrai(s.allowEmptyInputs)) paires.push([cle, v ?? '']);
          }
        }
      }
      const post = String(chemin.method || '').toLowerCase() === 'post';
      if (!post && paires.length) url += `?${chaineRequete(paires)}`;
      if (!post && vues.has(url)) continue;
      vues.add(url);
      faites.push({
        url,
        methode: post ? 'POST' : 'GET',
        corps: post ? chaineRequete(paires) : null,
        entetes: this.entetes(s.headers, vars),
        suivre: vrai(chemin.followredirect) || vrai(this.d.followredirect) || !this.d.login,
        type: chemin.response?.type || 'html',
        sansResultat: chemin.response?.noresultsmessage ?? null,
        variables: vars,
      });
    }
    return faites;
  }

  async rechercher(demande, { signal } = {}) {
    const variables = this.variablesDeRecherche(demande);
    const requetes = this.requetes(variables);
    if (!requetes.length) return [];
    if (this.d.login && !this.connecte && !this.temoins.size) await this.connecter(signal);
    else if (this.d.login?.method === 'cookie') await this.connecter(signal);
    const versions = [];
    let erreur = null;
    for (const r of requetes) {
      try {
        const options = { methode: r.methode, corps: r.corps, entetes: r.entetes, suivre: r.suivre, signal };
        let reponse = await this.envoyer(r.url, options);
        if (this.connexionRequise(reponse)) {
          await this.connecter(signal);
          reponse = await this.envoyer(r.url, options);
          if (this.connexionRequise(reponse)) {
            this.connecte = false;
            if (!reponse.redirection && reponse.statut >= 400) throw new ErreurSource(`${this.nom} a répondu « HTTP ${reponse.statut} ».`);
            throw new ErreurSource(`${this.nom} ne nous laisse pas entrer : vérifie les identifiants de la source.`);
          }
        }
        this.connecte = true;
        if (reponse.redirection && !r.suivre) throw new ErreurSource(`${this.nom} renvoie vers ${new URL(reponse.redirection).hostname} : le site a peut-être changé d'adresse.`);
        if (reponse.statut !== 200) throw new ErreurSource(`${this.nom} a répondu « HTTP ${reponse.statut} ».`);
        versions.push(...this.lireReponse(reponse, r, demande));
      } catch (e) {
        if (signal?.aborted) throw e;
        erreur ||= e;
      }
    }
    if (!versions.length && erreur) throw erreur;
    const vus = new Set();
    return versions.filter((v) => {
      const cle = v.infohash || v.magnet || v.lien || v.details || v.titre;
      return vus.has(cle) ? false : (vus.add(cle), true);
    });
  }

  lireReponse(reponse, requete, demande) {
    const s = this.d.search;
    const variables = { ...requete.variables };
    const json = requete.type === 'json';
    let texte = reponse.texte;
    const versions = [];
    const champs = Object.entries(s.fields || {});

    const lireLigne = (ligne, parent) => {
      const version = { categories: [] };
      for (const [cle, bloc] of champs) {
        const [nom, ...modifs] = cle.split('|');
        const variable = `.Result.${nom}`;
        const optionnel = modifs.includes('optional') || vrai(bloc?.optional);
        let valeur = null;
        try {
          if (json) valeur = this.valeurBlocJson(bloc || {}, String(bloc?.selector || '').startsWith('..') ? parent : ligne, variables, !optionnel);
          else valeur = this.valeurBloc(bloc || {}, ligne, variables, !optionnel);
          if (optionnel && vide(valeur)) {
            const defaut = appliquerModele(bloc?.default ?? null, variables);
            if (vide(defaut)) {
              variables[variable] = null;
              continue;
            }
            valeur = defaut;
          }
          variables[variable] = this.rangerChamp(version, nom, valeur, modifs, reponse.url);
        } catch (e) {
          if (!(variable in variables) || optionnel) variables[variable] = null;
        }
      }
      return version;
    };

    if (json) {
      if (requete.sansResultat !== null && ((requete.sansResultat && texte.includes(requete.sansResultat)) || (!requete.sansResultat && !texte.trim()))) return [];
      let donnees;
      try {
        donnees = JSON.parse(texte);
      } catch {
        throw new ErreurSource(`${this.nom} n'a pas répondu ce qui était attendu (pas du JSON).`);
      }
      if (s.rows.count) {
        try {
          const n = this.valeurBlocJson(s.rows.count, donnees, variables);
          if (/^\d+$/.test(n ?? '') && Number(n) < 1) return [];
        } catch {}
      }
      const selecteur = appliquerModele(String(s.rows.selector), variables);
      const chemin = selecteur.split(':')[0];
      const lignes = jetonJson(donnees, chemin);
      if (!Array.isArray(lignes)) {
        if (vrai(s.rows.missingAttributeEqualsNoResults) || lignes === undefined || lignes === null) return [];
        throw new ErreurSource(`${this.nom} : liste de résultats introuvable dans la réponse.`);
      }
      const condition = selecteur.slice(chemin.length);
      for (const ligne of lignes) {
        if (ligne === null || typeof ligne !== 'object') continue;
        if (condition && selecteurJson(ligne, condition) === null) continue;
        let sous = [ligne];
        if (s.rows.attribute) {
          const a = jetonJson(ligne, s.rows.attribute);
          if (a === undefined || a === null) continue;
          sous = vrai(s.rows.multiple) ? liste(a).filter((x) => x && typeof x === 'object') : [a];
        }
        for (const x of sous) versions.push(lireLigne(x, ligne));
      }
    } else {
      if (s.preprocessingfilters) texte = appliquerFiltres(texte, s.preprocessingfilters, variables, this.maintenant());
      const doc = requete.type === 'xml' ? lireArbreXml(texte) : lireArbreHtml(texte);
      for (const e of liste(s.error)) {
        const trouve = e?.selector && chercher(doc, e.selector);
        if (trouve) throw new ErreurSource(`${this.nom} : ${texteDe(trouve).replace(/\s+/g, ' ').trim().slice(0, 200)}`);
      }
      const lignes = chercherTous(doc, appliquerModele(String(s.rows.selector), variables));
      const apres = parseInt(s.rows.after, 10) || 0;
      if (apres > 0) {
        for (let i = 0; i < lignes.length; i++) {
          for (const suivante of lignes.splice(i + 1, apres)) deplacerEnfants(suivante, lignes[i]);
        }
      }
      for (const ligne of lignes) versions.push(lireLigne(ligne, ligne));
    }

    const mots = liste(s.rows.filters).some((f) => f?.name === 'andmatch') ? normaliser(demande.q || '').split(' ').filter(Boolean) : [];
    const prive = this.d.type === 'private';
    return versions
      .filter((v) => !vide(v.titre) && (v.lien || v.magnet || v.infohash))
      .filter((v) => !mots.length || mots.every((m) => normaliser(v.titre).includes(m)))
      .map((v) => {
        if (!v.magnet && v.infohash && !prive) v.magnet = magnetDe(v.infohash, v.titre);
        if (v.magnet && !v.infohash) v.infohash = hashDuMagnet(v.magnet);
        return { ...v, source: this.id };
      });
  }

  // Range la valeur d'un champ dans la version, et rend le texte gardé pour les champs suivants (.Result.x).
  rangerChamp(v, nom, valeur, modifs, adresse) {
    const entier = () => Math.round(nombre(valeur));
    switch (nom) {
      case 'download':
        if (vide(valeur)) return null;
        if (valeur.startsWith('magnet:')) return (v.magnet = valeur);
        return (v.lien = this.resoudre(valeur, adresse));
      case 'magnet':
        v.magnet = valeur;
        return valeur;
      case 'infohash':
        v.infohash = String(valeur).trim().toLowerCase();
        return valeur;
      case 'details':
      case 'comments':
        if (nom === 'details' || !v.details) v.details = this.resoudre(valeur, adresse);
        return this.resoudre(valeur, adresse);
      case 'title':
        v.titre = modifs.includes('append') ? (v.titre || '') + valeur : valeur;
        return v.titre;
      case 'description':
        v.description = modifs.includes('append') ? (v.description || '') + valeur : valeur;
        return v.description;
      case 'category':
      case 'categorydesc': {
        const carte = nom === 'category' ? this.categories : this.categoriesParNom;
        const cats = String(valeur).split(',').map((c) => carte.get(c.trim())).filter(Boolean);
        v.categories = [...new Set([...v.categories, ...cats])];
        return valeur;
      }
      case 'size':
        v.taille = lireTaille(valeur);
        return String(v.taille);
      case 'seeders': {
        const n = entier();
        v.sources = n < 5_000_000 ? n : 0;
        return String(v.sources);
      }
      case 'leechers': {
        const n = entier();
        v.pairs = n < 5_000_000 ? n : 0;
        return String(v.pairs);
      }
      case 'date': {
        const ms = lireDate(valeur, this.maintenant());
        if (ms === null) throw new ErreurSource(`date non comprise : « ${valeur} »`);
        v.date = ms;
        return ecrireDate(ms);
      }
      case 'files':
        v.fichiers = entier();
        return String(v.fichiers);
      case 'grabs':
        v.telechargements = entier();
        return String(v.telechargements);
      case 'imdb':
      case 'imdbid': {
        const n = String(valeur).match(/\d+/)?.[0];
        if (n) v.imdb = `tt${n.padStart(7, '0')}`;
        return n ?? '';
      }
      case 'tmdbid': {
        const n = String(valeur).match(/\d+/)?.[0];
        if (n) v.tmdb = Number(n);
        return n ?? '';
      }
      case 'poster':
        if (!vide(valeur)) v.affiche = this.resoudre(valeur, adresse);
        return v.affiche ?? null;
      case 'year':
        v.annee = entier();
        return String(v.annee);
      case 'downloadvolumefactor':
      case 'uploadvolumefactor':
      case 'minimumratio':
      case 'minimumseedtime':
        return String(nombre(valeur));
      default:
        return valeur;
    }
  }

  // ----- de la version au magnet ou au fichier .torrent -----

  // Rend { magnet } ou { torrent (octets), nom }.
  async lienDe(version, { signal } = {}) {
    if (version.magnet) return { magnet: version.magnet };
    if (!version.lien) throw new ErreurSource('Cette version n’a pas de lien de téléchargement.');
    if (this.d.login && !this.connecte && !this.temoins.size) await this.connecter(signal);
    else if (this.d.login?.method === 'cookie') await this.connecter(signal);
    const dl = this.d.download;
    const variables = this.variablesDeBase();
    const u = new URL(version.lien);
    Object.assign(variables, {
      '.DownloadUri.AbsoluteUri': u.href, '.DownloadUri.AbsolutePath': u.pathname, '.DownloadUri.Scheme': u.protocol.replace(':', ''),
      '.DownloadUri.Host': u.hostname, '.DownloadUri.Port': u.port || (u.protocol === 'https:' ? '443' : '80'),
      '.DownloadUri.PathAndQuery': u.pathname + u.search, '.DownloadUri.Query': u.search,
    });
    for (const [k, val] of u.searchParams) variables[`.DownloadUri.Query.${k}`] ??= val;
    const entetes = this.entetes(dl?.headers ?? this.d.search?.headers, variables);
    let adresse = version.lien;
    let methode = 'GET';
    if (dl) {
      let reponse = null;
      const page = async () => (reponse ||= await this.envoyer(version.lien, { entetes, signal }));
      const extraire = (bloc, r) => {
        const doc = lireArbreHtml(r.texte);
        const el = chercher(doc, appliquerModele(String(bloc.selector), variables));
        if (!el) return null;
        const brut = vide(bloc.attribute) ? texteDe(el) : attributDe(el, bloc.attribute);
        if (brut === null) throw new ErreurSource(`attribut « ${bloc.attribute} » absent`);
        return appliquerFiltres(brut, bloc.filters, variables, this.maintenant());
      };
      let avant = null;
      if (dl.before) {
        let chemin = dl.before.path;
        if (dl.before.pathselector) chemin = extraire(dl.before.pathselector, await page());
        const saisies = Object.entries(dl.before.inputs || {}).map(([k, val]) => [k, appliquerModele(String(val ?? ''), variables) ?? '']);
        const post = String(dl.before.method || '').toLowerCase() === 'post';
        let url = this.resoudre(appliquerModele(String(chemin ?? ''), variables));
        if (!post && saisies.length) url += (url.includes('?') ? '' : '?') + chaineRequete(saisies, dl.before.queryseparator || '&');
        avant = await this.envoyer(url, { methode: post ? 'POST' : 'GET', corps: post ? chaineRequete(saisies) : null, entetes: { ...entetes, Referer: version.lien }, signal });
      }
      if (String(dl.method || '').toLowerCase() === 'post') methode = 'POST';
      if (dl.infohash) {
        const r = vrai(dl.infohash.usebeforeresponse) && avant ? avant : await page();
        const hash = extraire(dl.infohash.hash, r);
        const titre = extraire(dl.infohash.title, r);
        if (hash) return { magnet: magnetDe(hash.trim().toLowerCase(), titre || version.titre) };
      } else if (liste(dl.selectors).length) {
        let trouve = null;
        for (const bloc of liste(dl.selectors)) {
          try {
            const href = extraire(bloc, vrai(bloc.usebeforeresponse) && avant ? avant : await page());
            if (vide(href)) continue;
            trouve = href.startsWith('magnet:') ? href : this.resoudre(href, version.lien);
            break;
          } catch {}
        }
        if (!trouve) throw new ErreurSource(`${this.nom} : lien de téléchargement introuvable sur la page de cette version.`);
        if (trouve.startsWith('magnet:')) return { magnet: trouve };
        adresse = trouve;
      }
    }
    const fichier = await this.envoyer(adresse, { methode, entetes, binaire: true, signal });
    if (fichier.statut !== 200 || fichier.brut[0] !== 0x64) {
      throw new ErreurSource(`${this.nom} n'a pas donné de fichier .torrent (connexion expirée, ou limite du site atteinte).`);
    }
    return { torrent: fichier.brut, nom: `${String(version.titre || 'version').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').slice(0, 150)}.torrent` };
  }
}

// Une version concerne-t-elle un film ou une série (et pas un jeu, un livre, de la musique…) ?
// Sans catégorie connue, on laisse passer : le titre dira le reste.
export const estVideo = (version) => !version.categories.length || version.categories.some((c) => CATEGORIES_VIDEO.test(c));
