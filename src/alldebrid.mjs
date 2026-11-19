// Client minimal de l'API AllDebrid v4 — https://docs.alldebrid.com
// Toutes les requêtes passent en POST (form-data) avec « Authorization: Bearer <clé> ».

const BASE = process.env.DEBRIDEUR_AD_BASE || 'https://api.alldebrid.com';

const pause = (ms, signal) =>
  new Promise((ok, ko) => {
    if (signal?.aborted) return ko(signal.reason);
    const t = setTimeout(() => {
      signal?.removeEventListener('abort', stop);
      ok();
    }, ms);
    const stop = () => {
      clearTimeout(t);
      ko(signal.reason);
    };
    signal?.addEventListener('abort', stop, { once: true });
  });

const MESSAGES = {
  NO_KEY: 'Clé API AllDebrid pas encore configurée (bouton Réglages).',
  AUTH_MISSING_APIKEY: 'Clé API AllDebrid manquante.',
  AUTH_BAD_APIKEY: 'Clé API AllDebrid invalide.',
  AUTH_BLOCKED: "Clé API bloquée (géo ou IP) : valide-la depuis le mail qu'AllDebrid t'a envoyé.",
  AUTH_USER_BANNED: 'Compte AllDebrid banni.',
  LINK_IS_MISSING: 'Aucun lien envoyé.',
  LINK_HOST_NOT_SUPPORTED: 'Hébergeur non pris en charge par AllDebrid.',
  LINK_DOWN: "Lien mort chez l'hébergeur.",
  LINK_HOST_UNAVAILABLE: 'Hébergeur en maintenance ou indisponible.',
  LINK_TOO_MANY_DOWNLOADS: 'Trop de téléchargements en même temps pour cet hébergeur.',
  LINK_HOST_FULL: 'Serveurs AllDebrid pleins pour cet hébergeur, réessaie plus tard.',
  LINK_HOST_LIMIT_REACHED: 'Quota atteint pour cet hébergeur.',
  LINK_PASS_PROTECTED: 'Lien protégé par mot de passe.',
  LINK_ERROR: 'Erreur de débridage.',
  LINK_NOT_SUPPORTED: "Ce lien n'est pas pris en charge pour cet hébergeur.",
  LINK_TEMPORARY_UNAVAILABLE: "Lien temporairement indisponible chez l'hébergeur.",
  MUST_BE_PREMIUM: 'Il faut un compte AllDebrid premium.',
  FREE_TRIAL_LIMIT_REACHED: "Limite de l'essai gratuit atteinte.",
  NO_SERVER: 'AllDebrid refuse les connexions venant d’un serveur ou d’un VPN.',
  MAGNET_NO_SERVER: 'AllDebrid refuse les connexions venant d’un serveur ou d’un VPN.',
  MAGNET_NO_URI: 'Aucun magnet envoyé.',
  MAGNET_INVALID_URI: 'Magnet invalide.',
  MAGNET_INVALID_FILE: 'Fichier .torrent invalide.',
  MAGNET_FILE_UPLOAD_FAILED: "L'envoi du .torrent a échoué.",
  MAGNET_MUST_BE_PREMIUM: 'Il faut un compte AllDebrid premium pour les torrents.',
  MAGNET_TOO_MANY_ACTIVE: 'Trop de torrents en cours chez AllDebrid (30 maximum).',
  MAGNET_INVALID_ID: 'Torrent introuvable chez AllDebrid (supprimé ?).',
  REDIRECTOR_NOT_SUPPORTED: 'Protecteur de liens non pris en charge.',
  REDIRECTOR_ERROR: "Impossible d'extraire les liens du protecteur.",
  STREAM_INVALID_GEN_ID: 'Lien de streaming expiré.',
  STREAM_INVALID_STREAM_ID: 'Qualité de streaming invalide.',
  DELAYED_INVALID_ID: 'Lien différé expiré.',
};

export const ETATS_MAGNET = {
  0: "En file d'attente chez AllDebrid",
  1: 'AllDebrid télécharge le torrent',
  2: 'AllDebrid prépare les fichiers',
  3: 'AllDebrid met les fichiers en ligne',
  4: 'Prêt',
  5: 'AllDebrid : échec de mise en ligne',
  6: 'AllDebrid : erreur de décompression',
  7: 'AllDebrid : rien reçu en 20 min (aucune source ?)',
  8: 'AllDebrid : fichier trop gros',
  9: 'AllDebrid : erreur interne',
  10: 'AllDebrid : téléchargement de plus de 72 h abandonné',
  11: "AllDebrid : supprimé chez l'hébergeur",
  12: 'AllDebrid : traitement échoué',
  13: 'AllDebrid : traitement échoué',
  14: 'AllDebrid : erreur de tracker',
  15: 'AllDebrid : aucune source disponible pour ce torrent',
};

export const messageAllDebrid = (code, defaut) => MESSAGES[code] || defaut || 'Erreur AllDebrid inconnue.';

export class ErreurAllDebrid extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

export class ClientAllDebrid {
  constructor(lireCle) {
    this.lireCle = lireCle;
  }

  async appel(chemin, params = {}, { fichiers, signal } = {}) {
    const cle = this.lireCle();
    if (!cle) throw new ErreurAllDebrid('NO_KEY', MESSAGES.NO_KEY);
    const corps = new FormData();
    for (const [k, v] of Object.entries(params)) {
      if (Array.isArray(v)) v.forEach((x) => corps.append(k, String(x)));
      else if (v !== undefined && v !== null) corps.append(k, String(v));
    }
    for (const f of fichiers || []) {
      corps.append('files[]', new Blob([f.donnees], { type: 'application/x-bittorrent' }), f.nom);
    }
    for (let essai = 0; ; essai++) {
      let res;
      try {
        const sig = signal ? AbortSignal.any([signal, AbortSignal.timeout(30_000)]) : AbortSignal.timeout(30_000);
        res = await fetch(BASE + chemin, { method: 'POST', headers: { Authorization: `Bearer ${cle}` }, body: corps, signal: sig });
      } catch (e) {
        if (signal?.aborted) throw signal.reason;
        if (essai < 3) {
          await pause(2000 * (essai + 1), signal);
          continue;
        }
        throw new ErreurAllDebrid('NETWORK', `AllDebrid injoignable (${e.cause?.code || e.message}).`);
      }
      if ((res.status === 429 || res.status >= 500) && essai < 4) {
        await res.body?.cancel().catch(() => {});
        await pause(1500 * (essai + 1), signal);
        continue;
      }
      let json;
      try {
        json = await res.json();
      } catch {
        throw new ErreurAllDebrid('BAD_RESPONSE', `Réponse illisible d'AllDebrid (HTTP ${res.status}).`);
      }
      if (json.status !== 'success') {
        const e = json.error || {};
        throw new ErreurAllDebrid(e.code || 'UNKNOWN', MESSAGES[e.code] || e.message || 'Erreur AllDebrid inconnue.');
      }
      return json.data;
    }
  }

  async utilisateur() {
    return (await this.appel('/v4/user')).user;
  }

  // Débride un lien d'hébergeur (ou un lien alldebrid.com/f/… issu d'un torrent).
  // Gère les liens « différés » et les liens de streaming à plusieurs qualités.
  async deverrouiller(lien, signal) {
    let d = await this.appel('/v4/link/unlock', { link: lien }, { signal });
    if (!d.link && Array.isArray(d.streams) && d.streams.length) {
      const videos = d.streams.filter((s) => s.ext !== 'mp3' && s.quality !== 'mp3');
      const meilleur = (videos.length ? videos : d.streams).sort((a, b) => (Number(b.quality) || 0) - (Number(a.quality) || 0))[0];
      const s = await this.appel('/v4/link/streaming', { id: d.id, stream: meilleur.id }, { signal });
      d = { ...d, ...s, filename: s.filename || d.filename, filesize: s.filesize || d.filesize };
    }
    if (!d.link && d.delayed) {
      const limite = Date.now() + 15 * 60_000;
      for (;;) {
        await pause(5000, signal);
        const r = await this.appel('/v4/link/delayed', { id: d.delayed }, { signal });
        if (r.status === 2 && r.link) {
          d.link = r.link;
          break;
        }
        if (r.status === 3) throw new ErreurAllDebrid('DELAYED_FAILED', "AllDebrid n'a pas réussi à générer le lien.");
        if (Date.now() > limite) throw new ErreurAllDebrid('DELAYED_TIMEOUT', 'AllDebrid met trop de temps à générer le lien.');
      }
    }
    if (!d.link) throw new ErreurAllDebrid('NO_LINK', "AllDebrid n'a renvoyé aucun lien de téléchargement.");
    return { url: d.link, nom: d.filename || nomDepuisUrl(d.link), taille: Number(d.filesize) || 0 };
  }

  // Hébergeurs et protecteurs de liens pris en charge : Map(domaine → nom).
  async hebergeurs(signal) {
    const d = await this.appel('/v4/hosts', {}, { signal });
    const carte = (groupe) => {
      const m = new Map();
      for (const h of Object.values(groupe || {})) {
        for (const dom of h.domains || []) m.set(String(dom).toLowerCase().replace(/^www\./, ''), h.name || dom);
      }
      return m;
    };
    return { hebergeurs: carte(d.hosts), redirecteurs: carte(d.redirectors) };
  }

  // État de liens d'hébergeurs sans les débrider : [{ link, filename, size } | { link, error: { code, message } }].
  async infosLiens(liens, signal) {
    const d = await this.appel('/v4/link/infos', { 'link[]': liens }, { signal });
    return Array.isArray(d.infos) ? d.infos : Object.values(d.infos || {});
  }

  // Liens protégés (dl-protect & co) → liens chiffrés utilisables par deverrouiller().
  async redirecteur(lien, signal) {
    return (await this.appel('/v4/link/redirector', { link: lien }, { signal })).links || [];
  }

  async envoyerMagnet(magnet, signal) {
    const m = (await this.appel('/v4/magnet/upload', { 'magnets[]': [magnet] }, { signal })).magnets?.[0];
    if (!m) throw new ErreurAllDebrid('MAGNET_NO_URI', MESSAGES.MAGNET_NO_URI);
    if (m.error) throw new ErreurAllDebrid(m.error.code, MESSAGES[m.error.code] || m.error.message);
    return m;
  }

  async envoyerTorrent(nom, donnees, signal) {
    const f = (await this.appel('/v4/magnet/upload/file', {}, { fichiers: [{ nom, donnees }], signal })).files?.[0];
    if (!f) throw new ErreurAllDebrid('MAGNET_FILE_UPLOAD_FAILED', MESSAGES.MAGNET_FILE_UPLOAD_FAILED);
    if (f.error) throw new ErreurAllDebrid(f.error.code, MESSAGES[f.error.code] || f.error.message);
    return f;
  }

  async statutMagnet(id, signal) {
    const d = await this.appel('/v4.1/magnet/status', { id }, { signal });
    const m = Array.isArray(d.magnets) ? d.magnets[0] : d.magnets;
    if (!m) throw new ErreurAllDebrid('MAGNET_INVALID_ID', MESSAGES.MAGNET_INVALID_ID);
    return m;
  }

  // Torrents déjà prêts dans le compte AllDebrid.
  async magnetsPrets(signal) {
    const d = await this.appel('/v4.1/magnet/status', { status: 'ready' }, { signal });
    const liste = Array.isArray(d.magnets) ? d.magnets : Object.values(d.magnets || {});
    return liste.filter((m) => Number(m.statusCode) === 4);
  }

  // Fichiers de plusieurs torrents d'un coup → Map(id → liste à plat).
  async fichiersDeMagnets(ids, signal) {
    const resultat = new Map();
    for (let i = 0; i < ids.length; i += 50) {
      const d = await this.appel('/v4/magnet/files', { 'id[]': ids.slice(i, i + 50) }, { signal });
      const liste = Array.isArray(d.magnets) ? d.magnets : Object.values(d.magnets || {});
      for (const m of liste) if (!m.error) resultat.set(String(m.id), aplatir(m.files));
    }
    return resultat;
  }

  // Renvoie la liste à plat des fichiers du torrent : { chemin, nom, taille, lien }.
  async fichiersMagnet(id, signal) {
    const d = await this.appel('/v4/magnet/files', { 'id[]': [id] }, { signal });
    const liste = Array.isArray(d.magnets) ? d.magnets : Object.values(d.magnets || {});
    const m = liste.find((x) => String(x.id) === String(id)) || liste[0];
    if (!m) throw new ErreurAllDebrid('MAGNET_INVALID_ID', MESSAGES.MAGNET_INVALID_ID);
    if (m.error) throw new ErreurAllDebrid(m.error.code, MESSAGES[m.error.code] || m.error.message);
    return aplatir(m.files);
  }
}

function aplatir(noeuds, prefixe = '') {
  const sortie = [];
  for (const n of noeuds || []) {
    if (Array.isArray(n.e)) sortie.push(...aplatir(n.e, `${prefixe}${n.n}/`));
    else if (n.l) sortie.push({ chemin: prefixe + n.n, nom: n.n, taille: Number(n.s) || 0, lien: n.l });
  }
  return sortie;
}

function nomDepuisUrl(url) {
  try {
    return decodeURIComponent(new URL(url).pathname.split('/').pop()) || 'fichier';
  } catch {
    return 'fichier';
  }
}
