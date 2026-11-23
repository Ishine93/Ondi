// Génériques des épisodes : où commence et finit l'intro, où commence le générique de fin.
// Tout se fait sur le PC, sans IA ni service extérieur, juste après l'arrivée d'un épisode dans la bibliothèque :
//   - intro : l'empreinte sonore (Chromaprint, compris dans le ffmpeg d'Ondi) des premières minutes de chaque
//     épisode est comparée à celle des épisodes voisins ; le passage qui revient dans la plupart d'entre eux est
//     l'intro. Un thème musical qui ne revient que dans quelques scènes (poursuites…) est écarté.
//   - générique de fin : pareil sur les dernières minutes, à condition d'aller jusqu'au bout du fichier. Quand la
//     musique change à chaque épisode, l'image prend le relais : fond noir (texte du générique) jusqu'à la fin,
//     d'une longueur proche de celle des autres épisodes.
//   - chapitres du fichier : nommés (« Intro », « Opening », « Générique »…), ils font foi ; sinon une limite de
//     chapitre toute proche cale la fin de l'intro à l'image près.
// Chaque repère reçoit une note de confiance (0 à 100) ; le lecteur ne propose de sauter qu'à partir de SEUIL.
// Les empreintes sont gardées (donnees/cache/generiques) : à l'arrivée d'un épisode, seul le sien est lu.
import { spawn, execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { OUTILS } from './video.mjs';

export const SEUIL = 80;
const VERSION = 1;
const PAS = 0.1238; // durée d'un point d'empreinte Chromaprint (s)
const BITS_MAX = 6; // deux points « pareils » : au plus 6 bits différents sur 32
const TROU_MAX = 3.5; // s de différence tolérées au milieu d'un passage commun
const PASSAGE_MIN = 8; // s : plus court, un passage commun n'est pas retenu
const INTRO_MIN = 15;
const INTRO_MAX = 200;
const VOISINS = 8; // épisodes comparés à chaque épisode (les plus proches dans l'ordre)
const fenetreDebut = (duree) => Math.min(600, Math.max(120, duree * 0.35));
const fenetreFin = (duree) => Math.min(360, Math.max(120, duree * 0.3));

// ---------- calcul (pur, lancé dans un fil à part) ----------

// Valeurs qui reviennent sans cesse dans une empreinte (silence, bourdonnement) : deux silences se ressemblent
// toujours, ils ne prouvent rien.
function valeursBanales(pts) {
  const n = new Map();
  for (const v of pts) n.set(v, (n.get(v) || 0) + 1);
  const limite = Math.max(8, pts.length * 0.01);
  return new Set([...n].filter(([, c]) => c > limite).map(([v]) => v));
}

// Tous les passages communs (≥ PASSAGE_MIN) entre a et b, quel que soit le décalage, en secondes dans a.
export function passagesCommuns(a, b) {
  const res = [];
  const minPts = Math.ceil(PASSAGE_MIN / PAS);
  const trou = TROU_MAX / PAS;
  const banalA = valeursBanales(a);
  for (let d = -a.length + 1; d < b.length; d++) {
    const i0 = Math.max(0, -d);
    const i1 = Math.min(a.length, b.length - d);
    if (i1 - i0 < minPts) continue;
    let deb = -1;
    let prec = -1;
    for (let i = i0; i < i1; i++) {
      let x = (a[i] ^ b[i + d]) >>> 0;
      x -= (x >>> 1) & 0x55555555;
      x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
      x = Math.imul((x + (x >>> 4)) & 0x0f0f0f0f, 0x01010101) >>> 24;
      if (x > BITS_MAX || (banalA.size && banalA.has(a[i]))) continue;
      if (deb >= 0 && i - prec > trou) {
        if (prec - deb + 1 >= minPts) res.push([deb * PAS, (prec + 1) * PAS]);
        deb = -1;
      }
      if (deb < 0) deb = i;
      prec = i;
    }
    if (deb >= 0 && prec - deb + 1 >= minPts) res.push([deb * PAS, (prec + 1) * PAS]);
  }
  return res;
}

function fusionner(iv, trou = TROU_MAX) {
  const t = iv.slice().sort((x, y) => x[0] - y[0]);
  const out = [];
  for (const [d, f] of t) {
    const der = out[out.length - 1];
    if (der && d <= der[1] + trou) der[1] = Math.max(der[1], f);
    else out.push([d, f]);
  }
  return out;
}
const chevauche = (x, y) => Math.max(0, Math.min(x[1], y[1]) - Math.max(x[0], y[0]));

// Pour un fichier : les blocs communs avec ses voisins, et dans combien de voisins chacun se retrouve.
// Le début d'un bloc est là où au moins la moitié des voisins qui le contiennent sont d'accord : un bruitage
// repris juste avant l'intro dans un seul autre épisode ne doit pas avancer son début (le bouton apparaîtrait
// encore dans la scène d'avant). Pour la fin, deux voisins suffisent (une fin un peu tôt fait seulement revoir
// la fin de l'intro). Le milieu n'est pas coupé (intro remontée différemment d'un épisode à l'autre).
export function blocsCommuns(pts, voisins) {
  const parVoisin = voisins.map((v) => fusionner(passagesCommuns(pts, v)));
  const blocs = fusionner(parVoisin.flat()).filter(([d, f]) => f - d >= INTRO_MIN);
  const res = [];
  for (const [d, f] of blocs) {
    const dedans = parVoisin.filter((m) => m.some((x) => chevauche(x, [d, f]) >= Math.min(15, 0.5 * (f - d))));
    const k = dedans.length;
    let debut = d;
    let fin = f;
    if (k >= 2) {
      const couverts = (t, seuil) => dedans.filter((m) => m.some((x) => x[0] <= t && t < x[1])).length >= seuil;
      let t = d;
      while (t < f && !couverts(t, Math.max(2, Math.ceil(k / 2)))) t += 0.5;
      debut = t;
      t = f - 0.01;
      while (t > debut && !couverts(t, 2)) t -= 0.5;
      fin = Math.min(f, t + 0.5);
      if (fin - debut < INTRO_MIN) continue;
    }
    res.push({ debut: Math.round(debut * 10) / 10, fin: Math.round(fin * 10) / 10, k });
  }
  return { n: voisins.length, blocs: res };
}

// Note d'un passage retrouvé dans k épisodes voisins sur n. Une intro est dans presque tous ; un thème musical
// repris dans quelques scènes (poursuites…) atteint parfois 3 épisodes sur 5 dans une saison incomplète : il faut
// les trois quarts pour la note pleine. Retrouvé dans un seul autre épisode, ça ne suffit jamais.
export function confianceConsensus(k, n) {
  if (!n || !k) return 0;
  const part = Math.min(1, Math.max(0, (k / n - 0.4) / (0.75 - 0.4)));
  const nombre = k >= 3 ? 1 : k === 2 ? 0.85 : 0.5;
  return Math.round(100 * part * nombre);
}

// Fil de calcul : { taches: [{ id, partie, pts, voisins: [pts…] }] } → { [id:partie]: blocsCommuns }
function calculer({ taches }) {
  const res = {};
  for (const t of taches) res[`${t.id}:${t.partie}`] = blocsCommuns(new Uint32Array(t.pts), t.voisins.map((v) => new Uint32Array(v)));
  return res;
}
if (!isMainThread && workerData?.tache === 'generiques') parentPort.postMessage(calculer(workerData));

function calculerAPart(taches) {
  return new Promise((ok, ko) => {
    const w = new Worker(new URL(import.meta.url), { workerData: { tache: 'generiques', taches } });
    w.once('message', ok);
    w.once('error', ko);
    w.once('exit', (code) => code && ko(new Error(`calcul arrêté (${code})`)));
  });
}

// ---------- choix des repères ----------

const NOMS_CHAPITRE = /^\s*(intro(duction)?|opening( credits)?|op|ouverture|g[ée]n[ée]rique.*|title sequence|main titles?|credits|end credits|closing credits|ending|ed|outro|end titles?|cr[ée]dits)\s*$/i;

// Limite de chapitre la plus proche de t dans [t - avant, t + apres].
function caler(t, chapitres, avant, apres) {
  let mieux = null;
  for (const c of chapitres || []) if (c.debut >= t - avant && c.debut <= t + apres && (mieux == null || Math.abs(c.debut - t) < Math.abs(mieux - t))) mieux = c.debut;
  return mieux;
}

export function choisirIntro(calc, decalage, chapitres, duree) {
  const nomme = (chapitres || []).find((c) => NOMS_CHAPITRE.test(c.titre) && c.debut < duree * 0.35 && c.fin - c.debut >= 10 && c.fin - c.debut <= INTRO_MAX);
  if (nomme) return { debut: nomme.debut, fin: nomme.fin, confiance: 95, source: 'chapitre' };
  if (!calc) return null;
  const choix = calc.blocs
    .filter((b) => b.fin - b.debut >= INTRO_MIN && b.fin - b.debut <= INTRO_MAX)
    .map((b) => ({ ...b, confiance: confianceConsensus(b.k, calc.n) }))
    .sort((x, y) => y.confiance - x.confiance || y.fin - y.debut - (x.fin - x.debut))[0];
  if (!choix) return null;
  let debut = decalage + choix.debut;
  let fin = decalage + choix.fin;
  let confiance = choix.confiance;
  // Fin de l'intro : la musique s'éteint souvent un peu avant le vrai début de l'épisode ; une limite de chapitre
  // juste après (8 s au plus) donne l'endroit exact.
  const finChapitre = caler(fin, chapitres, 3, 8);
  if (finChapitre != null) {
    fin = finChapitre;
    confiance = Math.min(100, confiance + 5);
  }
  const debutChapitre = caler(debut, chapitres, 5, 5);
  if (debutChapitre != null) debut = debutChapitre;
  return { debut: Math.round(debut * 10) / 10, fin: Math.round(fin * 10) / 10, confiance, source: 'son', k: choix.k, n: calc.n };
}

export function choisirFin(calc, decalage, chapitres, duree) {
  const nomme = (chapitres || []).find((c) => NOMS_CHAPITRE.test(c.titre) && c.debut > duree * 0.7 && c.fin >= duree - 30);
  if (nomme) return { debut: nomme.debut, confiance: 95, source: 'chapitre' };
  if (!calc) return null;
  // Le générique va jusqu'au bout du fichier (20 s près) : un passage commun qui s'arrête avant n'en est pas un.
  const choix = calc.blocs
    .filter((b) => decalage + b.fin >= duree - 20 && b.fin - b.debut >= 20)
    .map((b) => ({ ...b, confiance: confianceConsensus(b.k, calc.n) }))
    .sort((x, y) => y.confiance - x.confiance || y.fin - y.debut - (x.fin - x.debut))[0];
  if (!choix) return null;
  let debut = decalage + choix.debut;
  const c = caler(debut, chapitres, 5, 5);
  if (c != null) debut = c;
  return { debut: Math.round(debut * 10) / 10, confiance: choix.confiance, source: 'son', k: choix.k, n: calc.n };
}

// Générique par l'image : la dernière plage noire (texte clair sur fond noir), si elle mène jusqu'à la fin.
// Les plages séparées de 6 s au plus sont réunies ; de 20 s au plus si celle d'avant a déjà l'allure d'un
// générique (40 s ou plus) : un logo animé en couleur (Netflix…) coupe souvent le générique en deux.
export function finParImage(noirs, decalage, duree) {
  const plages = [];
  for (const [d0, f0] of noirs.map(([d, f]) => [decalage + d, decalage + f]).sort((x, y) => x[0] - y[0])) {
    const der = plages[plages.length - 1];
    if (der && (d0 <= der[1] + 6 || (d0 <= der[1] + 20 && der[1] - der[0] >= 40))) der[1] = Math.max(der[1], f0);
    else plages.push([d0, f0]);
  }
  const der = plages[plages.length - 1];
  if (!der || der[1] < duree - 15 || der[1] - der[0] < 30) return null;
  return { debut: Math.round(der[0] * 10) / 10, longueur: Math.round(der[1] - der[0]) };
}

// ---------- outils ffmpeg ----------

const actifs = new Set();
function lancer(args, { garderSortie = false } = {}) {
  return new Promise((ok, ko) => {
    const p = spawn(OUTILS.ffmpeg, args, { windowsHide: true });
    actifs.add(p);
    try {
      os.setPriority(p.pid, os.constants.priority.PRIORITY_BELOW_NORMAL);
    } catch {}
    const sortie = [];
    let erreurs = '';
    if (garderSortie) p.stdout.on('data', (c) => sortie.push(c));
    else p.stdout.resume();
    p.stderr.on('data', (c) => {
      erreurs += c;
      if (erreurs.length > 200_000) erreurs = erreurs.slice(-100_000);
    });
    p.on('error', (e) => {
      actifs.delete(p);
      ko(e);
    });
    p.on('close', (code) => {
      actifs.delete(p);
      if (code) return ko(new Error(erreurs.trim().split('\n').pop() || `ffmpeg ${code}`));
      ok({ sortie: Buffer.concat(sortie), erreurs });
    });
  });
}

// Empreinte sonore de [debut, debut + duree] (première piste audio, mise en stéréo).
async function empreinte(chemin, debut, duree, lent) {
  const args = ['-hide_banner', '-nostdin', '-v', 'error'];
  if (lent) args.push('-readrate', '4');
  args.push('-ss', String(debut), '-t', String(duree), '-i', chemin, '-map', '0:a:0', '-vn', '-sn', '-dn', '-ac', '2', '-f', 'chromaprint', '-fp_format', 'raw', '-');
  const { sortie } = await lancer(args, { garderSortie: true });
  const pts = new Uint32Array(sortie.length >> 2);
  Buffer.from(pts.buffer).set(sortie.subarray(0, pts.length * 4));
  return pts;
}

// Plages noires des dernières minutes (images clés seulement : rapide, précis à quelques secondes). Seule la
// bande du milieu de l'image compte (les bandes noires d'un film au format cinéma faisaient passer une scène
// sombre pour un générique) et le noir doit être franc : 85 % de la bande au moins sous 3 % de luminosité.
export async function plagesNoires(chemin, debut, lent) {
  const args = ['-hide_banner', '-nostdin', '-nostats'];
  if (lent) args.push('-readrate', '4');
  args.push('-skip_frame', 'nokey', '-ss', String(debut), '-i', chemin, '-map', '0:v:0', '-an', '-sn', '-dn', '-vf', 'crop=iw:ih*0.5:0:ih*0.25,scale=320:-2,blackdetect=d=1:pix_th=0.03:pic_th=0.85', '-f', 'null', '-');
  const { erreurs } = await lancer(args);
  return [...erreurs.matchAll(/black_start:([\d.]+) black_end:([\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
}

function chapitresDe(chemin) {
  return new Promise((ok) => {
    execFile(OUTILS.ffprobe, ['-v', 'error', '-show_chapters', '-of', 'json', chemin], { timeout: 30_000, windowsHide: true, maxBuffer: 1 << 22 }, (e, sortie) => {
      if (e) return ok([]);
      try {
        ok((JSON.parse(sortie).chapters || []).map((c) => ({ debut: Number(c.start_time), fin: Number(c.end_time), titre: c.tags?.title || '' })));
      } catch {
        ok([]);
      }
    });
  });
}

let chromaprint = null;
function chromaprintDispo() {
  if (chromaprint) return chromaprint;
  chromaprint = new Promise((ok) => execFile(OUTILS.ffmpeg, ['-hide_banner', '-muxers'], { windowsHide: true, timeout: 20_000 }, (e, s) => ok(!e && /chromaprint/.test(String(s)))));
  return chromaprint;
}

// ---------- suivi de la bibliothèque ----------

const signature = (f) => `${f.taille}:${f.mtime}`;
const pause = (ms) => new Promise((ok) => setTimeout(ok, ms));

export class Generiques {
  constructor({ bibliotheque, dossierDonnees, journal = () => {}, occupe = () => false }) {
    this.bibliotheque = bibliotheque;
    this.journal = journal;
    this.occupe = occupe;
    this.fichierEtat = path.join(dossierDonnees, 'generiques.json');
    this.dossierEmpreintes = path.join(dossierDonnees, 'cache', 'generiques');
    let e = {};
    try {
      e = JSON.parse(fs.readFileSync(this.fichierEtat, 'utf8'));
    } catch {}
    if (e.version !== VERSION) e = {};
    this.fichiers = e.fichiers || {}; // id → { sig, intro, fin, t }
    this.saisons = e.saisons || {}; // clé de saison → signature des épisodes comparés
    this.file = [];
    this.enCours = null;
    this.arrete = false;
  }

  sauver() {
    fs.mkdirSync(path.dirname(this.fichierEtat), { recursive: true });
    const tmp = `${this.fichierEtat}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ version: VERSION, fichiers: this.fichiers, saisons: this.saisons }));
    fs.renameSync(tmp, this.fichierEtat);
  }

  // Repères assez sûrs pour être proposés (null si rien).
  reperes(id) {
    const r = this.fichiers[id];
    const f = this.bibliotheque.fichier(id);
    if (!r || !f || r.sig !== signature(f)) return null;
    const intro = r.intro && r.intro.confiance >= SEUIL ? { debut: r.intro.debut, fin: r.intro.fin } : null;
    const fin = r.fin && r.fin.confiance >= SEUIL ? { debut: r.fin.debut } : null;
    return intro || fin ? { intro, fin } : null;
  }

  // Saisons dont les épisodes ont changé depuis la dernière analyse (épisode arrivé, remplacé, parti).
  planifier() {
    const { series } = this.bibliotheque.regrouper();
    const aFaire = [];
    for (const g of series.values()) {
      const numeros = [...g.saisons.keys()].sort((a, b) => a - b);
      const liste = numeros.flatMap((n) => [...g.saisons.get(n).entries()].sort((a, b) => a[0] - b[0]).map(([ep, ids]) => ({ saison: n, ep, ids })));
      for (const n of numeros) {
        const eps = liste.filter((x) => x.saison === n);
        // Saison de moins de 4 épisodes : on compare aussi avec les saisons voisines (l'intro change rarement).
        let groupe = eps;
        if (eps.length < 4) {
          const i0 = liste.indexOf(eps[0]);
          const i1 = liste.indexOf(eps[eps.length - 1]);
          groupe = liste.slice(Math.max(0, i0 - 3), i1 + 4);
        }
        if (groupe.length < 2) continue;
        const cle = `${g.cle}:${n}`;
        const sig = crypto
          .createHash('sha1')
          .update(groupe.map((x) => x.ids.map((id) => `${id}:${signature(this.bibliotheque.fichier(id))}`).join(',')).join('|'))
          .digest('hex')
          .slice(0, 16);
        if (this.saisons[cle] === sig) continue;
        aFaire.push({ cle, sig, titre: `${g.titreFichier} saison ${n}`, cibles: eps, groupe, ajoute: Math.max(...eps.flatMap((x) => x.ids.map((id) => this.bibliotheque.fichier(id)?.ajoute || 0))) });
      }
    }
    // Les saisons qui viennent de recevoir un épisode d'abord.
    aFaire.sort((a, b) => b.ajoute - a.ajoute);
    this.file = aFaire;
    if (!this.enCours && aFaire.length) {
      this.enCours = this.travailler().finally(() => {
        this.enCours = null;
      });
    }
  }

  arreter() {
    this.arrete = true;
    for (const p of actifs) p.kill('SIGKILL');
  }

  async travailler() {
    while (this.file.length && !this.arrete) {
      const s = this.file.shift();
      try {
        await this.analyserSaison(s);
      } catch (e) {
        this.journal(`Génériques : ${s.titre} non analysée (${e.message})`);
        await pause(60_000);
      }
    }
  }

  cheminEmpreinte(id, partie) {
    return path.join(this.dossierEmpreintes, `${id}.${partie}.bin`);
  }

  // Empreinte d'un fichier (lue sur le disque si déjà faite pour ce fichier-là).
  async empreinteDe(id, partie) {
    const f = this.bibliotheque.fichier(id);
    const duree = f?.sonde?.duree;
    if (!duree || !f.sonde.audios?.length) return null;
    const longueur = partie === 'debut' ? fenetreDebut(duree) : fenetreFin(duree);
    const decalage = partie === 'debut' ? 0 : Math.max(0, duree - longueur);
    const chemin = this.cheminEmpreinte(id, partie);
    const sig = `${signature(f)}:${Math.round(decalage)}:${Math.round(longueur)}`;
    try {
      const b = fs.readFileSync(chemin);
      const lg = b.readUInt16LE(0);
      if (b.toString('utf8', 2, 2 + lg) === sig) {
        const pts = new Uint32Array((b.length - 2 - lg) >> 2);
        Buffer.from(pts.buffer).set(b.subarray(2 + lg, 2 + lg + pts.length * 4));
        return { pts, decalage };
      }
    } catch {}
    const pts = await empreinte(f.chemin, decalage, longueur, this.occupe());
    fs.mkdirSync(this.dossierEmpreintes, { recursive: true });
    const entete = Buffer.from(sig, 'utf8');
    const lg = Buffer.alloc(2);
    lg.writeUInt16LE(entete.length);
    fs.writeFileSync(chemin, Buffer.concat([lg, entete, Buffer.from(pts.buffer, pts.byteOffset, pts.byteLength)]));
    return { pts, decalage };
  }

  async analyserSaison(s) {
    const t0 = Date.now();
    const avecSon = await chromaprintDispo();
    if (!avecSon && !this.sansSonSignale) {
      this.sansSonSignale = true;
      this.journal(`Génériques : ce ffmpeg (${OUTILS.ffmpeg}) ne sait pas faire d'empreinte sonore (Chromaprint) : seul le générique de fin sera repéré.`);
    }
    const empreintes = {}; // `${id}:${partie}` → { pts, decalage }
    const representant = (x) => x.ids[0];
    // Empreintes : chaque version des épisodes de la saison, et un fichier par épisode voisin.
    const aLire = new Set([...s.cibles.flatMap((x) => x.ids), ...s.groupe.map(representant)]);
    if (avecSon) {
      for (const id of aLire) {
        if (this.arrete) return;
        for (const partie of ['debut', 'fin']) {
          try {
            const e = await this.empreinteDe(id, partie);
            if (e) empreintes[`${id}:${partie}`] = e;
          } catch (e) {
            this.journal(`Génériques : empreinte impossible pour ${this.bibliotheque.fichier(id)?.rel} (${e.message})`);
          }
        }
      }
    }
    // Comparaisons, dans un fil à part (quelques secondes de calcul par saison).
    const taches = [];
    for (const ep of s.cibles) {
      const i = s.groupe.indexOf(ep);
      const voisins = s.groupe
        .filter((x) => x !== ep)
        .sort((a, b) => Math.abs(s.groupe.indexOf(a) - i) - Math.abs(s.groupe.indexOf(b) - i))
        .slice(0, VOISINS);
      for (const id of ep.ids) {
        for (const partie of ['debut', 'fin']) {
          const e = empreintes[`${id}:${partie}`];
          const vs = voisins.map((v) => empreintes[`${representant(v)}:${partie}`]).filter(Boolean);
          if (e && vs.length) taches.push({ id, partie, pts: e.pts.buffer.slice(0), voisins: vs.map((v) => v.pts.buffer.slice(0)) });
        }
      }
    }
    const calculs = taches.length ? await calculerAPart(taches) : {};
    if (this.arrete) return;

    // Repères de chaque fichier de la saison.
    const resultats = {};
    for (const ep of s.cibles) {
      for (const id of ep.ids) {
        const f = this.bibliotheque.fichier(id);
        if (!f?.sonde?.duree) continue;
        const duree = f.sonde.duree;
        const chapitres = await chapitresDe(f.chemin);
        const intro = choisirIntro(calculs[`${id}:debut`], empreintes[`${id}:debut`]?.decalage || 0, chapitres, duree);
        let fin = choisirFin(calculs[`${id}:fin`], empreintes[`${id}:fin`]?.decalage || 0, chapitres, duree);
        let image = null;
        if (!fin || fin.confiance < SEUIL) {
          const decalage = Math.max(0, duree - fenetreFin(duree));
          try {
            image = finParImage(await plagesNoires(f.chemin, decalage, this.occupe()), decalage, duree);
          } catch {}
        }
        resultats[id] = { f, intro, fin, image };
      }
    }
    // Générique trouvé par l'image : retenu si sa longueur ressemble à celle d'au moins deux autres épisodes
    // (un quart près, 20 s au moins). Seul de sa saison, il attend que d'autres épisodes arrivent.
    const longueurs = (sauf) =>
      Object.entries(resultats)
        .filter(([id, r]) => id !== sauf && (r.image || (r.fin && r.fin.confiance >= SEUIL)))
        .map(([, r]) => (r.image ? r.image.longueur : r.f.sonde.duree - r.fin.debut));
    for (const [id, r] of Object.entries(resultats)) {
      if (!r.image) continue;
      const autres = longueurs(id).sort((a, b) => a - b);
      const mediane = autres[autres.length >> 1];
      const proche = autres.length >= 2 && Math.abs(r.image.longueur - mediane) <= Math.max(20, mediane * 0.25);
      const note = { debut: r.image.debut, longueur: r.image.longueur, confiance: proche ? 85 : 65, source: 'image', autres: autres.length };
      if (!r.fin || note.confiance > r.fin.confiance) r.fin = note;
    }
    let intros = 0;
    let fins = 0;
    for (const [id, r] of Object.entries(resultats)) {
      this.fichiers[id] = { sig: signature(r.f), intro: r.intro, fin: r.fin, t: Date.now() };
      if (r.intro?.confiance >= SEUIL) intros++;
      if (r.fin?.confiance >= SEUIL) fins++;
    }
    this.saisons[s.cle] = s.sig;
    this.sauver();
    const n = Object.keys(resultats).length;
    this.journal(`Génériques : ${s.titre} — intro ${intros}/${n}, générique de fin ${fins}/${n} (${Math.round((Date.now() - t0) / 1000)} s)`);
  }
}
