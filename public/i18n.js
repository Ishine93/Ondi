// Langue de l'application (Réglages → Langue) : français par défaut, anglais au choix.
// - Le code nouveau appelle t('Texte en français {x}', { x }) ;
// - le reste de la page (écrit en français) est traduit à l'affichage : chaque texte, et les attributs
//   placeholder / title / aria-label, passent par le dictionnaire DICO_EN (public/i18n-en.js) :
//   correspondance exacte, sinon motifs (expressions régulières), sinon morceau par morceau autour de « · ».
/* global DICO_EN */
const LANGUE = (() => {
  try {
    return localStorage.getItem('langueApp') === 'en' ? 'en' : 'fr';
  } catch {
    return 'fr';
  }
})();
document.documentElement.lang = LANGUE;

// Deux dictionnaires : la page d'origine (i18n-en.js) et les écrans bibliothèque / lecteur / profils (i18n-en-media.js).
let dicoFusionne = null;
function dicoEn() {
  if (!dicoFusionne) {
    const base = (typeof DICO_EN === 'object' && DICO_EN) || {};
    const media = window.DICO_EN_MEDIA || {};
    dicoFusionne = { exact: { ...(base.exact || {}), ...(media.exact || {}) }, motifs: [...(media.motifs || []), ...(base.motifs || [])] };
  }
  return dicoFusionne;
}
let motifsCompiles = null;
function motifsEn() {
  if (!motifsCompiles) motifsCompiles = (dicoEn().motifs || []).map(([source, remplacement]) => [new RegExp(`^${source}$`, 'u'), remplacement]);
  return motifsCompiles;
}

// Traduit une phrase complète (sans espaces autour). Renvoie null si inconnue.
function traduirePhrase(fr) {
  const exact = dicoEn().exact || {};
  if (Object.prototype.hasOwnProperty.call(exact, fr)) return exact[fr];
  for (const [re, remplacement] of motifsEn()) {
    if (re.test(fr)) return fr.replace(re, remplacement);
  }
  // « 9 contenus · site.exemple · 22 pages lues » : morceau par morceau.
  for (const sep of [' · ', '  ·  ', ' — ', ' : ']) {
    if (!fr.includes(sep)) continue;
    const morceaux = fr.split(sep);
    let change = false;
    const trad = morceaux.map((m) => {
      const x = m.trim() ? traduirePhrase(m.trim()) : null;
      if (x != null) change = true;
      return x != null ? m.replace(m.trim(), x) : m;
    });
    if (change) return trad.join(sep);
  }
  return null;
}

function t(fr, vars = {}) {
  let s = fr;
  if (LANGUE === 'en') s = traduirePhrase(fr) ?? fr;
  return s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? ''));
}

// ---------- traduction de la page à l'affichage ----------

const ATTRIBUTS = ['placeholder', 'title', 'aria-label'];
function traduireTexte(noeud) {
  const v = noeud.nodeValue;
  const net = v.trim();
  if (!net || !/[A-Za-zÀ-ÿ]/.test(net)) return;
  const x = traduirePhrase(net);
  if (x != null && x !== net) noeud.nodeValue = v.replace(net, x);
}
function traduireElement(el) {
  if (el.nodeType === 3) return traduireTexte(el);
  if (el.nodeType !== 1 || el.closest?.('[data-pas-traduire], script, style, code')) return;
  for (const a of ATTRIBUTS) {
    const v = el.getAttribute(a);
    if (v) {
      const x = traduirePhrase(v.trim());
      if (x != null && x !== v) el.setAttribute(a, x);
    }
  }
  const marche = document.createTreeWalker(el, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
    acceptNode: (n) => (n.nodeType === 1 && n.matches('script, style, code, [data-pas-traduire]') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  let n = marche.nextNode();
  while (n) {
    if (n.nodeType === 3) traduireTexte(n);
    else
      for (const a of ATTRIBUTS) {
        const v = n.getAttribute(a);
        if (v) {
          const x = traduirePhrase(v.trim());
          if (x != null && x !== v) n.setAttribute(a, x);
        }
      }
    n = marche.nextNode();
  }
}

if (LANGUE === 'en') {
  const demarrer = () => {
    traduireElement(document.body);
    document.title = traduirePhrase(document.title) ?? document.title;
    new MutationObserver((liste) => {
      for (const m of liste) {
        if (m.type === 'characterData') traduireTexte(m.target);
        else if (m.type === 'attributes') traduireElement(m.target);
        else for (const n of m.addedNodes) traduireElement(n);
      }
    }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRIBUTS });
  };
  if (document.body) demarrer();
  else document.addEventListener('DOMContentLoaded', demarrer);
}

function changerLangue(langue) {
  try {
    localStorage.setItem('langueApp', langue === 'en' ? 'en' : 'fr');
  } catch {}
  location.reload();
}
