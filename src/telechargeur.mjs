// Téléchargement HTTP rapide et reprenable.
// Le fichier est découpé en gros blocs (≈ 1/8 de ce que fait chaque connexion, entre 32 Mo
// et 1 Go) récupérés par plusieurs connexions en parallèle : peu de requêtes, donc pas de
// bridage côté serveur. Le .part est un fichier « creux » NTFS : écrire loin dans le fichier
// ne force pas Windows à remplir de zéros tout ce qui précède. L'état (`etat.faits`,
// `etat.partiels`) est sauvegardé : après une coupure ou un redémarrage, on reprend où on en était.
import fsp from 'node:fs/promises';
import { execFile } from 'node:child_process';

const BLOC_MIN = 32 * 1024 * 1024;
const BLOC_MAX = 1024 * 1024 * 1024;
const TAMPON = 4 * 1024 * 1024;
const SILENCE_MAX = 60_000;
const ESSAIS_MAX = 8;

// Erreur définitive : inutile de réessayer.
export class ErreurTelechargement extends Error {}
// Erreur passagère : on réessaie.
class ErreurPassagere extends Error {}

const rendreCreux = (chemin) =>
  new Promise((ok) => {
    if (process.platform !== 'win32') return ok();
    execFile('fsutil', ['sparse', 'setflag', chemin], { windowsHide: true }, () => ok());
  });

const tailleDeBloc = (total, connexions) =>
  Math.min(BLOC_MAX, Math.max(BLOC_MIN, Math.ceil(total / (Math.max(1, connexions) * 8) / (1024 * 1024)) * 1024 * 1024));

const pause = (ms, signal) =>
  new Promise((ok, ko) => {
    if (signal.aborted) return ko(signal.reason);
    const t = setTimeout(() => {
      signal.removeEventListener('abort', stop);
      ok();
    }, ms);
    const stop = () => {
      clearTimeout(t);
      ko(signal.reason);
    };
    signal.addEventListener('abort', stop, { once: true });
  });

/**
 * @param {object} o
 * @param {string} o.url            lien direct
 * @param {string} o.chemin         fichier .part de destination
 * @param {object} o.etat           objet persistant { mode, taille, bloc, faits, octets } (modifié en place)
 * @param {number} [o.connexions]   connexions simultanées
 * @param {AbortSignal} o.signal
 * @param {() => Promise<string>} [o.rafraichirUrl]  redemande un lien quand l'ancien a expiré
 * @param {() => void} [o.surProgression]
 */
export async function telechargerFichier({ url, chemin, etat, connexions = 4, signal, rafraichirUrl, surProgression = () => {} }) {
  if (signal.aborted) throw signal.reason;
  const interne = new AbortController();
  const relayer = () => interne.abort(signal.reason);
  signal.addEventListener('abort', relayer, { once: true });

  let urlCourante = url;
  let renouvellement = null;
  const renouveler = async (urlEchouee) => {
    if (urlCourante !== urlEchouee) return; // un autre bloc l'a déjà renouvelée
    if (!rafraichirUrl) throw new ErreurTelechargement('Le lien de téléchargement a expiré.');
    renouvellement ??= rafraichirUrl()
      .then((u) => {
        urlCourante = u;
      })
      .finally(() => {
        renouvellement = null;
      });
    await renouvellement;
  };

  // Requête avec chien de garde : si plus rien n'arrive pendant 60 s, on coupe et on réessaie.
  async function requete(plage) {
    for (let renouvellements = 0; ; renouvellements++) {
      const u = urlCourante;
      const garde = new AbortController();
      const figee = () => garde.abort(new ErreurPassagere('Connexion figée'));
      let minuterie = setTimeout(figee, SILENCE_MAX);
      let res;
      try {
        res = await fetch(u, { headers: plage ? { Range: plage } : {}, signal: AbortSignal.any([interne.signal, garde.signal]) });
      } catch (e) {
        clearTimeout(minuterie);
        throw e;
      }
      if ([401, 403, 404, 410].includes(res.status) && renouvellements < 2) {
        clearTimeout(minuterie);
        await res.body?.cancel().catch(() => {});
        await renouveler(u);
        continue;
      }
      return {
        res,
        u,
        async *morceaux() {
          try {
            for await (const m of res.body) {
              clearTimeout(minuterie);
              minuterie = setTimeout(figee, SILENCE_MAX);
              yield m;
            }
          } finally {
            clearTimeout(minuterie);
          }
        },
        async abandonner() {
          clearTimeout(minuterie);
          await res.body?.cancel().catch(() => {});
        },
      };
    }
  }

  async function avecEssais(fn) {
    for (let essais = 1; ; essais++) {
      try {
        return await fn();
      } catch (e) {
        if (interne.signal.aborted) throw interne.signal.reason ?? e;
        if (e instanceof ErreurTelechargement) throw e;
        if (essais >= ESSAIS_MAX) throw new ErreurTelechargement(`Téléchargement impossible : ${e.message}${e.cause?.code ? ` (${e.cause.code})` : ""}`);
        await pause(Math.min(30_000, 1000 * 2 ** (essais - 1)), interne.signal);
      }
    }
  }

  // Sonde : le serveur accepte-t-il les plages (reprise + multi-connexions) ?
  async function sonder() {
    const r = await requete('bytes=0-0');
    const st = r.res.status;
    const plage = r.res.headers.get('content-range') || '';
    const longueur = Number(r.res.headers.get('content-length')) || 0;
    await r.abandonner();
    const total = Number(plage.split('/')[1]) || 0;
    if (st === 206 && total > 0) {
      Object.assign(etat, { mode: 'blocs', taille: total, bloc: tailleDeBloc(total, connexions), faits: [], partiels: {}, octets: 0 });
    }
    else if (r.res.ok) Object.assign(etat, { mode: 'flux', taille: longueur, octets: 0 });
    else if (st >= 500 || st === 429) throw new ErreurPassagere(`HTTP ${st}`);
    else throw new ErreurTelechargement(`Le serveur de téléchargement répond HTTP ${st}.`);
  }

  async function parBlocs() {
    const total = etat.taille;
    const bloc = etat.bloc;
    const nb = Math.ceil(total / bloc);
    const taille = (i) => Math.min(bloc, total - i * bloc);

    let fh;
    try {
      fh = await fsp.open(chemin, 'r+');
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
      await (await fsp.open(chemin, 'w')).close();
      await rendreCreux(chemin);
      fh = await fsp.open(chemin, 'r+');
      etat.faits = [];
      etat.partiels = {};
    }
    const faits = new Set(etat.faits);
    // bloc → octets déjà écrits sur le disque (sauvegardé : on reprend même au milieu d'un bloc)
    const ecrits = new Map(Object.entries(etat.partiels || {}).map(([i, n]) => [Number(i), n]));
    const memoriserPartiels = () => {
      etat.partiels = Object.fromEntries(ecrits);
    };
    const tampons = new Map(); // bloc → octets reçus pas encore écrits
    const aReprendre = [];
    let prochain = 0;
    let actifs = 0;
    let premiereErreur = null;

    const majOctets = () => {
      let s = 0;
      for (const i of faits) s += taille(i);
      for (const v of ecrits.values()) s += v;
      for (const v of tampons.values()) s += v;
      etat.octets = s;
    };
    majOctets();

    const suivant = () => {
      if (aReprendre.length) return aReprendre.shift();
      while (prochain < nb && faits.has(prochain)) prochain++;
      return prochain < nb ? prochain++ : -1;
    };

    async function telechargerBloc(i) {
      const debut = i * bloc;
      const fin = debut + taille(i) - 1;
      let essais = 0;
      let limitations = 0;
      let renouvelePour200 = false;
      for (;;) {
        const deja = ecrits.get(i) || 0;
        try {
          const r = await requete(`bytes=${debut + deja}-${fin}`);
          const st = r.res.status;
          // Connexion de trop refusée (421, 509 selon les serveurs) alors que d'autres tournent :
          // on la ferme et on continue avec les autres. (403 sert plutôt à renouveler un lien expiré.)
          if ([421, 509].includes(st) && actifs > 1) {
            await r.abandonner();
            return 'rendre';
          }
          if (st === 429 || st === 503) {
            // Le serveur limite : on ferme cette connexion s'il en reste d'autres,
            // sinon on attend le délai qu'il demande (sans compter ça comme un échec).
            const delai = Number(r.res.headers.get('retry-after')) || 0;
            await r.abandonner();
            if (actifs > 1) return 'rendre';
            if (++limitations > 40) throw new ErreurTelechargement(`Le serveur refuse le téléchargement (HTTP ${st}).`);
            await pause(Math.min(60, delai || 2 * limitations) * 1000, interne.signal);
            continue;
          }
          if (st === 200) {
            // Lien expiré qui renvoie une page d'erreur ? On redemande un lien une fois.
            await r.abandonner();
            if (!renouvelePour200) {
              renouvelePour200 = true;
              await renouveler(r.u);
              continue;
            }
            throw new ErreurTelechargement('Le serveur ne permet plus la reprise du téléchargement.');
          }
          if (st !== 206) {
            await r.abandonner();
            throw new ErreurPassagere(`HTTP ${st}`);
          }
          if (!(r.res.headers.get('content-range') || '').startsWith(`bytes ${debut + deja}-`)) {
            await r.abandonner();
            throw new ErreurPassagere('Plage inattendue');
          }
          let morceaux = [];
          let enAttente = 0;
          let ecrit = deja;
          const vider = async () => {
            if (!enAttente) return;
            const buf = morceaux.length === 1 ? morceaux[0] : Buffer.concat(morceaux, enAttente);
            await fh.write(buf, 0, enAttente, debut + ecrit);
            ecrit += enAttente;
            ecrits.set(i, ecrit);
            memoriserPartiels();
            morceaux = [];
            enAttente = 0;
            tampons.delete(i);
          };
          for await (const m of r.morceaux()) {
            morceaux.push(m);
            enAttente += m.length;
            tampons.set(i, enAttente);
            if (enAttente >= TAMPON) await vider();
          }
          await vider();
          majOctets();
          if (ecrit !== taille(i)) throw new ErreurPassagere('Bloc incomplet');
          return 'ok';
        } catch (e) {
          tampons.delete(i);
          if (interne.signal.aborted) throw interne.signal.reason ?? e;
          if (e instanceof ErreurTelechargement) throw e;
          if (++essais > ESSAIS_MAX) throw new ErreurTelechargement(`Téléchargement impossible : ${e.message}${e.cause?.code ? ` (${e.cause.code})` : ""}`);
          await pause(Math.min(30_000, 1000 * 2 ** (essais - 1)), interne.signal);
        }
      }
    }

    const ouvrier = async () => {
      actifs++;
      try {
        for (let i = suivant(); i !== -1; i = suivant()) {
          if ((await telechargerBloc(i)) === 'rendre') {
            aReprendre.push(i);
            return;
          }
          faits.add(i);
          ecrits.delete(i);
          etat.faits = [...faits];
          memoriserPartiels();
          majOctets();
          surProgression();
        }
      } catch (e) {
        premiereErreur ??= e;
        interne.abort(e);
      } finally {
        actifs--;
      }
    };

    const suivi = setInterval(majOctets, 500);
    try {
      await Promise.all(Array.from({ length: Math.max(1, Math.min(connexions, nb)) }, ouvrier));
    } finally {
      clearInterval(suivi);
      await fh.close();
    }
    if (premiereErreur) throw premiereErreur;
    if (faits.size !== nb) throw new ErreurTelechargement('Fichier incomplet.');
    etat.octets = total;
  }

  // Serveur sans reprise possible : un seul flux, depuis le début.
  async function enFlux() {
    await avecEssais(async () => {
      const r = await requete(null);
      if (!r.res.ok) {
        await r.abandonner();
        throw new ErreurPassagere(`HTTP ${r.res.status}`);
      }
      const fh = await fsp.open(chemin, 'w');
      try {
        let pos = 0;
        let morceaux = [];
        let n = 0;
        for await (const m of r.morceaux()) {
          morceaux.push(m);
          n += m.length;
          etat.octets = pos + n;
          if (n >= TAMPON) {
            await fh.write(Buffer.concat(morceaux, n), 0, n, pos);
            pos += n;
            morceaux = [];
            n = 0;
          }
        }
        if (n) {
          await fh.write(Buffer.concat(morceaux, n), 0, n, pos);
          pos += n;
        }
        if (etat.taille && pos !== etat.taille) throw new ErreurPassagere('Fichier incomplet');
        etat.taille ||= pos;
        etat.octets = pos;
      } finally {
        await fh.close();
      }
    });
  }

  try {
    if (!etat.mode) await avecEssais(sonder);
    if (etat.mode === 'blocs') await parBlocs();
    else await enFlux();
    return etat.taille;
  } finally {
    signal.removeEventListener('abort', relayer);
    interne.abort();
  }
}
