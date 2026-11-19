// Lecture des vidéos de la bibliothèque, comme Jellyfin :
//   direct     : le fichier tel quel (MP4 que l'appareil sait lire), avec avance rapide native ;
//   remux      : l'image est recopiée sans perte, le son est converti si l'appareil ne le lit pas
//                (DTS, TrueHD, AC3 sur PC…), le tout repaqueté en MP4 fragmenté à la volée ;
//   conversion : l'image est réencodée par la carte graphique (NVIDIA, Intel… sinon le processeur) :
//                débit plus léger pour le Wi-Fi, HDR → SDR pour un écran qui ne l'affiche pas,
//                sous-titres « image » (PGS) incrustés.
// Pour avancer dans un flux converti, la page demande une nouvelle session à partir de la position voulue :
// le flux commence au point clé juste avant (renvoyé dans « debut »), la page ajoute ce décalage à l'horloge.
import { spawn, execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { OUTILS, encodeurMateriel } from './video.mjs';

const TYPES_DIRECTS = { mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm', mov: 'video/mp4' };

// Point clé (image complète) juste avant t : c'est là que ffmpeg commencera en recopiant l'image.
function pointCle(chemin, indexVideo, t) {
  if (t <= 0.5) return Promise.resolve(0);
  return new Promise((ok) => {
    execFile(
      OUTILS.ffprobe,
      ['-v', 'error', '-select_streams', String(indexVideo === undefined ? 'v:0' : indexVideo), '-read_intervals', `${t}%+#8`, '-show_entries', 'packet=pts_time,flags', '-of', 'csv=p=0', chemin],
      { timeout: 15_000, windowsHide: true },
      (e, sortie) => {
        if (e) return ok(t);
        const cles = String(sortie)
          .split(/\r?\n/)
          .filter((l) => /K/.test(l.split(',')[1] || ''))
          .map((l) => Number(l.split(',')[0]))
          .filter((x) => Number.isFinite(x));
        ok(cles.length ? Math.min(...cles) : t);
      },
    );
  });
}

// Débit cible → hauteur de sortie (en gardant le format de l'image).
function hauteurPour(debitMbps, hauteurSource) {
  const h = debitMbps >= 25 ? 2160 : debitMbps >= 7 ? 1080 : debitMbps >= 3 ? 720 : 480;
  return Math.min(h, hauteurSource || h);
}

// Sous-titres image (PGS…) : leur toile est souvent en 16:9 (1920 × 1080) alors que l'image d'un film en
// 2.39 est rognée (3840 × 1608). La toile est agrandie pour tenir dans l'image sans être déformée, puis
// centrée : les sous-titres restent dans l'image, à leur place relative.
export function echelleSousTitres(v, H) {
  const W = 2 * Math.round((H * (v.largeur || 16)) / (v.hauteur || 9) / 2);
  return `scale=w=${W}:h=${H}:force_original_aspect_ratio=decrease:force_divisible_by=2`;
}

// ---------- durée annoncée dans le flux ----------
// ffmpeg écrit un MP4 fragmenté dont l'en-tête (moov) annonce une durée nulle : la suite arrive morceau par
// morceau. Les télés Samsung prennent alors la durée du premier morceau (2 s) et leur horloge (currentTime) s'y
// arrête alors que l'image continue : barre figée, reprise fausse, fin du film prise pour une coupure.
// On écrit la durée dans l'en-tête (mvhd, tkhd, mdhd) et on ajoute la durée totale des fragments (mehd).
const CONTENANTS = new Set(['moov', 'trak', 'mdia', 'mvex']);
export function annoncerDuree(moov, secondes) {
  if (!(secondes > 0) || moov.length < 8 || moov.readUInt32BE(0) !== moov.length || moov.toString('latin1', 4, 8) !== 'moov') return moov;
  const b = Buffer.from(moov);
  let echelle = 0;
  let mvex = -1;
  let mehd = -1;
  const ecrire = (p, v1, unites) => (v1 ? b.writeBigUInt64BE(BigInt(Math.round(secondes * unites)), p) : b.writeUInt32BE(Math.min(0xffffffff, Math.round(secondes * unites)), p));
  const parcourir = (debut, fin) => {
    for (let p = debut; p + 12 <= fin; ) {
      const taille = b.readUInt32BE(p);
      if (taille < 8 || p + taille > fin) return;
      const type = b.toString('latin1', p + 4, p + 8);
      const v1 = b[p + 8] === 1;
      if (type === 'mvhd') {
        echelle = b.readUInt32BE(p + (v1 ? 28 : 20));
        ecrire(p + (v1 ? 32 : 24), v1, echelle);
      } else if (type === 'tkhd' && echelle) ecrire(p + (v1 ? 36 : 28), v1, echelle);
      else if (type === 'mdhd') ecrire(p + (v1 ? 32 : 24), v1, b.readUInt32BE(p + (v1 ? 28 : 20)));
      else if (type === 'mehd' && echelle) {
        mehd = p;
        ecrire(p + 12, v1, echelle);
      } else if (type === 'mvex') mvex = p;
      if (CONTENANTS.has(type)) parcourir(p + 8, p + taille);
      p += taille;
    }
  };
  parcourir(8, b.length);
  if (mvex < 0 || mehd >= 0 || !echelle) return b;
  // mehd en tête de mvex : mvex et moov grandissent d'autant. Les fragments repèrent leurs données depuis leur
  // propre en-tête (default_base_moof) : rien d'autre à décaler.
  const boite = Buffer.alloc(16);
  boite.writeUInt32BE(16, 0);
  boite.write('mehd', 4, 'latin1');
  boite.writeUInt32BE(Math.min(0xffffffff, Math.round(secondes * echelle)), 12);
  const r = Buffer.concat([b.subarray(0, mvex + 8), boite, b.subarray(mvex + 8)]);
  r.writeUInt32BE(r.readUInt32BE(mvex) + 16, mvex);
  r.writeUInt32BE(r.length, 0);
  return r;
}

// Envoie la sortie de ffmpeg en réécrivant au passage son en-tête (ftyp puis moov) avec la durée.
function envoyerAvecDuree(sortie, res, secondes) {
  if (!secondes) return sortie.pipe(res);
  let tampon = Buffer.alloc(0);
  const lacher = (debut) => {
    sortie.off('data', surDonnees);
    res.write(debut);
    sortie.pipe(res);
  };
  const surDonnees = (morceau) => {
    tampon = Buffer.concat([tampon, morceau]);
    for (let p = 0; p + 8 <= tampon.length; ) {
      const taille = tampon.readUInt32BE(p);
      const type = tampon.toString('latin1', p + 4, p + 8);
      // Inattendu (ou en-tête démesuré) : envoyé tel quel.
      if (taille < 8 || (type !== 'ftyp' && type !== 'moov') || taille > 16e6) return lacher(tampon);
      if (p + taille > tampon.length) return;
      if (type === 'moov') {
        let moov = tampon.subarray(p, p + taille);
        try {
          moov = annoncerDuree(moov, secondes);
        } catch {}
        return lacher(Buffer.concat([tampon.subarray(0, p), moov, tampon.subarray(p + taille)]));
      }
      p += taille;
    }
  };
  sortie.on('data', surDonnees);
}

// Extraction des sous-titres texte à la demande : à partir de la position regardée, d'abord une avance
// rapide (90 s), puis 4 fois plus vite que la lecture, pour ne pas disputer le disque au flux vidéo.
const AVANCE_INITIALE = 90;
const VITESSE_FENETRE = 4;

export class Lecture {
  constructor({ bibliotheque, dossierCache, journal = () => {} }) {
    this.bibliotheque = bibliotheque;
    this.journal = journal;
    this.dossierSousTitres = path.join(dossierCache, 'sous-titres');
    this.sessions = new Map(); // id → session
    this.extractions = new Map(); // fichierId → promesse
    this.fenetres = new Map(); // `${fichierId}:${index}` → extraction à la demande depuis la position regardée
    this.processusExtraction = new Map(); // fichierId → ffmpeg de l'extraction complète en arrière-plan
    this.echecs = new Map(); // fichierId → extractions ratées (le préparatif en arrière-plan abandonne après 2)
    this.actifs = new Set(); // processus ffmpeg en cours
    // Restes d'une extraction coupée (Ondi arrêté pendant) : à refaire.
    try {
      for (const n of fs.readdirSync(this.dossierSousTitres)) {
        const chemin = path.join(this.dossierSousTitres, n);
        if (n.endsWith('.partiel') || (n.endsWith('.vtt') && fs.statSync(chemin).size === 0)) fs.rmSync(chemin, { force: true });
      }
    } catch {}
    setInterval(() => this.menage(), 60_000).unref();
  }

  menage() {
    const limite = Date.now() - 6 * 3600e3;
    for (const [id, s] of this.sessions) if (s.cree < limite && !s.processus) this.sessions.delete(id);
    // Sous-titres à la demande que plus personne ne demande (lecteur fermé) : arrêtés et effacés.
    for (const w of [...this.fenetres.values()]) if (Date.now() - w.vu > 3 * 60_000) this.fermerFenetre(w);
  }

  arreterTout() {
    for (const p of this.actifs) p.kill('SIGKILL');
  }

  // ---------- choix du mode ----------

  async preparer({ fichierId, position = 0, audio, qualite = 'auto', caps = {}, sousTitreImage = null }) {
    const f = this.bibliotheque.fichier(fichierId);
    if (!f?.sonde?.video) throw new Error('Fichier introuvable ou illisible.');
    const s = f.sonde;
    const v = s.video;
    const pisteAudio = s.audios.find((a) => a.ordre === Number(audio)) || s.audios.find((a) => a.defaut) || s.audios[0] || null;
    const raisons = [];
    // Sous-titres image à incruster (une piste vide est ignorée : ffmpeg attendrait sa première image jusqu'à la fin du fichier).
    const pisteImage = sousTitreImage == null ? null : s.sousTitres.find((x) => x.ordre === Number(sousTitreImage) && !x.vide) || null;

    // L'image peut-elle être recopiée telle quelle ?
    let videoOk =
      (v.codec === 'h264' && v.bits <= 8) ||
      (v.codec === 'hevc' && caps.hevc && (v.bits <= 8 || caps.hevc10)) ||
      (v.codec === 'av1' && caps.av1) ||
      (v.codec === 'vp9' && caps.vp9);
    if (!videoOk) raisons.push(`image ${v.codec.toUpperCase()}${v.bits > 8 ? ` ${v.bits} bits` : ''} non lue par cet appareil`);
    if (videoOk && v.hdr && !caps.hdr) {
      videoOk = false;
      raisons.push(`${v.hdr} → SDR`);
    }
    if (videoOk && v.hdr === 'Dolby Vision' && v.dvProfil === 5 && !caps.dv) {
      videoOk = false;
      raisons.push('Dolby Vision profil 5');
    }
    const maxH = Number(caps.maxHauteur) || 2160;
    if (videoOk && Math.min(v.hauteur, v.largeur * 9 / 16) > maxH * 1.05) {
      videoOk = false;
      raisons.push(`définition trop haute pour cet appareil`);
    }
    const debitSource = (s.debit || 0) / 1e6;
    let cible = null; // Mbit/s si conversion
    if (qualite !== 'original' && qualite !== 'auto') {
      const q = Number(qualite);
      if (q && (!debitSource || debitSource > q * 1.15)) {
        videoOk = false;
        cible = q;
        raisons.push(`débit réduit à ${q} Mbit/s`);
      }
    } else if (qualite === 'auto' && caps.debitMax && debitSource > Number(caps.debitMax) * 1.1) {
      videoOk = false;
      cible = Number(caps.debitMax);
      raisons.push(`fichier trop lourd pour la connexion (${Math.round(debitSource)} Mbit/s)`);
    }
    if (pisteImage) {
      if (videoOk) raisons.push('sous-titres image incrustés');
      videoOk = false;
    }

    // Le son peut-il être recopié ?
    const codecsAudio = new Set(['aac', 'mp3', ...(caps.opus ? ['opus'] : []), ...(caps.flac ? ['flac'] : []), ...(caps.ac3 ? ['ac3'] : []), ...(caps.eac3 ? ['eac3'] : []), ...(caps.dts ? ['dts'] : [])]);
    const audioOk = !pisteAudio || codecsAudio.has(pisteAudio.codec);
    const audioSortie = audioOk ? 'copie' : caps.eac3 && pisteAudio.canaux > 2 ? 'eac3' : 'aac';

    const ext = path.extname(f.chemin).slice(1).toLowerCase();
    const premiereAudio = s.audios[0];
    const mode =
      videoOk && audioOk && TYPES_DIRECTS[ext] && (!pisteAudio || pisteAudio === premiereAudio) && !pisteImage ? 'direct' : videoOk ? 'remux' : 'conversion';

    const id = crypto.randomBytes(9).toString('base64url');
    if (mode === 'direct') {
      this.sessions.set(id, { id, mode, fichierId, cree: Date.now() });
      return { session: id, url: `/api/direct/${fichierId}`, debut: 0, mode, details: 'Lecture directe', duree: s.duree };
    }

    const encodeur = await encodeurMateriel();
    const sortieHevc = mode === 'conversion' && caps.hevc && encodeur.nom !== 'processeur';
    const garderHdr = mode === 'conversion' && v.hdr && caps.hdr && sortieHevc && caps.hevc10;
    const debut = mode === 'remux' ? await pointCle(f.chemin, v.index, Math.max(0, Number(position) || 0)) : Math.max(0, Number(position) || 0);
    if (mode === 'conversion' && !cible) cible = Math.min(Number(caps.debitMax) || 40, 60);
    const session = {
      id,
      mode,
      fichierId,
      chemin: f.chemin,
      debut,
      video: v,
      pisteAudio,
      audioSortie,
      cible,
      encodeur,
      sortieHevc,
      garderHdr,
      sousTitreImage: pisteImage,
      duree: s.duree,
      cree: Date.now(),
    };
    this.sessions.set(id, session);
    const hauteur = mode === 'conversion' ? hauteurPour(cible, v.hauteur) : v.hauteur;
    const details =
      mode === 'remux'
        ? `Image d'origine${audioOk ? '' : ` · son converti (${audioSortie === 'eac3' ? 'Dolby Digital+ 5.1' : 'AAC stéréo'})`}`
        : `Converti par ${encodeur.nom === 'processeur' ? 'le processeur' : `la carte graphique (${encodeur.nom})`} · ${hauteur >= 2000 ? '4K' : `${hauteur}p`} ${sortieHevc ? 'HEVC' : 'H.264'}${garderHdr ? ' HDR' : ''} · ${cible} Mbit/s`;
    return { session: id, url: `/api/flux/${id}.mp4`, debut, mode, details, raisons, duree: s.duree };
  }

  // ---------- arguments ffmpeg ----------

  arguments(s) {
    const v = s.video;
    const a = ['-hide_banner', '-v', 'error', '-nostdin'];
    const nvidia = s.mode === 'conversion' && s.encodeur.nom === 'nvidia' && ['h264', 'hevc', 'av1', 'vp9', 'mpeg2video'].includes(v.codec);
    if (nvidia) a.push('-hwaccel', 'cuda', '-hwaccel_output_format', 'cuda', '-extra_hw_frames', '4');
    // Image recopiée : le flux doit commencer pile sur le point clé « debut ». ffmpeg cherche 0,13 s plus tôt
    // quand la vidéo a des images B, ce qui le faisait repartir du point clé d'avant (une seconde de trop) :
    // on vise un peu après.
    if (s.debut > 0) a.push('-ss', (s.mode === 'remux' ? s.debut + 0.15 : s.debut).toFixed(3));
    a.push('-i', s.chemin);
    const audio = s.pisteAudio ? ['-map', `0:${s.pisteAudio.index}`] : [];

    if (s.mode === 'remux') {
      a.push('-map', `0:${v.index}`, ...audio, '-c:v', 'copy');
      if (v.codec === 'hevc') {
        a.push('-tag:v', 'hvc1');
        // Dolby Vision profil 8 : on garde la base HDR10 (la plupart des navigateurs refusent les données DV).
        if (v.hdr === 'Dolby Vision' && v.dvProfil === 8) a.push('-bsf:v', 'dovi_rpu=strip=1');
      }
    } else {
      const H = hauteurPour(s.cible, v.hauteur);
      const W = -2;
      const sdr = v.hdr && !s.garderHdr;
      const enc = s.sortieHevc ? s.encodeur.hevc : s.encodeur.h264;
      let filtres;
      let complexe = null;
      if (nvidia) {
        const fmt = s.garderHdr ? 'p010le' : sdr ? 'p010le' : 'yuv420p';
        const chaine = [`scale_cuda=w=${W}:h=${H}:format=${fmt}:interp_algo=bicubic`];
        if (sdr) chaine.push('tonemap_cuda=format=yuv420p:p=bt709:t=bt709:m=bt709:tonemap=bt2390:peak=100:desat=0');
        filtres = chaine.join(',');
        if (s.sousTitreImage) {
          complexe = `[0:${s.sousTitreImage.index}]${echelleSousTitres(v, H)},format=yuva420p,hwupload=derive_device=cuda[st];[0:${v.index}]${filtres}[img];[img][st]overlay_cuda=x=(W-w)/2:y=(H-h)/2:eof_action=pass:repeatlast=0[sortie]`;
        }
      } else {
        const chaine = [];
        if (sdr) chaine.push('tonemapx=tonemap=bt2390:desat=0:peak=100:t=bt709:m=bt709:p=bt709:format=yuv420p');
        chaine.push(`scale=w=${W}:h=${H}:flags=bicubic`, `format=${s.garderHdr ? 'p010le' : 'yuv420p'}`);
        filtres = chaine.join(',');
        if (s.sousTitreImage) complexe = `[0:${v.index}]${filtres}[img];[0:${s.sousTitreImage.index}]${echelleSousTitres(v, H)}[st];[img][st]overlay=x=(W-w)/2:y=(H-h)/2:eof_action=pass:repeatlast=0[sortie]`;
      }
      if (complexe) a.push('-filter_complex', complexe, '-map', '[sortie]', ...audio);
      else a.push('-map', `0:${v.index}`, ...audio, '-vf', filtres);
      const b = `${s.cible}M`;
      a.push('-c:v', enc);
      if (/nvenc/.test(enc)) a.push('-preset', 'p4', '-tune', 'hq', '-rc', 'vbr', '-spatial_aq', '1');
      else if (/qsv/.test(enc)) a.push('-preset', 'faster');
      else if (enc === 'libx264' || enc === 'libx265') a.push('-preset', 'veryfast');
      a.push('-b:v', b, '-maxrate', `${Math.round(s.cible * 1.5)}M`, '-bufsize', `${s.cible * 2}M`, '-g', '48', '-keyint_min', '48');
      if (s.sortieHevc) {
        a.push('-tag:v', 'hvc1');
        if (s.garderHdr) a.push('-profile:v', 'main10', '-color_primaries', 'bt2020', '-color_trc', v.hdr === 'HLG' ? 'arib-std-b67' : 'smpte2084', '-colorspace', 'bt2020nc');
      } else a.push('-profile:v', 'high');
      if (sdr) a.push('-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709');
    }
    if (s.pisteAudio) {
      if (s.audioSortie === 'copie') a.push('-c:a', 'copy');
      else if (s.audioSortie === 'eac3') a.push('-c:a', 'eac3', '-ac', String(Math.min(6, s.pisteAudio.canaux)), '-b:a', '640k');
      else a.push('-c:a', 'aac', '-ac', '2', '-b:a', '224k');
    }
    a.push('-sn', '-dn', '-map_metadata', '-1', '-map_chapters', '-1', '-max_muxing_queue_size', '4096');
    // Image convertie et son recopié : ffmpeg recopie aussi le son d'avant la position (jusqu'à une demi-
    // seconde) ; on le retire, sinon tout le flux est décalé d'autant.
    if (s.mode === 'conversion' && s.debut > 0) a.push('-ss', '0');
    // Pas de liste de montage (« edit list ») : les télés Samsung l'ignorent dans un MP4 fragmenté, et le son
    // arrivait jusqu'à 0,4 s après l'image. Sans elle, chaque piste porte son vrai départ : synchro juste partout.
    a.push('-use_editlist', '0');
    a.push('-f', 'mp4', '-movflags', 'frag_keyframe+empty_moov+delay_moov+default_base_moof', '-frag_duration', '2000000', 'pipe:1');
    return a;
  }

  // ---------- envoi ----------

  flux(id, req, res) {
    const s = this.sessions.get(id);
    if (!s || s.mode === 'direct') {
      res.writeHead(404);
      return res.end();
    }
    // Une seule lecture par session : un nouvel appel (le navigateur qui relance) arrête l'ancienne.
    if (s.processus) s.processus.kill('SIGKILL');
    this.arreterExtractions();
    const args = this.arguments(s);
    const p = spawn(OUTILS.ffmpeg, args, { windowsHide: true });
    s.processus = p;
    this.actifs.add(p);
    let erreurs = '';
    p.stderr.on('data', (d) => {
      if (erreurs.length < 4000) erreurs += d;
    });
    res.writeHead(200, { 'Content-Type': 'video/mp4', 'Cache-Control': 'no-store', 'Accept-Ranges': 'none' });
    // Durée de ce qui reste à lire (+ 2 s de marge : annoncer moins que la réalité arrêterait l'horloge avant la fin).
    envoyerAvecDuree(p.stdout, res, s.duree ? Math.max(1, s.duree - s.debut + 2) : 0);
    const fin = () => {
      if (!p.killed && p.exitCode === null) p.kill('SIGKILL');
    };
    req.on('close', fin);
    res.on('close', fin);
    p.on('close', (code) => {
      this.actifs.delete(p);
      if (s.processus === p) s.processus = null;
      if (code && code !== 255 && !res.destroyed && erreurs.trim()) this.journal(`Lecture (${s.mode}) : ffmpeg ${code} — ${erreurs.trim().split('\n').slice(-3).join(' | ')}`);
      res.end();
    });
  }

  direct(fichierId, req, res) {
    const f = this.bibliotheque.fichier(fichierId);
    const type = f && TYPES_DIRECTS[path.extname(f.chemin).slice(1).toLowerCase()];
    if (!type) {
      res.writeHead(404);
      return res.end();
    }
    const taille = fs.statSync(f.chemin).size;
    const m = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
    if (m) {
      let debut = m[1] ? Number(m[1]) : taille - Number(m[2]);
      let fin = m[1] && m[2] ? Number(m[2]) : taille - 1;
      if (!(debut >= 0 && debut < taille)) {
        res.writeHead(416, { 'Content-Range': `bytes */${taille}` });
        return res.end();
      }
      fin = Math.min(fin, taille - 1);
      res.writeHead(206, { 'Content-Type': type, 'Content-Length': fin - debut + 1, 'Content-Range': `bytes ${debut}-${fin}/${taille}`, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store' });
      if (req.method === 'HEAD') return res.end();
      return fs.createReadStream(f.chemin, { start: debut, end: fin }).pipe(res);
    }
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': taille, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store' });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(f.chemin).pipe(res);
  }

  // ---------- sous-titres texte → WebVTT ----------
  // En arrière-plan (quand rien n'est lu), toutes les pistes texte d'un fichier sont extraites d'un coup (un
  // seul passage sur le disque) et gardées en cache. Pendant une lecture, la piste choisie est extraite à la
  // demande à partir de la position regardée (« fenêtre ») : la page a ses sous-titres en une seconde, même
  // au milieu d'un film de 50 Go pas encore préparé.

  cheminVtt(fichierId, cle) {
    return path.join(this.dossierSousTitres, `${fichierId}-${cle}.vtt`);
  }

  extraire(fichierId) {
    if (this.extractions.has(fichierId)) return this.extractions.get(fichierId);
    // Une extraction à la demande lit déjà ce fichier pour la lecture en cours : pas deux à la fois.
    if ([...this.fenetres.values()].some((w) => w.fichierId === fichierId && !w.fini)) return Promise.resolve();
    const f = this.bibliotheque.fichier(fichierId);
    fs.mkdirSync(this.dossierSousTitres, { recursive: true });
    // Piste texte vide : un WebVTT vide en cache, pour que la préparation en arrière-plan passe au fichier suivant.
    for (const x of (f?.sonde?.sousTitres || []).filter((y) => y.texte && y.vide)) {
      try {
        if (!fs.existsSync(this.cheminVtt(fichierId, x.index))) fs.writeFileSync(this.cheminVtt(fichierId, x.index), 'WEBVTT\n\n');
      } catch {}
    }
    const pistes = (f?.sonde?.sousTitres || []).filter((x) => x.texte && !x.vide);
    const manquantes = pistes.filter((x) => !fs.existsSync(this.cheminVtt(fichierId, x.index)));
    if (!manquantes.length) return Promise.resolve();
    const args = ['-hide_banner', '-v', 'error', '-nostdin', '-y', '-i', f.chemin];
    for (const x of manquantes) args.push('-map', `0:${x.index}`, '-c:s', 'webvtt', '-flush_packets', '1', '-f', 'webvtt', `${this.cheminVtt(fichierId, x.index)}.partiel`);
    const promesse = new Promise((ok) => {
      const p = spawn(OUTILS.ffmpeg, args, { windowsHide: true });
      this.actifs.add(p);
      this.processusExtraction.set(fichierId, p);
      let erreurs = '';
      p.stderr.on('data', (d) => (erreurs += d));
      p.on('close', (code) => {
        this.actifs.delete(p);
        this.processusExtraction.delete(fichierId);
        // Arrêtée pour laisser le disque à une lecture : refaite plus tard, ce n'est pas un échec.
        if (p.interrompue) code = -1;
        let vides = 0;
        for (const x of manquantes) {
          const partiel = `${this.cheminVtt(fichierId, x.index)}.partiel`;
          try {
            // Fichier vide = extraction interrompue : on ne le garde pas (elle sera refaite).
            const taille = fs.existsSync(partiel) ? fs.statSync(partiel).size : 0;
            if (code === 0 && taille > 0) fs.renameSync(partiel, this.cheminVtt(fichierId, x.index));
            else {
              if (code === 0) vides++;
              fs.rmSync(partiel, { force: true });
            }
          } catch {}
        }
        if ((code && !p.interrompue) || vides) {
          this.echecs.set(fichierId, (this.echecs.get(fichierId) || 0) + 1);
          this.journal(`Sous-titres : extraction ratée${vides ? ` (${vides} piste(s) vide(s))` : ''} ${erreurs.trim().slice(-300)}`);
        }
        this.extractions.delete(fichierId);
        ok();
      });
    });
    this.extractions.set(fichierId, promesse);
    return promesse;
  }

  // Une lecture commence : les extractions complètes en arrière-plan s'arrêtent (elles reprendront quand rien
  // n'est lu), pour ne pas faire attendre le flux vidéo sur le même disque.
  arreterExtractions() {
    for (const p of this.processusExtraction.values()) {
      p.interrompue = true;
      p.kill('SIGKILL');
    }
  }

  // Extraction à la demande d'une piste texte à partir de « depuis » (secondes), horodatage d'origine gardé.
  // Une par piste ; relancée si la page demande une position qu'elle ne couvre pas (retour en arrière, saut
  // loin devant ce qui est déjà lu). Partie du début et allée jusqu'au bout, elle devient le cache de la piste.
  fenetre(fichierId, index, depuis) {
    const cle = `${fichierId}:${index}`;
    let w = this.fenetres.get(cle);
    if (w) {
      const lu = w.debut + AVANCE_INITIALE + VITESSE_FENETRE * ((Date.now() - w.t0) / 1000);
      const hors = depuis < w.debut - 1 || (!w.fini && depuis > lu + 60);
      const ratee = w.fini && w.code !== 0 && !w.complet && (w.optionInconnue || Date.now() - w.t0 > 30_000);
      if (hors || ratee) {
        this.fermerFenetre(w);
        w = null;
      }
    }
    if (!w) {
      const f = this.bibliotheque.fichier(fichierId);
      const debut = Math.max(0, Math.floor(Number(depuis) || 0) - 15);
      fs.mkdirSync(this.dossierSousTitres, { recursive: true });
      const partiel = path.join(this.dossierSousTitres, `${fichierId}-${index}-a${debut}.partiel`);
      const args = ['-hide_banner', '-v', 'error', '-nostdin', '-y'];
      if (!Lecture.sansReadrate) args.push('-readrate', String(VITESSE_FENETRE), '-readrate_initial_burst', String(AVANCE_INITIALE));
      if (debut > 0) args.push('-ss', String(debut), '-copyts');
      args.push('-i', f.chemin, '-map', `0:${index}`, '-c:s', 'webvtt', '-flush_packets', '1', '-f', 'webvtt', partiel);
      const p = spawn(OUTILS.ffmpeg, args, { windowsHide: true });
      w = { cle, fichierId, index, debut, partiel, processus: p, t0: Date.now(), vu: Date.now(), fini: false, code: null };
      this.fenetres.set(cle, w);
      this.actifs.add(p);
      let erreurs = '';
      p.stderr.on('data', (d) => {
        if (erreurs.length < 2000) erreurs += d;
      });
      p.on('close', (code) => {
        this.actifs.delete(p);
        Object.assign(w, { processus: null, fini: true, code });
        if (w.ferme) return;
        // ffmpeg trop ancien pour -readrate : la prochaine fenêtre s'en passe.
        if (code && /readrate|Unrecognized option/i.test(erreurs)) {
          Lecture.sansReadrate = true;
          w.optionInconnue = true;
          return;
        }
        if (code) return this.journal(`Sous-titres : extraction à la demande ratée (${erreurs.trim().slice(-200)})`);
        if (debut === 0) {
          try {
            if (fs.statSync(partiel).size > 0 && !fs.existsSync(this.cheminVtt(fichierId, index))) {
              fs.renameSync(partiel, this.cheminVtt(fichierId, index));
              w.complet = true;
            }
          } catch {}
        }
      });
    }
    w.vu = Date.now();
    return w;
  }

  fermerFenetre(w) {
    w.ferme = true;
    this.fenetres.delete(w.cle);
    const effacer = () => {
      try {
        if (!w.complet) fs.rmSync(w.partiel, { force: true });
      } catch {}
    };
    // Windows garde le fichier ouvert tant que ffmpeg tourne : effacé une fois le processus arrêté.
    if (w.processus) {
      w.processus.once('close', effacer);
      w.processus.kill('SIGKILL');
    } else effacer();
  }

  // Sous-titres externes (.srt à côté de la vidéo) : convertis une fois, en devinant l'encodage.
  async externe(fichierId, n) {
    const f = this.bibliotheque.fichier(fichierId);
    const x = f?.externes?.[n];
    if (!x) return null;
    const sortie = this.cheminVtt(fichierId, `ext${n}`);
    if (fs.existsSync(sortie)) return sortie;
    fs.mkdirSync(this.dossierSousTitres, { recursive: true });
    const brut = fs.readFileSync(x.chemin);
    let texte;
    try {
      texte = new TextDecoder('utf-8', { fatal: true }).decode(brut);
    } catch {
      texte = new TextDecoder('windows-1252').decode(brut);
    }
    const tmp = `${sortie}.source${path.extname(x.chemin)}`;
    fs.writeFileSync(tmp, texte.replace(/^﻿/, ''));
    await new Promise((ok) => execFile(OUTILS.ffmpeg, ['-hide_banner', '-v', 'error', '-y', '-i', tmp, '-f', 'webvtt', sortie], { windowsHide: true }, () => ok()));
    fs.rmSync(tmp, { force: true });
    return fs.existsSync(sortie) ? sortie : null;
  }

  // Réponse : la piste complète (X-Complet: 1), ou ce que l'extraction à la demande a déjà lu à partir de
  // X-Debut (X-Complet: 0, et X-Fin: 1 quand elle est allée jusqu'au bout du fichier). La page envoie la
  // position regardée (?depuis=secondes) et redemande la suite.
  async sousTitres(fichierId, piste, res) {
    let chemin = null;
    let complet = true;
    const entetes = {};
    if (String(piste).startsWith('ext')) chemin = await this.externe(fichierId, Number(String(piste).slice(3)));
    else {
      const index = Number(piste);
      chemin = this.cheminVtt(fichierId, index);
      const f = this.bibliotheque.fichier(fichierId);
      const existe = f?.sonde?.sousTitres?.some((x) => x.index === index && x.texte);
      if (!fs.existsSync(chemin) && existe) {
        const depuis = Number(new URL(res.req?.url || '/', 'http://local').searchParams.get('depuis')) || 0;
        const w = this.fenetre(fichierId, index, depuis);
        if (!w.complet) {
          complet = false;
          chemin = w.partiel;
          entetes['X-Debut'] = String(w.debut);
          if (w.fini) entetes['X-Fin'] = '1';
        }
      }
    }
    let contenu = '';
    try {
      if (chemin) contenu = fs.readFileSync(chemin, 'utf8');
    } catch {}
    res.writeHead(200, { 'Content-Type': 'text/vtt; charset=utf-8', 'Cache-Control': 'no-store', 'X-Complet': complet ? '1' : '0', ...entetes });
    res.end(contenu || 'WEBVTT\n\n');
  }
}
