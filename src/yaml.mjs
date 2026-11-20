// Lecture YAML réduite à ce qu'emploient les descriptions de sources (catalogue de Prowlarr) :
// dictionnaires et listes, en blocs ou entre { } et [ ], textes simples ou entre guillemets,
// commentaires. Aucune dépendance.
// Toutes les valeurs restent des textes (« 1.0 » reste « 1.0 », « true » reste « true ») :
// c'est celui qui lit la description qui sait ce qu'il attend. Une valeur vide vaut null.

export class ErreurYaml extends Error {}

const ECHAPPEMENTS = { n: '\n', t: '\t', r: '\r', 0: '\0', '"': '"', '\\': '\\', '/': '/', ' ': ' ', a: '\x07', b: '\b', e: '\x1b', f: '\f', v: '\v', _: ' ', N: '\u0085', L: ' ', P: ' ' };

const estTiret = (t) => t === '-' || t.startsWith('- ');
const scalaire = (v) => (v === '' || v === '~' || /^null$/i.test(v) ? null : v);

// « valeur # commentaire » → « valeur » (un # collé à un mot fait partie du texte : « div#id »).
function sansCommentaire(t) {
  const m = t.match(/(^|\s)#/);
  return (m ? t.slice(0, m.index) : t).trim();
}

export function lireYaml(texte) {
  const lignes = String(texte).replace(/^﻿/, '').split(/\r?\n/);
  let i = 0;
  const ancres = new Map();
  const erreur = (quoi) => new ErreurYaml(`YAML, ligne ${i} : ${quoi}`);

  // Prochaine ligne utile (ni vide, ni commentaire), sans l'avancer.
  const voir = () => {
    for (; i < lignes.length; i++) {
      const t = lignes[i].trim();
      if (!t || t[0] === '#' || t === '---' || t === '...') continue;
      return { retrait: lignes[i].length - lignes[i].trimStart().length, texte: t };
    }
    return null;
  };

  // ---------- valeurs écrites sur la ligne ----------

  const ajouterLigne = (f) => {
    if (i >= lignes.length) return false;
    f.s += `\n${lignes[i++]}`;
    return true;
  };

  function lireGuillemets(f, surUneLigne = false) {
    const q = f.s[f.p++];
    let r = '';
    for (;;) {
      if (f.p >= f.s.length) {
        if (surUneLigne || !ajouterLigne(f)) throw erreur('guillemet jamais refermé');
        continue;
      }
      const c = f.s[f.p++];
      if (c === q) {
        if (q === "'" && f.s[f.p] === "'") {
          r += "'";
          f.p++;
          continue;
        }
        return r;
      }
      if (c === '\\' && q === '"') {
        const e = f.s[f.p++];
        if (e === 'x' || e === 'u' || e === 'U') {
          const n = { x: 2, u: 4, U: 8 }[e];
          r += String.fromCodePoint(parseInt(f.s.slice(f.p, f.p + n), 16) || 0xfffd);
          f.p += n;
        } else if (e === '\n' || e === undefined) {
          // Barre en fin de ligne : la ligne continue, sans espace (le retour à la ligne est déjà passé).
          if (e === undefined && !ajouterLigne(f)) throw erreur('guillemet jamais refermé');
          while (f.s[f.p] === ' ' || f.s[f.p] === '\t') f.p++;
        } else r += ECHAPPEMENTS[e] ?? e;
      } else if (c === '\n') {
        // Retour à la ligne dans un texte entre guillemets : une espace.
        r = r.replace(/[ \t]+$/, '');
        while (f.s[f.p] === ' ' || f.s[f.p] === '\t') f.p++;
        r += ' ';
      } else r += c;
    }
  }

  function sauterBlancs(f) {
    for (;;) {
      while (f.p < f.s.length && /\s/.test(f.s[f.p])) f.p++;
      if (f.s[f.p] === '#' && (f.p === 0 || /\s/.test(f.s[f.p - 1]))) {
        while (f.p < f.s.length && f.s[f.p] !== '\n') f.p++;
        continue;
      }
      if (f.p < f.s.length || !ajouterLigne(f)) return;
    }
  }

  // Texte simple entre { } ou [ ] : s'arrête à la virgule, au crochet fermant, ou au « : » d'une clé.
  function texteDeFlux(f, cle) {
    const d = f.p;
    for (; f.p < f.s.length; f.p++) {
      const c = f.s[f.p];
      if (c === ',' || c === ']' || c === '}' || c === '\n') break;
      if (c === '#' && /\s/.test(f.s[f.p - 1])) break;
      if (cle && c === ':' && (f.p + 1 >= f.s.length || /[\s,}\]]/.test(f.s[f.p + 1]))) break;
    }
    return f.s.slice(d, f.p).trim();
  }

  function lireFlux(f) {
    sauterBlancs(f);
    const c = f.s[f.p];
    if (c === '[') {
      f.p++;
      const a = [];
      for (;;) {
        sauterBlancs(f);
        if (f.p >= f.s.length) throw erreur('« ] » manquant');
        if (f.s[f.p] === ']') return f.p++, a;
        a.push(lireFlux(f));
        sauterBlancs(f);
        if (f.s[f.p] === ',') f.p++;
        else if (f.s[f.p] !== ']') throw erreur('« , » ou « ] » attendu');
      }
    }
    if (c === '{') {
      f.p++;
      const o = {};
      for (;;) {
        sauterBlancs(f);
        if (f.p >= f.s.length) throw erreur('« } » manquant');
        if (f.s[f.p] === '}') return f.p++, o;
        const cle = f.s[f.p] === '"' || f.s[f.p] === "'" ? lireGuillemets(f) : texteDeFlux(f, true);
        sauterBlancs(f);
        let v = null;
        if (f.s[f.p] === ':') {
          f.p++;
          sauterBlancs(f);
          if (f.s[f.p] !== ',' && f.s[f.p] !== '}') v = lireFlux(f);
        }
        o[cle] = v;
        sauterBlancs(f);
        if (f.s[f.p] === ',') f.p++;
        else if (f.s[f.p] !== '}') throw erreur('« , » ou « } » attendu');
      }
    }
    if (c === '"' || c === "'") return lireGuillemets(f);
    return scalaire(texteDeFlux(f, false));
  }

  // Texte « | » (lignes gardées) ou « > » (lignes repliées), sur les lignes plus en retrait.
  function blocDeTexte(marque, retraitParent) {
    const morceaux = [];
    let retrait = null;
    for (; i < lignes.length; i++) {
      const l = lignes[i];
      if (!l.trim()) {
        morceaux.push('');
        continue;
      }
      const r = l.length - l.trimStart().length;
      if (r <= retraitParent) break;
      retrait ??= r;
      morceaux.push(l.slice(retrait).trimEnd());
    }
    while (morceaux.length && !morceaux[morceaux.length - 1]) morceaux.pop();
    const corps = marque[0] === '|' ? morceaux.join('\n') : morceaux.join(' ').replace(/ {2,}/g, '\n');
    return marque.includes('-') ? corps : `${corps}\n`;
  }

  function valeurEnLigne(reste, retraitParent) {
    const c = reste[0];
    if (c === '&') {
      const m = reste.match(/^&(\S+)\s*(.*)$/);
      const v = m[2] ? valeurEnLigne(m[2], retraitParent) : suiteDe(retraitParent);
      ancres.set(m[1], v);
      return v;
    }
    if (c === '*' && /^\*\S+$/.test(sansCommentaire(reste))) {
      const nom = sansCommentaire(reste).slice(1);
      if (!ancres.has(nom)) throw erreur(`renvoi « *${nom} » inconnu`);
      return structuredClone(ancres.get(nom));
    }
    if (c === '"' || c === "'" || c === '{' || c === '[') {
      const f = { s: reste, p: 0 };
      const v = c === '"' || c === "'" ? lireGuillemets(f) : lireFlux(f);
      const fin = f.s.slice(f.p).trim();
      if (fin && fin[0] !== '#') throw erreur(`texte inattendu après une valeur : « ${fin.slice(0, 40)} »`);
      return v;
    }
    if (/^[|>][-+0-9]*$/.test(sansCommentaire(reste))) return blocDeTexte(sansCommentaire(reste), retraitParent);
    // Texte simple, qui peut se poursuivre sur des lignes plus en retrait.
    let v = sansCommentaire(reste);
    for (;;) {
      const s = voir();
      if (!s || s.retrait <= retraitParent) break;
      i++;
      v += ` ${sansCommentaire(s.texte)}`;
    }
    return scalaire(v);
  }

  // ---------- blocs ----------

  // « clé: reste » → { cle, reste } ; null si la ligne n'est pas une entrée de dictionnaire.
  function couperCle(t) {
    if (t[0] === '{' || t[0] === '[') return null;
    if (t[0] === '"' || t[0] === "'") {
      const f = { s: t, p: 0 };
      let cle;
      try {
        cle = lireGuillemets(f, true);
      } catch {
        return null;
      }
      const m = t.slice(f.p).match(/^\s*:(?:\s+|$)/);
      return m ? { cle, reste: sansDebutCommentaire(t.slice(f.p + m[0].length)) } : null;
    }
    for (let k = 0; k < t.length; k++) {
      if (t[k] === '#' && k > 0 && /\s/.test(t[k - 1])) return null;
      if (t[k] === ':' && (k + 1 === t.length || t[k + 1] === ' ' || t[k + 1] === '\t')) {
        return { cle: t.slice(0, k).trim(), reste: sansDebutCommentaire(t.slice(k + 1)) };
      }
    }
    return null;
  }
  // Ce qui suit « clé: » ; un commentaire seul vaut « rien ».
  const sansDebutCommentaire = (t) => (t.trim()[0] === '#' ? '' : t.trim());

  // Valeur d'une clé (ou d'un tiret) qui n'a rien sur sa ligne : le bloc en dessous, s'il y en a un.
  function suiteDe(retrait, dansDico = false) {
    const s = voir();
    if (s && s.retrait > retrait) return bloc(s.retrait);
    // « clé: » suivie d'une liste au même niveau.
    if (dansDico && s && s.retrait === retrait && estTiret(s.texte)) return liste(retrait);
    return null;
  }

  function bloc(retrait) {
    const l = voir();
    if (!l || l.retrait < retrait) return null;
    return estTiret(l.texte) ? liste(l.retrait) : dico(l.retrait);
  }

  function liste(retrait) {
    const a = [];
    for (;;) {
      const l = voir();
      if (!l || l.retrait !== retrait || !estTiret(l.texte)) break;
      i++;
      const reste = l.texte.slice(1).trimStart();
      if (!reste || reste[0] === '#') {
        a.push(suiteDe(retrait));
        continue;
      }
      const colonne = retrait + (l.texte.length - reste.length);
      if (estTiret(reste)) throw erreur('liste dans une liste sur la même ligne : non géré');
      const entree = couperCle(reste);
      a.push(entree ? dico(colonne, entree) : valeurEnLigne(reste, retrait));
    }
    return a;
  }

  function dico(retrait, premiere = null) {
    const o = {};
    let entree = premiere;
    for (;;) {
      if (!entree) {
        const l = voir();
        if (!l || l.retrait !== retrait || estTiret(l.texte)) break;
        entree = couperCle(l.texte);
        if (!entree) throw erreur(`« clé: valeur » attendu, lu « ${l.texte.slice(0, 60)} »`);
        i++;
      }
      const { cle, reste } = entree;
      entree = null;
      o[cle] = reste ? valeurEnLigne(reste, retrait) : suiteDe(retrait, true);
    }
    return o;
  }

  const racine = bloc(0);
  if (voir()) throw erreur(`ligne non comprise : « ${voir().texte.slice(0, 60)} »`);
  return racine;
}
