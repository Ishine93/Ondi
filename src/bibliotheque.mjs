// Bibliothèque façon Jellyfin : parcourt les dossiers Films et Séries, lit les pistes de chaque fichier
// (ffprobe) et récupère les infos détaillées (TMDB). Tout est gardé dans donnees/bibliotheque.json :
// un fichier déjà vu (même taille, même date) n'est pas relu.
//   films  : un film = un ou plusieurs fichiers (versions : 4K HDR, 1080p…)
//   séries : série → saisons → épisodes → versions
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { estVideo, estEchantillon, estSousTitre, nettoyerNom, analyserEpisode, extension } from './classer.mjs';
import { normaliser } from './titres.mjs';
import { sonder, resumeVideo, nomLangue, libellesSousTitres, VERSION_SONDE } from './video.mjs';
import { infosFilm, infosSerie, episodesSaison } from './metadonnees.mjs';

const VERSION_CACHE = 1;
const hacher = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 14);

// « Hunger games - La révolte - Part 2 (2015) Blu-ray » → { titre: « Hunger games - La révolte - Part 2 », annee: 2015 }
export function titreDeFichier(nomFichier) {
  const brut = path.parse(nomFichier).name;
  const n = nettoyerNom(brut);
  const m = n.match(/^(.*?)\s*\((\d{4})\)/);
  if (m && m[1].trim()) return { titre: m[1].trim(), annee: Number(m[2]) };
  return { titre: n.replace(/\s*\(\d{4}\)\s*$/, '').trim() || brut, annee: null };
}

// Langue de la version d'après le nom (MULTi, FRENCH, VOSTFR…) pour l'étiquette de version.
function langueDuNom(nom) {
  const n = ` ${nom.toLowerCase().replace(/[._\-[\]()]+/g, ' ')} `;
  if (/ multi /.test(n)) return 'MULTI';
  if (/ vostfr | vost /.test(n)) return 'VOSTFR';
  if (/ (truefrench|french|vff|vfq|vfi|vf2|vf) /.test(n)) return 'VF';
  return '';
}

function parcourir(racine, surFichier, profondeur = 0) {
  let entrees = [];
  try {
    entrees = fs.readdirSync(racine, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entrees) {
    if (e.name.startsWith('.')) continue; // dossier temporaire d'Ondi, fichiers cachés
    const chemin = path.join(racine, e.name);
    if (e.isDirectory() && profondeur < 6) parcourir(chemin, surFichier, profondeur + 1);
    else if (e.isFile()) surFichier(chemin);
  }
}

export class Bibliotheque {
  constructor({ config, dossierDonnees, journal = () => {} }) {
    this.config = config;
    this.journal = journal;
    this.fichierCache = path.join(dossierDonnees, 'bibliotheque.json');
    let c = {};
    try {
      c = JSON.parse(fs.readFileSync(this.fichierCache, 'utf8'));
    } catch {}
    if (c.version !== VERSION_CACHE) c = {};
    this.fichiers = c.fichiers || {}; // id → { chemin, taille, mtime, ajoute, sonde, externes }
    this.meta = c.meta || {}; // `${langue}:${cle}` → { t, infos } ; `${langue}:${cle}:s${n}` → { t, episodes }
    this.scan = { enCours: false, fini: c.fini || 0, erreurs: 0, etape: '' };
    this.surChangement = () => {};
    this.reperes = () => null; // id → intro et générique de fin repérés (src/generiques.mjs)
    this.vue = null;
  }

  sauver() {
    fs.mkdirSync(path.dirname(this.fichierCache), { recursive: true });
    const tmp = `${this.fichierCache}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ version: VERSION_CACHE, fini: this.scan.fini, fichiers: this.fichiers, meta: this.meta }));
    fs.renameSync(tmp, this.fichierCache);
  }

  // ---------- parcours des dossiers ----------

  lister() {
    const trouves = {};
    const racines = [['films', this.config.dossiers.films], ['series', this.config.dossiers.series]];
    if (this.config.dossiers.mangas && this.config.dossiers.mangas !== this.config.dossiers.series) racines.push(['series', this.config.dossiers.mangas]);
    for (const [type, racine] of racines) {
      if (!racine) continue;
      const sousTitres = [];
      const videos = [];
      parcourir(racine, (chemin) => {
        const rel = path.relative(racine, chemin).split(path.sep).join('/');
        if (estVideo(chemin) && !estEchantillon(rel)) videos.push({ chemin, rel });
        else if (estSousTitre(chemin) && ['srt', 'ass', 'ssa', 'vtt'].includes(extension(chemin))) sousTitres.push(chemin);
      });
      for (const { chemin, rel } of videos) {
        let st;
        try {
          st = fs.statSync(chemin);
        } catch {
          continue;
        }
        // Sous-titres externes : « Film.fr.srt » à côté de « Film.mkv ».
        const base = chemin.slice(0, -path.extname(chemin).length);
        const externes = sousTitres
          .filter((s) => s.startsWith(base) && /^[.\s_-]/.test(s.slice(base.length)) || s.slice(0, -path.extname(s).length) === base)
          .map((s) => {
            const etiquettes = s.slice(base.length, -path.extname(s).length).toLowerCase();
            const code = (etiquettes.match(/(?:^|[.\s_-])(fr|fre|fra|en|eng|es|spa|de|ger|it|ita)(?=$|[.\s_-])/) || [])[1] || '';
            return { chemin: s, langue: code, force: /forc/.test(etiquettes), nom: [nomLangue(code) || 'Externe', /forc/.test(etiquettes) ? 'forcés' : ''].filter(Boolean).join(' · ') };
          });
        const id = hacher(`${type}/${racine === this.config.dossiers.mangas ? 'mangas/' : ''}${rel}`);
        trouves[id] = { id, type, chemin, rel, taille: st.size, mtime: Math.round(st.mtimeMs), externes };
      }
    }
    return trouves;
  }

  async scanner({ forcerMeta = false } = {}) {
    if (this.scan.enCours) return this.scan.promesse;
    this.scan.enCours = true;
    this.scan.promesse = (async () => {
      try {
        this.scan.etape = 'fichiers';
        const trouves = this.lister();
        const anciens = this.fichiers;
        const nouveau = {};
        let aSonder = [];
        for (const [id, f] of Object.entries(trouves)) {
          const a = anciens[id];
          const memeFichier = a && a.taille === f.taille && a.mtime === f.mtime && a.chemin === f.chemin;
          nouveau[id] = { ...f, ajoute: a?.ajoute || Date.now(), sonde: memeFichier ? a.sonde : null };
          // Lu avec une version plus ancienne (pistes vides…) : relu, l'ancienne lecture servant en attendant.
          if (!nouveau[id].sonde || nouveau[id].sonde.version !== VERSION_SONDE) aSonder.push(id);
        }
        const partis = Object.keys(anciens).filter((id) => !nouveau[id]).length;
        this.fichiers = nouveau;
        this.vue = null;
        this.scan.etape = 'pistes';
        for (const id of aSonder) {
          try {
            nouveau[id].sonde = await sonder(nouveau[id].chemin);
          } catch (e) {
            this.scan.erreurs++;
            this.journal(`Bibliothèque : lecture impossible de ${nouveau[id].rel} (${String(e.erreurs || e.message).trim().slice(0, 200)})`);
          }
        }
        if (aSonder.length || partis) this.journal(`Bibliothèque : ${aSonder.length} fichier(s) lu(s), ${partis} disparu(s), ${Object.keys(nouveau).length} au total`);
        this.vue = null;
        this.scan.etape = 'infos';
        await this.completerInfos({ forcer: forcerMeta, langues: ['fr', 'en'] });
        this.scan.fini = Date.now();
        this.sauver();
      } finally {
        this.scan.enCours = false;
        this.scan.etape = '';
        this.vue = null;
        this.surChangement();
      }
    })();
    return this.scan.promesse;
  }

  // ---------- regroupement ----------

  // Clé de contenu (sert aussi à l'historique : changer de version garde la position).
  regrouper() {
    if (this.vue) return this.vue;
    const films = new Map();
    const series = new Map();
    for (const f of Object.values(this.fichiers)) {
      if (f.type === 'films') {
        const { titre, annee } = titreDeFichier(path.basename(f.chemin));
        const cle = `f:${normaliser(titre)}${annee ? `:${annee}` : ''}`;
        if (!films.has(cle)) films.set(cle, { cle, type: 'film', titreFichier: titre, annee, fichiers: [] });
        films.get(cle).fichiers.push(f.id);
      } else {
        const e = analyserEpisode(f.rel);
        let nomSerie = e?.serie || f.rel.split('/')[0];
        nomSerie = nettoyerNom(nomSerie).replace(/\s*\(\d{4}\)\s*$/, '') || nomSerie;
        const cle = `s:${normaliser(nomSerie)}`;
        if (!series.has(cle)) series.set(cle, { cle, type: 'serie', titreFichier: nomSerie, saisons: new Map() });
        const s = series.get(cle);
        const numSaison = e?.saison ?? 0;
        const numEp = e?.episode ?? 0;
        if (!s.saisons.has(numSaison)) s.saisons.set(numSaison, new Map());
        const eps = s.saisons.get(numSaison);
        if (!eps.has(numEp)) eps.set(numEp, []);
        eps.get(numEp).push(f.id);
      }
    }
    this.vue = { films, series };
    return this.vue;
  }

  // ---------- infos TMDB ----------

  cleMeta(langue, cle, suffixe = '') {
    return `${langue}:${cle}${suffixe}`;
  }

  async completerInfos({ forcer = false, langues = ['fr'] } = {}) {
    const cleTmdb = this.config.tmdb;
    if (!cleTmdb) return;
    const { films, series } = this.regrouper();
    const vieux = (m) => !m || forcer || (!m.infos && Date.now() - m.t > 24 * 3600e3) || Date.now() - m.t > 30 * 24 * 3600e3;
    for (const langue of langues) {
      const code = langue === 'en' ? 'en-US' : 'fr-FR';
      for (const g of films.values()) {
        const k = this.cleMeta(langue, g.cle);
        if (!vieux(this.meta[k])) continue;
        try {
          this.meta[k] = { t: Date.now(), infos: await infosFilm(cleTmdb, { titre: g.titreFichier, annee: g.annee, langue: code, duree: Math.round((this.fichiers[g.fichiers[0]]?.sonde?.duree || 0) / 60) || null, idTmdb: this.corrections?.[g.cle] }) };
        } catch (e) {
          this.journal(`TMDB : ${g.titreFichier} (${e.message})`);
          if (/refusée/.test(e.message)) return;
        }
      }
      for (const g of series.values()) {
        const k = this.cleMeta(langue, g.cle);
        if (vieux(this.meta[k])) {
          try {
            this.meta[k] = { t: Date.now(), infos: await infosSerie(cleTmdb, { titre: g.titreFichier, langue: code }) };
          } catch (e) {
            this.journal(`TMDB : ${g.titreFichier} (${e.message})`);
            if (/refusée/.test(e.message)) return;
            continue;
          }
        }
        const infos = this.meta[k]?.infos;
        if (!infos) continue;
        for (const n of g.saisons.keys()) {
          const ks = this.cleMeta(langue, g.cle, `:s${n}`);
          if (!vieux(this.meta[ks])) continue;
          try {
            this.meta[ks] = { t: Date.now(), episodes: await episodesSaison(cleTmdb, infos, n, code) };
          } catch (e) {
            this.journal(`TMDB : ${g.titreFichier} saison ${n} (${e.message})`);
          }
        }
      }
    }
    this.sauver();
  }

  // Fichier téléchargé → où le lire : { cle, cleLecture, versionId }, ou null s'il n'est pas (encore) rangé.
  lectureDeChemin(chemin) {
    const { films, series } = this.regrouper();
    // Index chemin → fichier, refait quand la bibliothèque change (la page le demande chaque seconde).
    if (this.indexChemins?.vue !== this.vue) {
      this.indexChemins = { vue: this.vue, map: new Map(Object.values(this.fichiers).map((x) => [path.resolve(x.chemin).toLowerCase(), x])) };
    }
    const f = this.indexChemins.map.get(path.resolve(String(chemin || '')).toLowerCase());
    if (!f) return null;
    for (const g of films.values()) if (g.fichiers.includes(f.id)) return { cle: g.cle, cleLecture: g.cle, versionId: f.id };
    for (const g of series.values()) {
      for (const [n, eps] of g.saisons) {
        for (const [ep, ids] of eps) if (ids.includes(f.id)) return { cle: g.cle, cleLecture: `e:${g.cle.slice(2)}:${n}:${ep}`, versionId: f.id };
      }
    }
    return null;
  }

  // ---------- ce que voit la page ----------

  version(id) {
    const f = this.fichiers[id];
    if (!f) return null;
    const s = f.sonde;
    const nom = path.basename(f.chemin);
    return {
      id,
      nom,
      taille: f.taille,
      langue: langueDuNom(nom),
      resume: s ? resumeVideo(s.video) : '',
      duree: s?.duree || 0,
      video: s?.video || null,
      audios: s?.audios || [],
      // Pistes vides retirées ; noms distincts (langue, variante, forcés / SDH, image, numéro si besoin).
      sousTitres: libellesSousTitres([
        ...(s?.sousTitres || []).filter((x) => !x.vide),
        ...(f.externes || []).map((x, i) => ({ externe: i, nom: `${x.nom} · fichier`, langue: x.langue, force: x.force, texte: true })),
      ]),
      debit: s?.debit || 0,
      ajoute: f.ajoute,
      generiques: this.reperes(id),
    };
  }

  infos(langue, cle) {
    return this.meta[this.cleMeta(langue, cle)]?.infos || this.meta[this.cleMeta('fr', cle)]?.infos || null;
  }

  // Liste légère pour les rangées et la grille (sans les pistes).
  catalogue(langue = 'fr') {
    const { films, series } = this.regrouper();
    const carte = (g, infos, ajoute) => ({
      cle: g.cle,
      type: g.type,
      titre: infos?.titre || g.titreFichier,
      // Autres noms du même contenu : la recherche s'en sert pour signaler « déjà dans ta bibliothèque ».
      autresTitres: [...new Set([g.titreFichier, infos?.titreOriginal].filter((x) => x && x !== (infos?.titre || g.titreFichier)))],
      annee: infos?.annee || g.annee || null,
      affiche: infos?.affiche || '',
      fond: infos?.fond || '',
      logo: infos?.logo || '',
      resume: infos?.resume || '',
      genres: infos?.genres || [],
      note: infos?.note ?? null,
      age: infos?.age || '',
      duree: infos?.duree || null,
      ajoute,
    });
    const listeFilms = [...films.values()].map((g) => {
      const versions = g.fichiers.map((id) => this.version(id)).filter(Boolean);
      const c = carte(g, this.infos(langue, g.cle), Math.max(...versions.map((v) => v.ajoute || 0)));
      c.versions = versions.map((v) => ({ id: v.id, resume: v.resume, langue: v.langue }));
      c.duree = c.duree || Math.round((versions[0]?.duree || 0) / 60) || null;
      return c;
    });
    const listeSeries = [...series.values()].map((g) => {
      const ids = [...g.saisons.values()].flatMap((eps) => [...eps.values()].flat());
      const c = carte(g, this.infos(langue, g.cle), Math.max(...ids.map((id) => this.fichiers[id]?.ajoute || 0)));
      c.nbSaisons = g.saisons.size;
      c.nbEpisodes = [...g.saisons.values()].reduce((n, eps) => n + eps.size, 0);
      return c;
    });
    const tri = (a, b) => b.ajoute - a.ajoute;
    return { films: listeFilms.sort(tri), series: listeSeries.sort(tri), scan: { enCours: this.scan.enCours, etape: this.scan.etape, fini: this.scan.fini }, tmdb: !!this.config.tmdb };
  }

  // Fiche complète : infos, casting, versions avec leurs pistes, saisons et épisodes.
  element(cle, langue = 'fr') {
    const { films, series } = this.regrouper();
    const g = films.get(cle) || series.get(cle);
    if (!g) return null;
    const infos = this.infos(langue, cle);
    const base = this.catalogue(langue)[g.type === 'film' ? 'films' : 'series'].find((x) => x.cle === cle);
    const fiche = { ...base, titreOriginal: infos?.titreOriginal || '', slogan: infos?.slogan || '', realisateurs: infos?.realisateurs || [], casting: infos?.casting || [], source: infos?.source || '' };
    if (g.type === 'film') {
      fiche.versions = g.fichiers.map((id) => this.version(id)).filter(Boolean).sort((a, b) => (b.video?.largeur || 0) - (a.video?.largeur || 0));
      fiche.cleLecture = cle;
    } else {
      const infosSaisons = infos?.saisons || [];
      fiche.saisons = [...g.saisons.keys()]
        .sort((a, b) => (a || 1e6) - (b || 1e6))
        .map((n) => {
          const meta = this.meta[this.cleMeta(langue, cle, `:s${n}`)]?.episodes || this.meta[this.cleMeta('fr', cle, `:s${n}`)]?.episodes || [];
          const s = infosSaisons.find((x) => x.numero === n);
          return {
            numero: n,
            nom: n ? s?.nom || `Saison ${n}` : 'Autres épisodes',
            resume: s?.resume || '',
            affiche: s?.affiche || '',
            nbEpisodesTotal: s?.nbEpisodes || null,
            episodes: [...g.saisons.get(n).entries()]
              .sort((a, b) => a[0] - b[0])
              .map(([ep, ids]) => {
                const m = meta.find((x) => x.numero === ep);
                const versions = ids.map((id) => this.version(id)).filter(Boolean).sort((a, b) => (b.video?.largeur || 0) - (a.video?.largeur || 0));
                return {
                  numero: ep,
                  cleLecture: `e:${cle.slice(2)}:${n}:${ep}`,
                  titre: m?.titre || (ep ? `Épisode ${ep}` : versions[0]?.nom || ''),
                  resume: m?.resume || '',
                  image: m?.image || '',
                  date: m?.date || '',
                  duree: m?.duree || Math.round((versions[0]?.duree || 0) / 60) || null,
                  versions,
                };
              }),
          };
        });
    }
    return fiche;
  }

  // Pour l'historique : clé de lecture → titre et image (rangée « Reprendre la lecture »).
  decrireLecture(cleLecture, langue = 'fr') {
    if (cleLecture.startsWith('f:')) {
      const c = this.catalogue(langue).films.find((x) => x.cle === cleLecture);
      return c ? { cle: c.cle, titre: c.titre, sousTitre: c.annee ? String(c.annee) : '', image: c.fond || c.affiche, affiche: c.affiche, versions: c.versions } : null;
    }
    const m = cleLecture.match(/^e:(.+):(\d+):(\d+)$/);
    if (!m) return null;
    const cleSerie = `s:${m[1]}`;
    const fiche = this.element(cleSerie, langue);
    const s = fiche?.saisons.find((x) => x.numero === Number(m[2]));
    const e = s?.episodes.find((x) => x.numero === Number(m[3]));
    if (!e) return null;
    return {
      cle: cleSerie,
      titre: fiche.titre,
      sousTitre: `S${m[2]} · É${m[3]}${e.titre && !/^Épisode \d+$/.test(e.titre) ? ` · ${e.titre}` : ''}`,
      image: e.image || fiche.fond || fiche.affiche,
      affiche: fiche.affiche,
      versions: e.versions.map((v) => ({ id: v.id, resume: v.resume })),
    };
  }

  // Épisode suivant (même saison, sinon première de la saison suivante).
  episodeSuivant(cleLecture) {
    const m = cleLecture.match(/^e:(.+):(\d+):(\d+)$/);
    if (!m) return null;
    const g = this.regrouper().series.get(`s:${m[1]}`);
    if (!g) return null;
    const saisons = [...g.saisons.keys()].sort((a, b) => a - b);
    const s = Number(m[2]);
    const ep = Number(m[3]);
    const eps = [...(g.saisons.get(s)?.keys() || [])].sort((a, b) => a - b);
    const apres = eps.find((x) => x > ep);
    if (apres != null) return `e:${m[1]}:${s}:${apres}`;
    const sSuivante = saisons.find((x) => x > s);
    if (sSuivante == null) return null;
    const premier = [...g.saisons.get(sSuivante).keys()].sort((a, b) => a - b)[0];
    return `e:${m[1]}:${sSuivante}:${premier}`;
  }

  fichier(id) {
    return this.fichiers[id] || null;
  }
}
