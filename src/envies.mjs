// Liste d'envies : les films et les saisons de séries qu'on veut, et qu'Ondi va chercher tout seul.
// Pour chaque envie en attente, Ondi interroge régulièrement les sources de recherche activées, ne garde
// que les versions qui sont bien ce film (ou cette saison) ET qui conviennent au profil voulu (4K, VF et
// VO dans le même fichier…), envoie la meilleure au débrideur, puis suit son téléchargement.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { normaliser } from './titres.mjs';
import { lireVersion, correspondAuVoeu } from './versions.mjs';
import { ErreurSource } from './moteur-sources.mjs';

export class ErreurEnvie extends Error {}

const HEURE = 3600_000;
// Entre deux recherches d'une même envie ; plus vite après un téléchargement raté (une autre version est tentée).
const DELAI = 6 * HEURE;
const DELAI_APRES_ECHEC = 10 * 60_000;
// Une envie arrivée dans la bibliothèque reste affichée un mois, puis quitte la liste.
const GARDE_TERMINEE = 30 * 24 * HEURE;
const MAX = 300;

const texte = (v, max = 200) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const entier = (v, min, max) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
};

export class Envies {
  // sources : la recherche groupée (src/sources.mjs) ; gestionnaire : les téléchargements ;
  // profil : () => le profil de version voulu ; delai : temps entre deux recherches d'une envie.
  constructor({ dossier, sources, gestionnaire, profil = () => null, journal = () => {}, maintenant = () => Date.now(), delai = DELAI }) {
    Object.assign(this, { sources, gestionnaire, profil, journal, maintenant, delai });
    this.fichier = path.join(dossier, 'envies.json');
    this.envies = [];
    try {
      const lu = JSON.parse(fs.readFileSync(this.fichier, 'utf8'));
      if (Array.isArray(lu.envies)) this.envies = lu.envies.filter((e) => e && typeof e.id === 'string' && e.titre);
    } catch {}
    this.occupees = new Set();
    this.tourEnCours = false;
    this.minuterie = null;
  }

  sauver() {
    fs.mkdirSync(path.dirname(this.fichier), { recursive: true });
    fs.writeFileSync(this.fichier, JSON.stringify({ envies: this.envies }, null, 2));
  }

  // Ce que la page reçoit d'une envie.
  decrire(e) {
    const job = e.job ? this.gestionnaire.trouver(e.job) : null;
    return {
      id: e.id, type: e.type, titre: e.titre, titreOriginal: e.titreOriginal, annee: e.annee, saison: e.saison, affiche: e.affiche,
      ajoutee: e.ajoutee, etat: e.etat, message: e.message, essais: e.essais, verifiee: e.verifiee,
      prochaine: e.etat === 'attente' ? e.prochaine : null,
      version: e.version ? { nom: e.version.nom, taille: e.version.taille, source: e.version.source, date: e.version.date } : null,
      job: e.job, telechargement: job ? job.etat : null, terminee: e.terminee || null,
      enRecherche: this.occupees.has(e.id),
    };
  }

  // En attente d'abord (les plus récentes en tête), puis en cours de téléchargement, puis arrivées.
  liste() {
    const rang = { attente: 0, envoyee: 1, terminee: 2 };
    return [...this.envies].sort((a, b) => rang[a.etat] - rang[b.etat] || b.ajoutee - a.ajoutee).map((e) => this.decrire(e));
  }

  trouver(id) {
    const e = this.envies.find((x) => x.id === id);
    if (!e) throw new ErreurEnvie('Cette envie n’est plus dans la liste.');
    return e;
  }

  // d : { type ('film' | 'serie'), titre, titreOriginal, annee, tmdb, affiche, saison (série) }
  ajouter(d) {
    const type = d?.type === 'serie' ? 'serie' : d?.type === 'film' ? 'film' : null;
    const titre = texte(d?.titre);
    if (!type || !titre) throw new ErreurEnvie('Il faut un titre, et dire si c’est un film ou une série.');
    const saison = type === 'serie' ? (entier(d.saison, 0, 99) ?? 1) : null;
    const annee = entier(d.annee, 1880, 2100);
    const tmdb = entier(d.tmdb, 1, 1e9);
    let titreOriginal = texte(d.titreOriginal);
    if (normaliser(titreOriginal) === normaliser(titre)) titreOriginal = '';
    // Affiche : seulement une image de TMDB (la page ne charge pas d'image venue d'ailleurs).
    const affiche = /^https:\/\/image\.tmdb\.org\/t\/p\/[\w/.-]+$/.test(String(d.affiche || '')) ? String(d.affiche) : '';
    // Déjà dans la liste : même fiche TMDB, sinon même titre (français ou original) sans années contradictoires.
    const titres = (e) => [e.titre, e.titreOriginal].filter(Boolean).map(normaliser);
    const pareille = this.envies.find(
      (e) =>
        e.type === type && e.saison === saison && e.etat !== 'terminee' &&
        (tmdb && e.tmdb ? e.tmdb === tmdb : titres(e).some((x) => titres({ titre, titreOriginal }).includes(x)) && !(e.annee && annee && e.annee !== annee)),
    );
    if (pareille) throw new ErreurEnvie(`« ${pareille.titre} »${saison !== null ? ` (saison ${saison})` : ''} est déjà dans ta liste d’envies.`);
    if (this.envies.length >= MAX) throw new ErreurEnvie('La liste d’envies est pleine : retires-en quelques-unes.');
    const e = {
      id: crypto.randomBytes(5).toString('hex'), type, titre, titreOriginal, annee, tmdb, affiche, saison,
      ajoutee: this.maintenant(), etat: 'attente', message: '', essais: 0, verifiee: 0, prochaine: this.maintenant(),
      ecartees: [], version: null, job: null,
    };
    this.envies.push(e);
    this.sauver();
    this.journal(`Envies : ajout de « ${titre} »${saison !== null ? ` saison ${saison}` : ''}`);
    return this.decrire(e);
  }

  retirer(id) {
    const n = this.envies.length;
    this.envies = this.envies.filter((e) => e.id !== id);
    if (this.envies.length !== n) this.sauver();
  }

  // Cherche tout de suite une version pour cette envie ; l'envoie au débrideur s'il y en a une qui convient.
  async verifier(id, { signal } = {}) {
    const e = this.trouver(id);
    if (e.etat !== 'attente' || this.occupees.has(id)) return this.decrire(e);
    this.occupees.add(id);
    try {
      await this.chercher(e, signal);
    } catch (err) {
      if (signal?.aborted) throw err;
      if (!(err instanceof ErreurSource)) this.journal(`Envies : « ${e.titre} »`, err);
      e.message = err instanceof ErreurSource ? err.message : 'La recherche a échoué (détail dans le journal d’Ondi).';
    } finally {
      this.occupees.delete(id);
      if (e.etat === 'attente') {
        e.essais++;
        e.verifiee = this.maintenant();
        e.prochaine = e.verifiee + this.delai;
      }
      if (this.envies.includes(e)) this.sauver();
    }
    return this.decrire(e);
  }

  async chercher(e, signal) {
    if (!this.sources.etat.sources.length) {
      e.message = 'Aucune source de recherche n’est activée (Réglages → Sources de recherche).';
      return;
    }
    const voeu = { titres: [e.titre, e.titreOriginal].filter(Boolean), annee: e.annee, type: e.type, saison: e.saison };
    const demandes = [...new Map(voeu.titres.map((t) => [normaliser(t), t])).values()];
    const vues = new Map();
    const pannes = [];
    let repondu = 0;
    for (const q of demandes) {
      const r = await this.sources.rechercher({ q, type: e.type, saison: e.saison }, { profil: this.profil(), signal });
      for (const v of r.versions) if (!vues.has(v.id)) vues.set(v.id, v);
      for (const s of r.sources) s.erreur ? pannes.push(s.erreur) : repondu++;
    }
    // Les versions qui sont bien ce film ou cette saison (un épisode seul ne compte pas pour une saison).
    const bonnes = [...vues.values()].filter((v) => correspondAuVoeu(lireVersion(v.nom), voeu) && (e.type === 'film' || v.episode === null));
    const choix = bonnes.filter((v) => v.convient && !e.ecartees.includes(v.id)).sort((a, b) => b.note - a.note)[0];
    if (!choix) {
      if (!repondu && pannes.length) e.message = pannes[0];
      else if (!bonnes.length) e.message = 'Pas encore de version sur tes sources.';
      else {
        // La raison la plus fréquente parmi les versions vues.
        const refus = new Map();
        for (const v of bonnes) if (!v.convient) refus.set(v.refus, (refus.get(v.refus) || 0) + 1);
        const principale = [...refus].sort((a, b) => b[1] - a[1])[0]?.[0];
        e.message = principale
          ? `${bonnes.length} ${bonnes.length > 1 ? 'versions vues' : 'version vue'}, aucune ne convient encore (${principale}).`
          : 'Les versions qui convenaient n’ont pas pu être téléchargées : Ondi attend qu’il en sorte une autre.';
      }
      return;
    }
    const lien = await this.sources.lienDe(choix.id, { signal });
    const mode = e.type === 'film' ? 'film' : 'serie';
    let job;
    if (lien.magnet) job = this.gestionnaire.ajouterSources(lien.magnet, mode).ajoutes[0];
    else job = await this.gestionnaire.ajouterTorrent(lien.nom, lien.torrent, mode);
    if (!job) throw new ErreurSource('Le débrideur a refusé cette version.');
    this.sources.noterEnvoi?.(choix.id, job);
    Object.assign(e, { etat: 'envoyee', job, message: '', version: { id: choix.id, nom: choix.nom, taille: choix.taille, source: choix.sourceNom, date: this.maintenant() } });
    this.journal(`Envies : « ${e.titre} » → ${choix.nom} (${choix.sourceNom})`);
  }

  // Suit les téléchargements lancés par la liste : arrivé → envie terminée ; raté ou annulé → on attend une autre version.
  suivre() {
    let change = false;
    for (const e of this.envies) {
      if (e.etat !== 'envoyee') continue;
      const job = this.gestionnaire.trouver(e.job);
      if (job) e.suivi = job.etat;
      if (job?.etat === 'termine' || (!job && e.suivi === 'termine')) {
        Object.assign(e, { etat: 'terminee', terminee: this.maintenant(), message: '' });
        this.journal(`Envies : « ${e.titre} » est arrivé`);
      } else if (!job || job.etat === 'erreur' || job.etat === 'annule') {
        if (e.version?.id) e.ecartees = [...e.ecartees, e.version.id].slice(-50);
        const pourquoi = !job || job.etat === 'annule' ? 'a été annulé' : `a échoué${job.message ? ` (${texte(job.message, 120)})` : ''}`;
        Object.assign(e, { etat: 'attente', job: null, suivi: null, prochaine: this.maintenant() + DELAI_APRES_ECHEC, message: `Le téléchargement de « ${e.version?.nom || e.titre} » ${pourquoi} : Ondi cherchera une autre version.` });
      } else continue;
      change = true;
    }
    const limite = this.maintenant() - GARDE_TERMINEE;
    const gardees = this.envies.filter((e) => e.etat !== 'terminee' || (e.terminee || 0) > limite);
    if (gardees.length !== this.envies.length) {
      this.envies = gardees;
      change = true;
    }
    if (change) this.sauver();
  }

  // Un tour : suivi des téléchargements, puis recherche pour les envies dont c'est l'heure, l'une après l'autre.
  async tour() {
    if (this.tourEnCours) return;
    this.tourEnCours = true;
    try {
      this.suivre();
      for (const e of [...this.envies]) {
        if (e.etat !== 'attente' || e.prochaine > this.maintenant() || !this.envies.includes(e)) continue;
        await this.verifier(e.id);
      }
    } catch (err) {
      this.journal('Envies : tour raté', err);
    } finally {
      this.tourEnCours = false;
    }
  }

  demarrer(intervalle = 60_000) {
    this.minuterie = setInterval(() => this.tour(), intervalle);
    this.minuterie.unref();
  }
}
