// File des téléchargements : débridage, attente des torrents chez AllDebrid,
// téléchargement, puis rangement dans les bibliothèques Jellyfin.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { ClientAllDebrid, ETATS_MAGNET } from './alldebrid.mjs';
import { planifier } from './classer.mjs';
import { telechargerFichier } from './telechargeur.mjs';

const FINAUX = new Set(['termine', 'erreur', 'annule']);
const ANNULATION = Symbol('annulation');

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

export function formaterTaille(o) {
  if (!o) return '0 o';
  const unites = ['o', 'Ko', 'Mo', 'Go', 'To'];
  const i = Math.min(4, Math.floor(Math.log(o) / Math.log(1024)));
  return `${(o / 1024 ** i).toLocaleString('fr-FR', { maximumFractionDigits: i >= 3 ? 1 : 0 })} ${unites[i]}`;
}

// Reconnaît ce qu'on a collé : magnet, hash, lien .torrent ou lien d'hébergeur.
export function analyserSource(s) {
  if (/^magnet:\?/i.test(s)) {
    const params = new URLSearchParams(s.slice(8));
    const hash = s.match(/btih:([a-z0-9]+)/i)?.[1];
    if (!hash) return null;
    return { type: 'magnet', titre: params.get('dn') || hash };
  }
  if (/^[a-f0-9]{40}$/i.test(s) || /^[a-z2-7]{32}$/i.test(s)) return { type: 'magnet', titre: s.toLowerCase() };
  if (/^https?:\/\/\S+$/i.test(s)) {
    let u;
    try {
      u = new URL(s);
    } catch {
      return null;
    }
    if (/\.torrent$/i.test(u.pathname)) return { type: 'torrent-url', titre: decodeURIComponent(u.pathname.split('/').pop()) };
    return { type: 'lien', titre: s };
  }
  return null;
}

function destinationLibre(dest, taille, reservees) {
  const p = path.parse(dest);
  for (let n = 2, essai = dest; ; essai = path.join(p.dir, `${p.name} (${n++})${p.ext}`)) {
    if (reservees.has(essai.toLowerCase())) continue;
    let st = null;
    try {
      st = fs.statSync(essai);
    } catch {}
    if (!st) return { dest: essai, deja: false };
    if (taille > 0 && st.size === taille) return { dest: essai, deja: true };
  }
}

async function deplacer(source, dest, taille) {
  await fsp.mkdir(path.dirname(dest), { recursive: true });
  const p = path.parse(dest);
  let cible = dest;
  for (let n = 2; fs.existsSync(cible); n++) {
    if (fs.statSync(cible).size === taille) {
      await fsp.unlink(source);
      return cible;
    }
    cible = path.join(p.dir, `${p.name} (${n})${p.ext}`);
  }
  try {
    await fsp.rename(source, cible);
  } catch (e) {
    if (e.code !== 'EXDEV') throw e;
    await fsp.copyFile(source, cible);
    await fsp.unlink(source);
  }
  return cible;
}

const tailleFichier = (f) => f.progression?.taille || f.taille || 0;

function bilan(job) {
  let fait = 0;
  let total = 0;
  for (const f of job.fichiers) {
    if (f.etat === 'deja') continue;
    const t = tailleFichier(f);
    total += t;
    fait += f.etat === 'ok' ? t : Math.min(t || Infinity, f.progression?.octets || 0);
  }
  return { fait, total };
}

export class Gestionnaire {
  constructor({ config, dossierDonnees, journal = console.log, surTermine = () => {} }) {
    this.surTermine = surTermine;
    this.config = config;
    this.journal = journal;
    this.fichierJobs = path.join(dossierDonnees, 'jobs.json');
    this.dossierTorrents = path.join(dossierDonnees, 'torrents');
    this.ad = new ClientAllDebrid(() => this.config.cleApi);
    this.jobs = [];
    this.controles = new Map();
    this.vitesses = new Map();
    this.creneauxPris = 0;
    this.fileCreneaux = [];
    this.minuterieSauvegarde = null;
    this.charger();
    setInterval(() => this.mesurerVitesses(), 1000).unref();
  }

  // ---------- persistance ----------

  charger() {
    try {
      this.jobs = JSON.parse(fs.readFileSync(this.fichierJobs, 'utf8'));
    } catch {
      this.jobs = [];
    }
    for (const job of this.jobs) {
      if (FINAUX.has(job.etat)) continue;
      job.etat = 'attente';
      job.message = 'Reprise après redémarrage';
      for (const f of job.fichiers) {
        if (f.etat === 'en cours' || f.etat === 'erreur') f.etat = 'attente';
        f.url = null; // les liens directs expirent : on les redemandera
      }
    }
    for (const job of this.jobs) if (job.etat === 'attente') this.lancer(job);
  }

  sauverMaintenant() {
    clearTimeout(this.minuterieSauvegarde);
    this.minuterieSauvegarde = null;
    const tmp = `${this.fichierJobs}.tmp`;
    fs.mkdirSync(path.dirname(this.fichierJobs), { recursive: true });
    fs.writeFileSync(tmp, JSON.stringify(this.jobs, null, 1));
    fs.renameSync(tmp, this.fichierJobs);
  }

  changer() {
    this.minuterieSauvegarde ??= setTimeout(() => {
      try {
        this.sauverMaintenant();
      } catch (e) {
        this.journal(`Sauvegarde impossible : ${e.message}`);
      }
    }, 2000);
  }

  // ---------- vue pour la page ----------

  mesurerVitesses() {
    const t = Date.now();
    for (const job of this.jobs) {
      if (job.etat !== 'telechargement') {
        this.vitesses.delete(job.id);
        continue;
      }
      this.changer(); // sauvegarde régulière : on reprend là où on en était si le PC s'éteint
      const { fait } = bilan(job);
      const v = this.vitesses.get(job.id);
      if (!v) {
        this.vitesses.set(job.id, { fait, t, vitesse: 0 });
        continue;
      }
      const instant = Math.max(0, (fait - v.fait) / ((t - v.t) / 1000));
      v.vitesse = v.vitesse ? v.vitesse * 0.6 + instant * 0.4 : instant;
      v.fait = fait;
      v.t = t;
    }
  }

  instantane() {
    return this.jobs.map((j) => {
      const { fait, total } = bilan(j);
      const vitesse = this.vitesses.get(j.id)?.vitesse || 0;
      return {
        id: j.id,
        titre: j.titre,
        type: j.type,
        mode: j.mode,
        etat: j.etat,
        message: j.message,
        cree: j.cree,
        fini: j.fini || null,
        torrent: j.torrent || null,
        fait,
        total,
        vitesse,
        reste: vitesse > 0 && total > fait ? (total - fait) / vitesse : null,
        fichiers: j.fichiers.map((f) => ({
          nom: f.nom,
          dest: f.dest,
          taille: tailleFichier(f),
          etat: f.etat,
          categorie: f.categorie,
          sousTitre: f.sousTitre,
          fait: f.etat === 'ok' || f.etat === 'deja' ? tailleFichier(f) : f.progression?.octets || 0,
        })),
      };
    });
  }

  // ---------- ajouts ----------

  ajouterSources(texte, mode = 'auto') {
    const ajoutes = [];
    const refuses = [];
    const elements = String(texte || '')
      .split(/\r?\n/)
      .flatMap((l) => l.trim().split(/\s+(?=magnet:\?|https?:\/\/)/i))
      .map((s) => s.trim())
      .filter(Boolean);
    for (const source of elements) {
      const a = analyserSource(source);
      if (!a) {
        refuses.push(source);
        continue;
      }
      ajoutes.push(this.creer({ source, mode, ...a }).id);
    }
    return { ajoutes, refuses };
  }

  // Liens choisis dans la recherche : chacun peut avoir des liens de secours (même fichier chez
  // d'autres hébergeurs), essayés si le premier est mort au moment du débridage.
  ajouterLiens(liste, mode = 'auto') {
    const ajoutes = [];
    const refuses = [];
    for (const item of Array.isArray(liste) ? liste.slice(0, 5000) : []) {
      const source = String(item?.lien || '').trim();
      const a = analyserSource(source);
      if (!a) {
        refuses.push(source);
        continue;
      }
      const secours = (Array.isArray(item.secours) ? item.secours : [])
        .map((l) => String(l).trim())
        .filter((l) => l !== source && analyserSource(l)?.type === 'lien')
        .slice(0, 10);
      ajoutes.push(this.creer({ source, mode, ...a, secours: a.type === 'lien' ? secours : [] }).id);
    }
    return { ajoutes, refuses };
  }

  async ajouterTorrent(nom, donnees, mode = 'auto') {
    if (!donnees.length || donnees[0] !== 0x64) throw new Error(`${nom} n'est pas un fichier .torrent valide.`);
    const id = crypto.randomBytes(4).toString('hex');
    await fsp.mkdir(this.dossierTorrents, { recursive: true });
    const fichierTorrent = path.join(this.dossierTorrents, `${id}.torrent`);
    await fsp.writeFile(fichierTorrent, donnees);
    return this.creer({ id, source: nom, type: 'torrent', mode, titre: nom.replace(/\.torrent$/i, ''), fichierTorrent }).id;
  }

  // Torrent déjà présent dans le compte AllDebrid : pas besoin de le renvoyer.
  ajouterMagnetExistant(magnetId, titre, mode = 'auto') {
    const id = Number(magnetId);
    if (!Number.isInteger(id) || id <= 0) throw new Error('Identifiant de torrent invalide.');
    return this.creer({ source: `alldebrid:${id}`, type: 'magnet', mode, titre: String(titre || `Torrent ${id}`), magnetId: id }).id;
  }

  creer({ id, source, type, mode, titre, fichierTorrent, magnetId, secours = [] }) {
    const job = {
      id: id || crypto.randomBytes(4).toString('hex'),
      source,
      secours,
      type,
      mode: ['auto', 'film', 'serie', 'manga'].includes(mode) ? mode : 'auto',
      titre,
      etat: 'attente',
      message: '',
      cree: Date.now(),
      fichiers: [],
      magnetId: magnetId || null,
      fichierTorrent: fichierTorrent || null,
    };
    this.jobs.push(job);
    this.journal(`Ajouté [${job.type}] ${job.titre}`);
    this.changer();
    this.lancer(job);
    return job;
  }

  // ---------- actions ----------

  trouver(id) {
    return this.jobs.find((j) => j.id === id);
  }

  annuler(id) {
    const job = this.trouver(id);
    if (!job || FINAUX.has(job.etat)) return false;
    const c = this.controles.get(id);
    if (c) c.abort(ANNULATION);
    else this.finirAnnulation(job);
    return true;
  }

  async finirAnnulation(job) {
    job.etat = 'annule';
    job.message = 'Annulé';
    job.torrent = null;
    for (const f of job.fichiers) {
      if (f.etat === 'ok' || f.etat === 'deja') continue;
      await fsp.rm(f.part, { force: true }).catch(() => {});
      f.progression = {};
      f.etat = 'attente';
    }
    this.changer();
  }

  relancer(id) {
    const job = this.trouver(id);
    if (!job || !['erreur', 'annule'].includes(job.etat)) return false;
    // échec côté AllDebrid : on renvoie le torrent (sauf s'il venait directement du compte)
    if (!job.fichiers.length && !job.source.startsWith('alldebrid:')) job.magnetId = null;
    for (const f of job.fichiers) {
      if (f.etat === 'erreur' || f.etat === 'en cours') f.etat = 'attente';
      f.url = null;
    }
    job.etat = 'attente';
    job.message = '';
    job.fini = null;
    this.lancer(job);
    this.changer();
    return true;
  }

  async retirer(id) {
    const job = this.trouver(id);
    if (!job || !FINAUX.has(job.etat)) return false;
    for (const f of job.fichiers) if (f.etat !== 'ok') await fsp.rm(f.part, { force: true }).catch(() => {});
    if (job.fichierTorrent) await fsp.rm(job.fichierTorrent, { force: true }).catch(() => {});
    this.jobs = this.jobs.filter((j) => j !== job);
    this.changer();
    return true;
  }

  async retirerTermines() {
    for (const j of this.jobs.filter((x) => x.etat === 'termine')) await this.retirer(j.id);
  }

  // ---------- déroulement ----------

  lancer(job) {
    if (this.controles.has(job.id)) return;
    const ctrl = new AbortController();
    this.controles.set(job.id, ctrl);
    this.executer(job, ctrl.signal).finally(() => {
      this.controles.delete(job.id);
      this.changer();
    });
  }

  async executer(job, signal) {
    try {
      if (!job.fichiers.length) await this.preparer(job, signal);
      await this.telecharger(job, signal);
      const videos = job.fichiers.filter((f) => !f.sousTitre);
      const ok = videos.filter((f) => f.etat === 'ok').length;
      const deja = videos.filter((f) => f.etat === 'deja').length;
      const pluriel = (n, mot) => `${n} ${mot}${n > 1 ? 's' : ''}`;
      job.etat = 'termine';
      job.message = [ok && `${pluriel(ok, 'vidéo')} rangée${ok > 1 ? 's' : ''}`, deja && `${pluriel(deja, 'vidéo')} déjà présente${deja > 1 ? 's' : ''}`]
        .filter(Boolean)
        .join(' · ');
      job.fini = Date.now();
      this.journal(`Terminé : ${job.titre}`);
      if (ok) this.surTermine(job);
    } catch (e) {
      if (signal.aborted && signal.reason === ANNULATION) {
        await this.finirAnnulation(job);
        this.journal(`Annulé : ${job.titre}`);
        return;
      }
      job.etat = 'erreur';
      job.message = e?.message || String(e);
      job.torrent = null;
      this.journal(`Erreur sur ${job.titre} : ${job.message}`);
    }
  }

  async preparer(job, signal) {
    job.etat = 'preparation';
    this.changer();
    let fichiers;
    let contexte = '';

    if (job.type === 'torrent-url') {
      job.message = 'Récupération du .torrent…';
      const res = await fetch(job.source, { signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]) });
      if (!res.ok) throw new Error(`Impossible de récupérer le .torrent (HTTP ${res.status}).`);
      const donnees = Buffer.from(await res.arrayBuffer());
      if (donnees.length > 10e6 || donnees[0] !== 0x64) throw new Error('Ce lien ne renvoie pas un fichier .torrent.');
      await fsp.mkdir(this.dossierTorrents, { recursive: true });
      job.fichierTorrent = path.join(this.dossierTorrents, `${job.id}.torrent`);
      await fsp.writeFile(job.fichierTorrent, donnees);
      job.type = 'torrent';
    }

    if (job.type === 'magnet' || job.type === 'torrent') {
      if (!job.magnetId) {
        job.message = 'Envoi à AllDebrid…';
        this.changer();
        const m =
          job.type === 'magnet'
            ? await this.ad.envoyerMagnet(job.source, signal)
            : await this.ad.envoyerTorrent(path.basename(job.source), await fsp.readFile(job.fichierTorrent), signal);
        job.magnetId = m.id;
        if (m.name && m.name !== 'noname') job.titre = m.name;
        this.changer();
      }
      await this.attendreTorrent(job, signal);
      job.message = 'Liste des fichiers…';
      fichiers = await this.ad.fichiersMagnet(job.magnetId, signal);
      contexte = job.titre;
    } else {
      fichiers = await this.debriderLien(job, signal);
      job.titre = fichiers.length === 1 ? fichiers[0].nom : `${fichiers[0].nom} (+${fichiers.length - 1})`;
    }

    const plan = planifier(fichiers, { mode: job.mode, contexte, dossiers: this.config.dossiers });
    if (!plan.some((p) => !p.sousTitre)) {
      const noms = fichiers.map((f) => f.nom);
      const apercu = `${noms.slice(0, 3).join(', ')}${noms.length > 3 ? '…' : ''}`;
      const archive = noms.some((n) => /\.(rar|zip|7z|r\d\d)$/i.test(n));
      throw new Error(archive ? `C'est une archive, pas une vidéo (${apercu}) : pas encore géré.` : `Aucune vidéo dedans (${apercu}).`);
    }

    const reservees = new Set(
      this.jobs.filter((j) => j !== job && !FINAUX.has(j.etat)).flatMap((j) => j.fichiers.map((f) => f.dest.toLowerCase())),
    );
    job.fichiers = plan.map((p, i) => {
      const { dest, deja } = destinationLibre(p.dest, p.taille, reservees);
      reservees.add(dest.toLowerCase());
      return {
        nom: p.nom,
        taille: p.taille,
        lien: p.lien,
        url: p.url || null,
        dest,
        categorie: p.categorie,
        sousTitre: !!p.sousTitre,
        etat: deja ? 'deja' : 'attente',
        part: path.join(this.config.dossierTemp, `${job.id}-${i}.part`),
        progression: {},
      };
    });
    job.message = '';
    this.changer();
  }

  // Débride le lien du job ; s'il est mort, essaie ses liens de secours (autres hébergeurs).
  async debriderLien(job, signal) {
    const liens = [job.source, ...(job.secours || [])];
    let premiereErreur = null;
    for (const [n, lien] of liens.entries()) {
      try {
        if (n) {
          job.message = `Lien mort, essai d'un autre hébergeur (${n}/${liens.length - 1})…`;
          this.changer();
        }
        return await this.debriderUnLien(job, lien, signal);
      } catch (e) {
        if (signal.aborted) throw e;
        premiereErreur ??= e;
        if (n < liens.length - 1) this.journal(`Lien inutilisable (${e.message}), essai du secours suivant : ${job.titre}`);
      }
    }
    throw premiereErreur;
  }

  async debriderUnLien(job, source, signal) {
    job.message = 'Débridage…';
    this.changer();
    try {
      const r = await this.ad.deverrouiller(source, signal);
      return [{ chemin: r.nom, nom: r.nom, taille: r.taille, lien: source, url: r.url }];
    } catch (e) {
      if (signal.aborted || !['LINK_HOST_NOT_SUPPORTED', 'LINK_NOT_SUPPORTED'].includes(e.code)) throw e;
      // Peut-être un protecteur de liens (dl-protect…) : on récupère les liens qu'il cache.
      let liens;
      try {
        liens = await this.ad.redirecteur(source, signal);
      } catch {
        throw e;
      }
      if (!liens.length) throw e;
      job.message = `Protecteur de liens : ${liens.length} lien${liens.length > 1 ? 's' : ''} trouvé${liens.length > 1 ? 's' : ''}…`;
      this.changer();
      const fichiers = [];
      const erreurs = [];
      for (const l of liens) {
        try {
          const r = await this.ad.deverrouiller(l, signal);
          if (!fichiers.some((f) => f.nom === r.nom && f.taille === r.taille)) {
            fichiers.push({ chemin: r.nom, nom: r.nom, taille: r.taille, lien: l, url: r.url });
          }
        } catch (e2) {
          if (signal.aborted) throw e2;
          erreurs.push(e2.message);
        }
      }
      if (!fichiers.length) throw new Error(erreurs[0] || e.message);
      return fichiers;
    }
  }

  async attendreTorrent(job, signal) {
    for (;;) {
      const m = await this.ad.statutMagnet(job.magnetId, signal);
      const code = Number(m.statusCode);
      if (code === 4) {
        job.torrent = null;
        return;
      }
      if (code >= 5) throw new Error(ETATS_MAGNET[code] || m.status || 'Erreur AllDebrid.');
      job.etat = 'torrent';
      job.message = ETATS_MAGNET[code] || m.status;
      job.torrent = { fait: Number(m.downloaded) || 0, total: Number(m.size) || 0, vitesse: Number(m.downloadSpeed) || 0, sources: m.seeders ?? null };
      this.changer();
      await pause(code === 0 ? 5000 : 3000, signal);
    }
  }

  prendreCreneau(signal) {
    if (this.creneauxPris < (this.config.simultanes || 1)) {
      this.creneauxPris++;
      return Promise.resolve();
    }
    return new Promise((ok, ko) => {
      const entree = {
        ok: () => {
          signal.removeEventListener('abort', abandon);
          this.creneauxPris++;
          ok();
        },
      };
      const abandon = () => {
        this.fileCreneaux = this.fileCreneaux.filter((x) => x !== entree);
        ko(signal.reason);
      };
      signal.addEventListener('abort', abandon, { once: true });
      this.fileCreneaux.push(entree);
    });
  }

  libererCreneau() {
    this.creneauxPris--;
    this.ajusterCreneaux();
  }

  // Après un changement du nombre de téléchargements simultanés : on lance ceux qui attendaient.
  ajusterCreneaux() {
    while (this.creneauxPris < (this.config.simultanes || 1) && this.fileCreneaux.length) this.fileCreneaux.shift().ok();
  }

  async telecharger(job, signal) {
    const restants = job.fichiers.filter((f) => f.etat !== 'ok' && f.etat !== 'deja');
    if (!restants.length) return;

    const besoin = restants.reduce((s, f) => s + Math.max(0, tailleFichier(f) - (f.progression?.octets || 0)), 0);
    await fsp.mkdir(this.config.dossierTemp, { recursive: true });
    const st = await fsp.statfs(this.config.dossierTemp);
    const libre = st.bavail * st.bsize;
    if (besoin + 2 * 1024 ** 3 > libre) {
      throw new Error(`Pas assez de place sur le disque : il faut ${formaterTaille(besoin)}, il reste ${formaterTaille(libre)}.`);
    }

    job.etat = 'file';
    job.message = "En attente de la fin d'un autre téléchargement…";
    this.changer();
    await this.prendreCreneau(signal);
    try {
      job.etat = 'telechargement';
      for (const [n, f] of restants.entries()) {
        job.message = restants.length > 1 ? `Fichier ${n + 1} sur ${restants.length}` : '';
        f.etat = 'en cours';
        this.changer();
        const nouvelleUrl = async () => {
          f.url = (await this.ad.deverrouiller(f.lien, signal)).url;
          return f.url;
        };
        try {
          if (!f.url) await nouvelleUrl();
          const taille = await telechargerFichier({
            url: f.url,
            chemin: f.part,
            etat: f.progression,
            connexions: this.config.connexions || 4,
            signal,
            rafraichirUrl: nouvelleUrl,
            surProgression: () => this.changer(),
          });
          f.dest = await deplacer(f.part, f.dest, taille);
          f.taille = taille;
          f.progression = { taille, octets: taille };
          f.etat = 'ok';
          this.journal(`Rangé : ${f.dest}`);
          this.changer();
        } catch (e) {
          if (!signal.aborted) f.etat = 'erreur';
          throw e;
        }
      }
    } finally {
      this.libererCreneau();
    }
  }
}
