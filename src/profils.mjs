// Profils façon plateformes (« Qui regarde ? ») : un nom, un avatar, un mot de passe facultatif.
// Chaque profil a son propre historique de lecture, rangé HORS du dossier de l'application
// (%APPDATA%\Debrideur sous Windows) : si on donne l'application à quelqu'un, il ne récupère
// ni les profils ni l'historique, et chaque profil ne voit que le sien.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function dossierProfilsParDefaut() {
  if (process.env.DEBRIDEUR_PROFILS) return process.env.DEBRIDEUR_PROFILS;
  const base = process.env.APPDATA || (process.platform === 'darwin' ? path.join(os.homedir(), 'Library', 'Application Support') : path.join(os.homedir(), '.config'));
  return path.join(base, 'Debrideur');
}

export class ErreurProfil extends Error {
  constructor(message, statut = 400) {
    super(message);
    this.statut = statut;
  }
}

const NOM_MAX = 30;
const AVATAR_MAX = 300_000; // photo importée : data URL JPEG déjà réduite par la page
const id8 = () => crypto.randomBytes(4).toString('hex');

function ecrireAtomique(fichier, donnees) {
  fs.mkdirSync(path.dirname(fichier), { recursive: true });
  const tmp = `${fichier}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(donnees, null, 1));
  fs.renameSync(tmp, fichier);
}
function lire(fichier, defaut) {
  try {
    return JSON.parse(fs.readFileSync(fichier, 'utf8'));
  } catch {
    return defaut;
  }
}

function hacher(motDePasse, sel = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(String(motDePasse), sel, 32).toString('hex');
  return { sel, hash };
}
function verifierMotDePasse(motDePasse, { sel, hash }) {
  const essai = Buffer.from(hacher(motDePasse, sel).hash, 'hex');
  const attendu = Buffer.from(hash, 'hex');
  return essai.length === attendu.length && crypto.timingSafeEqual(essai, attendu);
}

function nettoyerNom(nom) {
  const n = String(nom || '').replace(/\s+/g, ' ').trim().slice(0, NOM_MAX);
  if (!n) throw new ErreurProfil('Choisis un nom.');
  return n;
}
function nettoyerAvatar(avatar) {
  const a = String(avatar || '');
  if (!a) return '';
  if (/^[a-z0-9-]{1,40}$/i.test(a)) return a; // avatar de la galerie
  if (/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(a) && a.length <= AVATAR_MAX) return a; // photo importée
  throw new ErreurProfil('Image de profil refusée (trop lourde ou format inconnu).');
}

export class Profils {
  constructor({ dossier = dossierProfilsParDefaut(), journal = () => {} } = {}) {
    this.dossier = dossier;
    this.journal = journal;
    this.fichier = path.join(dossier, 'profils.json');
    const d = lire(this.fichier, {});
    this.profils = Array.isArray(d.profils) ? d.profils : [];
    this.jetons = d.jetons && typeof d.jetons === 'object' ? d.jetons : {};
    this.echecs = new Map(); // id → { n, jusqua }
    this.historiques = new Map(); // id → objet chargé
    this.minuteries = new Map();
  }

  sauver() {
    ecrireAtomique(this.fichier, { profils: this.profils, jetons: this.jetons });
  }

  public(p) {
    return { id: p.id, nom: p.nom, avatar: p.avatar || '', protege: !!p.motDePasse, cree: p.cree };
  }
  liste() {
    return this.profils.map((p) => this.public(p));
  }
  trouver(id) {
    const p = this.profils.find((x) => x.id === id);
    if (!p) throw new ErreurProfil('Profil introuvable.', 404);
    return p;
  }

  creer({ nom, avatar, motDePasse } = {}) {
    if (this.profils.length >= 20) throw new ErreurProfil('Vingt profils au maximum.');
    const n = nettoyerNom(nom);
    if (this.profils.some((p) => p.nom.toLowerCase() === n.toLowerCase())) throw new ErreurProfil('Ce nom est déjà pris.');
    const p = { id: id8(), nom: n, avatar: nettoyerAvatar(avatar), cree: Date.now() };
    if (motDePasse) {
      if (String(motDePasse).length < 4) throw new ErreurProfil('Mot de passe trop court (4 caractères au moins).');
      p.motDePasse = hacher(motDePasse);
    }
    this.profils.push(p);
    this.sauver();
    this.journal(`Profil créé : ${p.nom}`);
    return this.public(p);
  }

  // Connexion : un jeton par appareil. Mot de passe vérifié s'il y en a un (5 essais, puis 30 s d'attente).
  connecter(id, motDePasse) {
    const p = this.trouver(id);
    if (p.motDePasse) {
      const e = this.echecs.get(id);
      if (e && e.jusqua > Date.now()) throw new ErreurProfil(`Trop d'essais : réessaie dans ${Math.ceil((e.jusqua - Date.now()) / 1000)} s.`, 429);
      if (!motDePasse || !verifierMotDePasse(motDePasse, p.motDePasse)) {
        const n = (e?.n || 0) + 1;
        this.echecs.set(id, { n: n >= 5 ? 0 : n, jusqua: n >= 5 ? Date.now() + 30_000 : 0 });
        throw new ErreurProfil('Mot de passe incorrect.', 401);
      }
      this.echecs.delete(id);
    }
    const jeton = crypto.randomBytes(24).toString('base64url');
    this.jetons[jeton] = { id, cree: Date.now() };
    this.sauver();
    return { jeton, profil: this.public(p) };
  }

  profilDuJeton(jeton) {
    const j = jeton && Object.prototype.hasOwnProperty.call(this.jetons, jeton) ? this.jetons[jeton] : null;
    const p = j && this.profils.find((x) => x.id === j.id);
    return p ? this.public(p) : null;
  }

  deconnecter(jeton) {
    if (jeton && this.jetons[jeton]) {
      delete this.jetons[jeton];
      this.sauver();
    }
  }

  modifier(id, { nom, avatar, motDePasse, retirerMotDePasse } = {}) {
    const p = this.trouver(id);
    if (nom !== undefined) {
      const n = nettoyerNom(nom);
      if (this.profils.some((x) => x !== p && x.nom.toLowerCase() === n.toLowerCase())) throw new ErreurProfil('Ce nom est déjà pris.');
      p.nom = n;
    }
    if (avatar !== undefined) p.avatar = nettoyerAvatar(avatar);
    if (retirerMotDePasse) delete p.motDePasse;
    else if (motDePasse) {
      if (String(motDePasse).length < 4) throw new ErreurProfil('Mot de passe trop court (4 caractères au moins).');
      p.motDePasse = hacher(motDePasse);
    }
    this.sauver();
    return this.public(p);
  }

  supprimer(id) {
    const p = this.trouver(id);
    this.profils = this.profils.filter((x) => x !== p);
    for (const [j, v] of Object.entries(this.jetons)) if (v.id === id) delete this.jetons[j];
    this.sauver();
    this.historiques.delete(id);
    try {
      fs.rmSync(this.fichierHistorique(id), { force: true });
    } catch {}
    this.journal(`Profil supprimé : ${p.nom}`);
  }

  // ---------- historique de lecture ----------
  // { [cléMédia]: { position, duree, vu, maj, fichier } } — la clé identifie le film ou l'épisode,
  // pas le fichier : changer de version (4K / 1080p) garde la position.

  fichierHistorique(id) {
    return path.join(this.dossier, 'historique', `${id}.json`);
  }
  historique(id) {
    this.trouver(id);
    if (!this.historiques.has(id)) this.historiques.set(id, lire(this.fichierHistorique(id), {}));
    return this.historiques.get(id);
  }
  sauverHistorique(id, tout = false) {
    clearTimeout(this.minuteries.get(id));
    const ecrire = () => {
      this.minuteries.delete(id);
      try {
        ecrireAtomique(this.fichierHistorique(id), this.historiques.get(id) || {});
      } catch (e) {
        this.journal(`Historique non sauvegardé (${e.message})`);
      }
    };
    if (tout) return ecrire();
    this.minuteries.set(id, setTimeout(ecrire, 2000));
  }
  sauverTout() {
    for (const id of this.historiques.keys()) this.sauverHistorique(id, true);
  }

  // Position pendant la lecture. Au-delà de 92 % (ou des 4 dernières minutes d'un film), c'est « vu ».
  enregistrerPosition(id, cle, { position, duree, fichier }) {
    const h = this.historique(id);
    const pos = Math.max(0, Number(position) || 0);
    const d = Math.max(0, Number(duree) || 0);
    const fini = d > 0 && (pos / d > 0.92 || d - pos < Math.min(240, d * 0.1));
    const avant = h[cle] || {};
    h[cle] = {
      position: fini ? 0 : pos,
      duree: d || avant.duree || 0,
      vu: fini || !!avant.vu,
      maj: Date.now(),
      fichier: fichier || avant.fichier || '',
      ...(fini ? { vuLe: Date.now() } : avant.vuLe ? { vuLe: avant.vuLe } : {}),
    };
    this.sauverHistorique(id);
    return h[cle];
  }

  marquerVu(id, cles, vu = true) {
    const h = this.historique(id);
    for (const cle of [].concat(cles)) {
      if (vu) h[cle] = { ...(h[cle] || {}), position: 0, vu: true, maj: Date.now(), vuLe: Date.now() };
      else delete h[cle];
    }
    this.sauverHistorique(id);
  }
}
