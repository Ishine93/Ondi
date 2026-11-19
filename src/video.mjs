// Outils vidéo : où trouver ffmpeg/ffprobe, lecture des pistes d'un fichier (codecs, HDR, audio, sous-titres)
// et choix de l'encodeur matériel disponible (NVIDIA, Intel Quick Sync, AMD… sinon le processeur).
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXE = process.platform === 'win32' ? '.exe' : '';

// ffmpeg livré avec le Débrideur (outils/ffmpeg), sinon celui de Jellyfin, sinon celui du système.
export function trouverOutils() {
  const candidats = [
    process.env.DEBRIDEUR_FFMPEG_DIR,
    path.join(RACINE, 'runtime', 'ffmpeg'),
    path.join(RACINE, 'runtime', 'ffmpeg', 'bin'),
    path.join(RACINE, 'outils', 'ffmpeg'),
    process.platform === 'win32' ? path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Jellyfin', 'Server') : '/usr/lib/jellyfin-ffmpeg',
  ].filter(Boolean);
  for (const d of candidats) {
    const ffmpeg = path.join(d, `ffmpeg${EXE}`);
    const ffprobe = path.join(d, `ffprobe${EXE}`);
    if (fs.existsSync(ffmpeg) && fs.existsSync(ffprobe)) return { ffmpeg, ffprobe };
  }
  return { ffmpeg: `ffmpeg${EXE}`, ffprobe: `ffprobe${EXE}` };
}
export const OUTILS = trouverOutils();

const executer = (exe, args, { timeout = 60_000 } = {}) =>
  new Promise((ok, ko) => {
    execFile(exe, args, { timeout, maxBuffer: 64e6, windowsHide: true }, (e, sortie, erreurs) => (e ? ko(Object.assign(e, { erreurs })) : ok(sortie)));
  });

const LANGUES = {
  fre: 'Français', fra: 'Français', fr: 'Français', eng: 'Anglais', en: 'Anglais', spa: 'Espagnol', es: 'Espagnol', ger: 'Allemand', deu: 'Allemand',
  ita: 'Italien', jpn: 'Japonais', ja: 'Japonais', por: 'Portugais', kor: 'Coréen', chi: 'Chinois', zho: 'Chinois', rus: 'Russe', ara: 'Arabe',
  dut: 'Néerlandais', nld: 'Néerlandais', und: '', '': '',
};
export const nomLangue = (code) => LANGUES[String(code || '').toLowerCase()] ?? String(code || '').toUpperCase();

// Version de ce que lireSonde garde d'un fichier : la bibliothèque relit les fichiers lus avec une version plus ancienne.
export const VERSION_SONDE = 2;

// Noms des pistes de sous-titres tels qu'affichés : langue, variante (France / Québec…), forcés / SDH, image.
// Deux pistes qui restent pareilles sont numérotées (« Français », « Français · 2 »).
const VARIANTES_ST = [
  [/canad|\bvfq\b|qu[ée]b|\bfr-?ca\b/i, 'Québec'],
  [/\(france\)|\bvff\b|\bvfi\b|\bfr-?fr\b|\bfrance\b/i, 'France'],
  [/\b(us|usa|american)\b|\ben-?us\b/i, 'US'],
  [/\b(uk|british)\b|\ben-?gb\b/i, 'UK'],
];
export function libellesSousTitres(pistes) {
  const noms = pistes.map((s) => {
    if (s.externe != null) return s.nom;
    const titre = String(s.titre || '');
    const base = nomLangue(s.langue) || titre || 'Sous-titres';
    const variante = nomLangue(s.langue) ? VARIANTES_ST.find(([re]) => re.test(titre))?.[1] || '' : '';
    const sdh = s.sdh ?? /sdh|malentendant/i.test(titre);
    const commentaires = /comment/i.test(titre) ? 'commentaires' : '';
    return [base, variante, s.force ? 'forcés' : sdh ? 'SDH' : '', commentaires, s.texte ? '' : 'image'].filter(Boolean).join(' · ');
  });
  const vus = new Map();
  return pistes.map((s, i) => {
    const n = (vus.get(noms[i]) || 0) + 1;
    vus.set(noms[i], n);
    return { ...s, nom: n > 1 ? `${noms[i]} · ${n}` : noms[i] };
  });
}

const NOMS_AUDIO = {ac3: 'Dolby Digital', eac3: 'Dolby Digital+', truehd: 'Dolby TrueHD', dts: 'DTS', aac: 'AAC', mp3: 'MP3', opus: 'Opus', flac: 'FLAC', vorbis: 'Vorbis', pcm_s16le: 'PCM', pcm_s24le: 'PCM' };
const canaux = (n) => (n >= 8 ? '7.1' : n >= 6 ? '5.1' : n === 2 ? 'Stéréo' : n === 1 ? 'Mono' : `${n} canaux`);
export const SOUS_TITRES_TEXTE = new Set(['subrip', 'srt', 'ass', 'ssa', 'webvtt', 'mov_text', 'text']);

// Résumé lisible d'un ffprobe -show_streams -show_format (en JSON).
export function lireSonde(j) {
  const flux = j.streams || [];
  const v = flux.find((s) => s.codec_type === 'video' && !s.disposition?.attached_pic && s.codec_name !== 'mjpeg' && s.codec_name !== 'png');
  let hdr = '';
  if (v) {
    const dovi = (v.side_data_list || []).find((d) => /dovi|dolby vision/i.test(d.side_data_type || ''));
    if (dovi) hdr = 'Dolby Vision';
    else if (v.color_transfer === 'smpte2084') hdr = 'HDR10';
    else if (v.color_transfer === 'arib-std-b67') hdr = 'HLG';
    if (dovi) v.dvProfil = dovi.dv_profile;
  }
  const bits = v ? (/10/.test(v.pix_fmt || '') || /10/.test(v.profile || '') ? 10 : /12/.test(v.pix_fmt || '') ? 12 : 8) : 8;
  let ordreAudio = 0;
  let ordreSt = 0;
  const audios = [];
  const sousTitres = [];
  for (const s of flux) {
    const tags = s.tags || {};
    if (s.codec_type === 'audio') {
      const profil = /atmos/i.test(s.profile || '') ? 'Atmos' : /DTS-HD MA/i.test(s.profile || '') ? 'DTS-HD MA' : '';
      audios.push({
        index: s.index,
        ordre: ordreAudio++,
        codec: s.codec_name,
        canaux: s.channels || 2,
        langue: tags.language || '',
        titre: tags.title || '',
        defaut: !!s.disposition?.default,
        nom: [nomLangue(tags.language) || tags.title || `Piste ${ordreAudio}`, profil || NOMS_AUDIO[s.codec_name] || s.codec_name?.toUpperCase(), canaux(s.channels || 2)]
          .filter(Boolean)
          .join(' · '),
      });
    } else if (s.codec_type === 'subtitle') {
      const titre = tags.title || '';
      const force = !!s.disposition?.forced || /forc/i.test(titre);
      const sdh = !!s.disposition?.hearing_impaired || /sdh|malentendant/i.test(titre);
      // Nombre de répliques noté par mkvmerge (« NUMBER_OF_FRAMES », parfois suivi de la langue) :
      // 0 = piste vide, inutile (et une piste image vide bloque l'incrustation).
      const cleImages = Object.keys(tags).find((k) => /^NUMBER_OF_FRAMES/i.test(k));
      const images = cleImages != null && /^\d+$/.test(String(tags[cleImages]).trim()) ? Number(tags[cleImages]) : null;
      sousTitres.push({
        index: s.index,
        ordre: ordreSt++,
        codec: s.codec_name,
        langue: tags.language || '',
        titre,
        force,
        sdh,
        defaut: !!s.disposition?.default,
        texte: SOUS_TITRES_TEXTE.has(s.codec_name),
        images,
        vide: images === 0,
        nom: [nomLangue(tags.language) || titre || `Sous-titres ${ordreSt}`, force ? 'forcés' : sdh ? 'SDH' : '', SOUS_TITRES_TEXTE.has(s.codec_name) ? '' : 'image']
          .filter(Boolean)
          .join(' · '),
      });
    }
  }
  const f = j.format || {};
  return {
    version: VERSION_SONDE,
    duree: Number(f.duration) || 0,
    debit: Number(f.bit_rate) || 0,
    conteneur: String(f.format_name || '').split(',')[0],
    video: v
      ? {
          index: v.index,
          codec: v.codec_name,
          profil: v.profile || '',
          largeur: v.width,
          hauteur: v.height,
          bits,
          hdr,
          dvProfil: v.dvProfil ?? null,
          ips: (() => {
            const [a, b] = String(v.avg_frame_rate || v.r_frame_rate || '0/1').split('/').map(Number);
            return b ? Math.round((a / b) * 100) / 100 : 0;
          })(),
        }
      : null,
    audios,
    sousTitres,
  };
}

export async function sonder(chemin) {
  const sortie = await executer(OUTILS.ffprobe, ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', chemin], { timeout: 120_000 });
  return lireSonde(JSON.parse(sortie));
}

// « 4K HDR10 · HEVC », « 1080p · H.264 »
export function resumeVideo(v) {
  if (!v) return '';
  const h = Math.max(v.hauteur || 0, Math.round((v.largeur || 0) * 9 / 16));
  const def = v.largeur >= 3200 || h >= 2000 ? '4K' : v.largeur >= 1800 || h >= 1000 ? '1080p' : v.largeur >= 1200 || h >= 700 ? '720p' : `${v.hauteur}p`;
  const codec = { hevc: 'HEVC', h264: 'H.264', av1: 'AV1', vp9: 'VP9', mpeg4: 'MPEG-4', mpeg2video: 'MPEG-2' }[v.codec] || String(v.codec || '').toUpperCase();
  return [def, v.hdr, codec].filter(Boolean).join(' · ');
}

// ---------- encodeur matériel ----------
// Testé une fois au démarrage : une image noire encodée avec chaque candidat, on garde le premier qui marche.
const ENCODEURS = [
  { nom: 'nvidia', h264: 'h264_nvenc', hevc: 'hevc_nvenc', test: [] },
  { nom: 'intel', h264: 'h264_qsv', hevc: 'hevc_qsv', test: [] },
  { nom: 'amd', h264: 'h264_amf', hevc: 'hevc_amf', test: [] },
  { nom: 'apple', h264: 'h264_videotoolbox', hevc: 'hevc_videotoolbox', test: [] },
  { nom: 'vaapi', h264: 'h264_vaapi', hevc: 'hevc_vaapi', test: ['-vaapi_device', '/dev/dri/renderD128', '-vf', 'format=nv12,hwupload'] },
];
let encodeurPromis = null;
export function encodeurMateriel() {
  if (!encodeurPromis) {
    encodeurPromis = (async () => {
      for (const e of ENCODEURS) {
        if (e.nom === 'vaapi' && process.platform === 'win32') continue;
        if (e.nom === 'apple' && process.platform !== 'darwin') continue;
        if (e.nom !== 'apple' && process.platform === 'darwin') continue;
        try {
          await executer(
            OUTILS.ffmpeg,
            ['-hide_banner', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=256x256:d=0.2', ...(e.nom === 'vaapi' ? e.test.slice(0, 2) : []), ...(e.nom === 'vaapi' ? e.test.slice(2) : []), '-frames:v', '1', '-c:v', e.h264, '-f', 'null', '-'],
            { timeout: 20_000 },
          );
          return e;
        } catch {}
      }
      return { nom: 'processeur', h264: 'libx264', hevc: 'libx265' };
    })();
  }
  return encodeurPromis;
}
