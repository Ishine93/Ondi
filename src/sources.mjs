// Sources de recherche d'Ondi : le catalogue public de Prowlarr (une description par site, lue par
// moteur-sources.mjs), les sources que l'utilisateur a activées avec leurs réglages, et la recherche
// groupée sur toutes à la fois. Rien à installer à côté : Ondi lit lui-même les descriptions.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { lireYaml } from './yaml.mjs';
import { Source, ErreurSource, verifierDescription, resumerDescription, reglagesDe, estVideo } from './moteur-sources.mjs';
import { normaliser } from './titres.mjs';
import { lireVersion, noterVersion, lireProfil, regrouperVersions, correspondAuVoeu } from './versions.mjs';

export { ErreurSource };

// L'archive du dépôt public des descriptions (moins de 1 Mo).
const ADRESSE_CATALOGUE = 'https://codeload.github.com/Prowlarr/Indexers/tar.gz/refs/heads/master';
// Format des descriptions que le moteur sait lire (dossier « definitions/v11 » du dépôt). Quand Prowlarr
// passera au suivant, celui-ci ne sera plus mis à jour : il faudra apprendre le nouveau au moteur.
const VERSION_FORMAT = 11;
const AGE_MAX = 3 * 86400_000;
// Réglages dont la valeur ne repart jamais vers la page (clés, mots de passe, cookies).
const SECRET = /key|pass|cookie|token|secret|^pid$|^uid$|^rss/i;

// Fichiers d'une archive tar : { nom, contenu }.
export function* entreesTar(tar) {
  let nomLong = null;
  for (let p = 0; p + 512 <= tar.length; ) {
    const entete = tar.subarray(p, p + 512);
    if (entete[0] === 0) break;
    const texte = (d, n) => entete.subarray(d, d + n).toString('utf8').replace(/\0[\s\S]*$/, '');
    const taille = parseInt(texte(124, 12).trim() || '0', 8) || 0;
    const type = String.fromCharCode(entete[156] || 48);
    const contenu = tar.subarray(p + 512, p + 512 + taille);
    p += 512 + Math.ceil(taille / 512) * 512;
    if (type === 'x') {
      nomLong = contenu.toString('utf8').match(/\d+ path=([^\n]+)\n/)?.[1] ?? null;
      continue;
    }
    if (type === 'L') {
      nomLong = contenu.toString('utf8').replace(/\0[\s\S]*$/, '');
      continue;
    }
    if (type === 'g') continue;
    const nom = nomLong ?? (texte(345, 155) ? `${texte(345, 155)}/` : '') + texte(0, 100);
    nomLong = null;
    if (type === '0') yield { nom, contenu };
  }
}

const identifiant = (...morceaux) => crypto.createHash('sha1').update(morceaux.join('\n')).digest('hex').slice(0, 16);

export class Sources {
  // dossier : où garder le catalogue et les réglages ; local : autorise les sites en adresse locale (essais).
  // pausePanne : temps pendant lequel une source qui vient d'échouer n'est plus interrogée (0 = jamais de pause).
  // identifier : ({ titre, annee, type }) => { titre, annee } officiels d'un film ou d'une série (TMDB), ou null.
  constructor({ dossier, journal = () => {}, adresse = ADRESSE_CATALOGUE, local = false, pausePanne = 10 * 60_000, identifier = null }) {
    this.identifier = identifier;
    this.pausePanne = pausePanne;
    this.pannes = new Map(); // id de source → { jusqua, erreur }
    this.cacheNouveautes = new Map();
    this.envois = new Map(); // id de version → téléchargement lancé pour elle (la page y suit sa progression)
    this.journal = journal;
    this.adresse = adresse;
    this.local = local;
    this.fichierCatalogue = path.join(dossier, 'catalogue-sources.tar.gz');
    this.fichier = path.join(dossier, 'sources.json');
    this.etat = { catalogue: { date: 0, etiquette: '' }, sources: [] };
    try {
      const lu = JSON.parse(fs.readFileSync(this.fichier, 'utf8'));
      this.etat = { catalogue: { date: 0, etiquette: '', ...lu.catalogue }, sources: Array.isArray(lu.sources) ? lu.sources.filter((s) => s && typeof s.id === 'string') : [] };
    } catch {}
    this.descriptions = new Map(); // id → { d, resume, empechements }
    this.instances = new Map(); // id → Source
    this.versions = new Map(); // id de version → version complète (lien, magnet…), pour l'envoi
    this.chargement = null;
  }

  sauver() {
    fs.mkdirSync(path.dirname(this.fichier), { recursive: true });
    fs.writeFileSync(this.fichier, JSON.stringify(this.etat, null, 2));
  }

  // ---------- catalogue ----------

  lireArchive(archive) {
    const parVersion = new Map();
    for (const { nom, contenu } of entreesTar(zlib.gunzipSync(archive))) {
      const m = nom.match(/definitions\/v(\d+)\/([^/]+)\.yml$/);
      if (!m) continue;
      if (!parVersion.has(Number(m[1]))) parVersion.set(Number(m[1]), []);
      parVersion.get(Number(m[1])).push(contenu);
    }
    const version = [...parVersion.keys()].filter((v) => v <= VERSION_FORMAT).sort((a, b) => b - a)[0];
    if (!version) throw new ErreurSource('Le catalogue des sources est vide ou dans un format inconnu.');
    const descriptions = new Map();
    for (const contenu of parVersion.get(version)) {
      try {
        const d = lireYaml(contenu.toString('utf8'));
        if (!d || typeof d.id !== 'string' || !d.search) continue;
        descriptions.set(d.id, { d, resume: resumerDescription(d), empechements: verifierDescription(d) });
      } catch {}
    }
    if (!descriptions.size) throw new ErreurSource('Aucune description lisible dans le catalogue des sources.');
    this.descriptions = descriptions;
    this.instances.clear();
  }

  async telecharger() {
    let res;
    try {
      res = await fetch(this.adresse, {
        headers: { 'User-Agent': 'Ondi', ...(this.etat.catalogue.etiquette && fs.existsSync(this.fichierCatalogue) ? { 'If-None-Match': this.etat.catalogue.etiquette } : {}) },
        signal: AbortSignal.timeout(60_000),
      });
    } catch (e) {
      throw new ErreurSource(`Catalogue des sources injoignable (${e.name === 'TimeoutError' ? 'trop long à répondre' : e.cause?.code || e.message}).`);
    }
    if (res.status === 304) {
      await res.body?.cancel().catch(() => {});
      this.etat.catalogue.date = Date.now();
      this.sauver();
      return false;
    }
    if (!res.ok) throw new ErreurSource(`Catalogue des sources : réponse « HTTP ${res.status} ».`);
    const archive = Buffer.from(await res.arrayBuffer());
    if (archive.length > 30e6) throw new ErreurSource('Catalogue des sources anormalement gros.');
    this.lireArchive(archive); // lève une erreur si l'archive n'est pas bonne : l'ancienne reste en place
    fs.mkdirSync(path.dirname(this.fichierCatalogue), { recursive: true });
    fs.writeFileSync(this.fichierCatalogue, archive);
    this.etat.catalogue = { date: Date.now(), etiquette: res.headers.get('etag') || '' };
    this.sauver();
    this.journal(`Sources : catalogue mis à jour (${this.descriptions.size} descriptions)`);
    return true;
  }

  // Met le catalogue en mémoire : depuis le disque, et depuis Internet s'il manque ou s'il a vieilli.
  charger({ frais = false } = {}) {
    if (this.chargement) return this.chargement;
    const travail = (async () => {
      if (!this.descriptions.size && fs.existsSync(this.fichierCatalogue)) {
        try {
          this.lireArchive(fs.readFileSync(this.fichierCatalogue));
        } catch (e) {
          this.journal(`Sources : catalogue du disque illisible (${e.message})`);
        }
      }
      if (frais || !this.descriptions.size || Date.now() - this.etat.catalogue.date > AGE_MAX) {
        try {
          await this.telecharger();
        } catch (e) {
          // Sans Internet, le catalogue déjà en place continue de servir.
          if (!this.descriptions.size || frais) throw e;
          this.journal(`Sources : ${e.message}`);
        }
      }
    })();
    // Deux demandes en même temps partagent le même chargement ; une fois fini, la suivante repart de zéro.
    this.chargement = travail;
    const fini = () => {
      if (this.chargement === travail) this.chargement = null;
    };
    travail.then(fini, fini);
    return travail;
  }

  estActive(id) {
    return this.etat.sources.some((s) => s.id === id);
  }

  // Toutes les sources du catalogue, avec ce qui empêche éventuellement de s'en servir.
  async catalogue(options) {
    await this.charger(options);
    const liste = [...this.descriptions.values()].map(({ resume, empechements }) => ({ ...resume, utilisable: !empechements.length, raison: empechements[0] || '', active: this.estActive(resume.id) }));
    liste.sort((a, b) => a.nom.localeCompare(b.nom, 'fr', { sensitivity: 'base' }));
    return { date: this.etat.catalogue.date, sources: liste };
  }

  // ---------- sources activées ----------

  // Formulaire d'une source : ses réglages et leurs valeurs (jamais celle d'un secret).
  async formulaire(id) {
    await this.charger();
    const fiche = this.descriptions.get(id);
    if (!fiche) throw new ErreurSource('Source inconnue du catalogue.');
    const active = this.etat.sources.find((s) => s.id === id);
    const reglages = reglagesDe(fiche.d).map((r) => {
      if (r.type === 'info') return r;
      const secret = r.type === 'secret' || SECRET.test(r.nom);
      const valeur = active?.valeurs?.[r.nom];
      if (secret) return { ...r, type: 'secret', rempli: valeur !== undefined && valeur !== '' };
      return { ...r, valeur: valeur ?? r.defaut };
    });
    return { ...fiche.resume, utilisable: !fiche.empechements.length, raison: fiche.empechements[0] || '', active: !!active, lien: active?.lien || fiche.resume.lien, liens: [].concat(fiche.d.links || []), reglages };
  }

  // Active une source ou change ses réglages. Un secret laissé vide garde sa valeur d'avant.
  async enregistrer(id, { valeurs = {}, lien = '' } = {}) {
    await this.charger();
    const fiche = this.descriptions.get(id);
    if (!fiche) throw new ErreurSource('Source inconnue du catalogue.');
    if (fiche.empechements.length) throw new ErreurSource(`${fiche.resume.nom} n'est pas utilisable dans Ondi : ${fiche.empechements[0]}.`);
    const avant = this.etat.sources.find((s) => s.id === id);
    const gardees = {};
    for (const r of reglagesDe(fiche.d)) {
      if (r.type === 'info') continue;
      const secret = r.type === 'secret' || SECRET.test(r.nom);
      let v = valeurs[r.nom];
      if (r.type === 'case') v = v === true || v === 'true';
      else if (v !== undefined && v !== null) v = String(v).trim().slice(0, 4000);
      if (v === undefined || v === null || (secret && v === '')) v = avant?.valeurs?.[r.nom];
      if (r.type === 'choix' && !r.options.some((o) => o.valeur === v)) v = undefined;
      if (v !== undefined && v !== '') gardees[r.nom] = v;
    }
    let adresse = String(lien || '').trim();
    if (adresse) {
      try {
        const u = new URL(/^https?:\/\//i.test(adresse) ? adresse : `https://${adresse}`);
        adresse = `${u.origin}/`;
      } catch {
        throw new ErreurSource('Adresse du site invalide.');
      }
      if (adresse === fiche.resume.lien) adresse = '';
    }
    const entree = { id, valeurs: gardees, lien: adresse, temoins: '' };
    this.etat.sources = [...this.etat.sources.filter((s) => s.id !== id), entree];
    this.instances.delete(id);
    this.pannes.delete(id);
    this.cacheNouveautes.clear();
    this.sauver();
    return entree;
  }

  retirer(id) {
    const n = this.etat.sources.length;
    this.etat.sources = this.etat.sources.filter((s) => s.id !== id);
    this.instances.delete(id);
    this.pannes.delete(id);
    this.cacheNouveautes.clear();
    if (this.etat.sources.length !== n) this.sauver();
  }

  // La source prête à chercher (réglages de l'utilisateur, session gardée d'une fois sur l'autre).
  source(id) {
    let s = this.instances.get(id);
    if (s) return s;
    const fiche = this.descriptions.get(id);
    const active = this.etat.sources.find((x) => x.id === id);
    if (!fiche || !active) throw new ErreurSource('Source non activée.');
    if (fiche.empechements.length) throw new ErreurSource(`${fiche.resume.nom} n'est plus utilisable dans Ondi : ${fiche.empechements[0]}.`);
    s = new Source(fiche.d, {
      valeurs: active.valeurs,
      lien: active.lien || null,
      temoins: active.temoins,
      local: this.local,
      surTemoins: (texte) => {
        active.temoins = texte;
        this.sauver();
      },
    });
    this.instances.set(id, s);
    return s;
  }

  // Sources activées, pour les Réglages.
  async actives() {
    if (this.etat.sources.length) await this.charger();
    return this.etat.sources.map((s) => {
      const fiche = this.descriptions.get(s.id);
      if (!fiche) return { id: s.id, nom: s.id, utilisable: false, raison: 'absente du catalogue' };
      return { ...fiche.resume, lien: s.lien || fiche.resume.lien, utilisable: !fiche.empechements.length, raison: fiche.empechements[0] || '' };
    });
  }

  // Une recherche sans mot (les dernières sorties du site) : dit si la source répond.
  async essayer(id, { signal } = {}) {
    await this.charger();
    const debut = Date.now();
    this.pannes.delete(id);
    const versions = await this.source(id).rechercher({ q: '' }, { signal });
    return { versions: versions.length, exemple: versions[0]?.titre || '', ms: Date.now() - debut };
  }

  // ---------- recherche groupée ----------

  // demande : { q, type ('film' | 'serie' | null), saison, episode, annee }
  // Rend { versions, contenus, sources } : les versions de toutes les sources (doublons réunis), chacune avec
  // ce qu'on lit de son nom et l'avis du profil (convient ou non, et pourquoi), celles qui conviennent d'abord ;
  // les mêmes regroupées par film ou série (« contenus », pour les affiches) ; et pour chaque source ce qu'elle
  // a donné ou pourquoi elle a échoué.
  // surProgres : appelé dès qu'une source a répondu, avec le résultat du moment : la page n'attend pas les lentes.
  async rechercher(demande, { signal, attente = 25_000, profil = null, surProgres = null } = {}) {
    const voulu = lireProfil(profil);
    if (!this.etat.sources.length) return { versions: [], contenus: [], sources: [] };
    await this.charger();
    const bilan = [];
    const lots = [];
    const mots = normaliser(demande.q || '').split(' ').filter((m) => m.length > 1);

    const assembler = () => {
      const parCle = new Map();
      for (const v of lots.flat()) {
        if (!estVideo(v)) continue;
        const titre = normaliser(v.titre);
        if (mots.length && !mots.every((m) => titre.includes(m))) continue;
        const cle = v.infohash || `${v.source}\n${v.lien || v.titre}`;
        const deja = parCle.get(cle);
        if (deja) {
          // Même fichier vu sur deux sources : on garde celle qui a le plus de monde.
          if (!deja.autres.includes(v.sourceNom) && v.sourceNom !== deja.sourceNom) deja.autres.push(v.sourceNom);
          if ((v.sources ?? 0) > (deja.sources ?? 0)) Object.assign(deja, { ...v, autres: [...deja.autres.filter((n) => n !== v.sourceNom), deja.sourceNom] });
          continue;
        }
        parCle.set(cle, { ...v, autres: [] });
      }
      const versions = [...parCle.values()].map((v) => {
        const id = identifiant(v.source, v.infohash || v.lien || v.titre);
        this.versions.delete(id);
        this.versions.set(id, v);
        const lu = lireVersion(v.titre);
        const avis = noterVersion(lu, voulu, { taille: v.taille ?? null, sources: v.sources ?? null });
        return {
          id, nom: v.titre, source: v.source, sourceNom: v.sourceNom, autres: v.autres, prive: v.prive,
          taille: v.taille ?? null, sources: v.sources ?? null, pairs: v.pairs ?? null, date: v.date ?? null,
          titre: lu.titre, annee: lu.annee, saison: lu.saison, saisonFin: lu.saisonFin, episode: lu.episode, episodeFin: lu.episodeFin, integrale: lu.integrale,
          definition: lu.definition, origine: lu.origine, codec: lu.codec, hdr: lu.hdr, audio: lu.audio,
          langues: lu.langues.detail, vf: lu.langues.vf, vo: lu.langues.vo,
          convient: avis.ok, refus: avis.refus, note: avis.note,
          job: this.envois.get(id) || null,
        };
      });
      while (this.versions.size > 4000) this.versions.delete(this.versions.keys().next().value);
      versions.sort((a, b) => b.convient - a.convient || b.note - a.note || (b.sources ?? -1) - (a.sources ?? -1));
      return { versions, contenus: regrouperVersions(versions, demande.q || ''), sources: [...bilan].sort((a, b) => a.nom.localeCompare(b.nom, 'fr')) };
    };

    const total = this.etat.sources.length;
    let etapes = Promise.resolve();
    await Promise.all(
      this.etat.sources.map(async ({ id }) => {
        const debut = Date.now();
        let nom = this.descriptions.get(id)?.resume.nom || id;
        const panne = this.pannes.get(id);
        if (panne && panne.jusqua > Date.now()) {
          // Elle vient d'échouer : on ne lui redemande pas tout de suite (sinon chaque recherche l'attendrait).
          bilan.push({ id, nom, erreur: panne.erreur, enPause: true, ms: 0 });
        } else {
          try {
            const s = this.source(id);
            nom = s.nom;
            const limite = AbortSignal.timeout(attente);
            const versions = await s.rechercher(demande, { signal: signal ? AbortSignal.any([signal, limite]) : limite });
            this.pannes.delete(id);
            lots.push(versions.map((v) => ({ ...v, sourceNom: nom, prive: s.d.type === 'private' })));
            bilan.push({ id, nom, versions: versions.length, ms: Date.now() - debut });
          } catch (e) {
            if (signal?.aborted) throw e;
            if (!(e instanceof ErreurSource) && e.name !== 'TimeoutError') this.journal(`Sources : ${id}`, e);
            const erreur = e.name === 'TimeoutError' ? `${nom} met trop de temps à répondre.` : e instanceof ErreurSource ? e.message : `${nom} : réponse non comprise.`;
            if (this.pausePanne) this.pannes.set(id, { jusqua: Date.now() + this.pausePanne, erreur });
            bilan.push({ id, nom, erreur, ms: Date.now() - debut });
          }
        }
        // Les points d'étape partent dans l'ordre, chacun avec ses contenus réunis sous leur titre officiel.
        if (surProgres && bilan.length < total) etapes = etapes.then(async () => surProgres(await this.unifier(assembler())));
      }),
    );
    await etapes;
    return this.unifier(assembler());
  }

  // Un même film porte souvent deux noms d'une source à l'autre (« Dune Part Two », « Dune : Deuxième partie ») :
  // on demande son titre officiel et on réunit les contenus qui ont le même. Le titre affiché devient l'officiel,
  // celui qu'emploie aussi le site : une seule carte pour tout le monde.
  async unifier(r) {
    if (!this.identifier || !r.contenus.length) return r;
    const limite = new Promise((ok) => setTimeout(() => ok(null), 2500));
    const officiels = await Promise.all(
      r.contenus.map((c, i) => (i < 60 ? Promise.race([Promise.resolve(this.identifier({ titre: c.titre, annee: c.annee, type: c.type })).catch(() => null), limite]) : null)),
    );
    const rang = new Map(r.versions.map((v, i) => [v.id, i]));
    const parCle = new Map();
    r.contenus.forEach((c, i) => {
      const f = officiels[i];
      let x = c;
      // L'année doit coller (à un an près) : « Dune » (1984) n'est pas « Dune » (2021).
      if (f?.titre && (c.type === 'serie' || !c.annee || !f.annee || Math.abs(f.annee - c.annee) <= 1)) {
        const annee = c.type === 'film' ? f.annee || c.annee : null;
        const titreAffiche = annee && !f.titre.includes(String(annee)) ? `${f.titre} (${annee})` : f.titre;
        x = { ...c, annee, titreAffiche, cleSite: normaliser(titreAffiche) };
      }
      const cle = `${x.type}|${x.cleSite}`;
      const deja = parCle.get(cle);
      if (!deja) return void parCle.set(cle, { ...x });
      deja.versions = [...deja.versions, ...x.versions].sort((a, b) => rang.get(a) - rang.get(b));
      deja.conviennent += x.conviennent;
      deja.definitions = [...new Set([...deja.definitions, ...x.definitions])].sort((a, b) => b - a);
      deja.familles = ['multi', 'vf', 'vostfr', 'vo'].filter((l) => deja.familles.includes(l) || x.familles.includes(l));
      deja.saisons = [...new Set([...deja.saisons, ...x.saisons])].sort((a, b) => a - b);
      for (const k of ['note', 'date', 'pertinence']) deja[k] = Math.max(deja[k], x[k]);
    });
    return { ...r, contenus: [...parCle.values()] };
  }

  // Les versions d'un film ou d'une série précis (onglet « Sources » de sa fiche) : une recherche par titre
  // connu (titre affiché, titre original…), puis seulement ce qui est bien ce contenu.
  // voeu : { titres, annee, type ('film' | 'serie') }
  async contenu(voeu, options = {}) {
    const vues = new Map();
    const etats = new Map();
    const demandes = [...new Map(voeu.titres.map((t) => [normaliser(t), t])).entries()].filter(([n]) => n).map(([, t]) => t).slice(0, 3);
    for (const q of demandes) {
      const r = await this.rechercher({ q, type: voeu.type }, options);
      for (const v of r.versions) if (!vues.has(v.id) && correspondAuVoeu(lireVersion(v.nom), voeu)) vues.set(v.id, v);
      for (const s of r.sources) if (!etats.has(s.id) || !s.erreur) etats.set(s.id, s);
    }
    const versions = [...vues.values()].sort((a, b) => b.convient - a.convient || b.note - a.note || (b.sources ?? -1) - (a.sources ?? -1));
    return { versions, sources: [...etats.values()].sort((a, b) => a.nom.localeCompare(b.nom, 'fr')) };
  }

  // Dernières sorties des sources (une recherche sans mot), gardées une demi-heure : pour l'accueil.
  nouveautes(type = null, { profil = null } = {}) {
    const cle = `${type || ''}|${JSON.stringify(lireProfil(profil))}`;
    const garde = this.cacheNouveautes.get(cle);
    if (garde && Date.now() - garde.t < 30 * 60_000) return garde.r;
    const r = this.rechercher({ q: '', type }, { profil, attente: 15_000 });
    this.cacheNouveautes.set(cle, { t: Date.now(), r });
    r.catch(() => this.cacheNouveautes.delete(cle));
    return r;
  }

  // Une version vient d'être envoyée au débrideur : on retient dans quel téléchargement.
  noterEnvoi(idVersion, job) {
    this.envois.set(idVersion, job);
    while (this.envois.size > 500) this.envois.delete(this.envois.keys().next().value);
  }

  // Le magnet ou le fichier .torrent d'une version rendue par rechercher().
  async lienDe(idVersion, { signal } = {}) {
    const v = this.versions.get(idVersion);
    if (!v) throw new ErreurSource('Cette version ne vient pas d’une recherche récente : relance la recherche.');
    return { ...(await this.source(v.source).lienDe(v, { signal })), titre: v.titre };
  }
}
