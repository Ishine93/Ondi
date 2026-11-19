import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { lireSonde, libellesSousTitres, OUTILS } from '../src/video.mjs';
import { Lecture, echelleSousTitres } from '../src/lecture.mjs';

const piste = (index, codec, langue, titre, extra = {}) => ({ index, codec_type: 'subtitle', codec_name: codec, tags: { language: langue, title: titre, ...(extra.tags || {}) }, disposition: extra.disposition || {} });
const video = { index: 0, codec_type: 'video', codec_name: 'hevc', width: 3840, height: 1608, pix_fmt: 'yuv420p10le', color_transfer: 'smpte2084' };

test('sous-titres : pistes vides repérées (statistiques mkvmerge)', () => {
  const s = lireSonde({
    format: { duration: '8226' },
    streams: [
      video,
      piste(1, 'subrip', 'fre', 'Fr. complets : SRT', { tags: { NUMBER_OF_FRAMES: '1321' } }),
      piste(2, 'hdmv_pgs_subtitle', 'fre', 'Fr. forcés : PGS', { tags: { NUMBER_OF_FRAMES: '0' }, disposition: { forced: 1 } }),
      piste(3, 'hdmv_pgs_subtitle', 'eng', 'Eng full : PGS', { tags: { 'NUMBER_OF_FRAMES-eng': '2701' } }),
      piste(4, 'subrip', 'eng', 'English'),
    ],
  });
  assert.deepEqual(s.sousTitres.map((x) => [x.images, x.vide]), [[1321, false], [0, true], [2701, false], [null, false]]);
  assert.equal(s.version >= 2, true);
});

test('sous-titres : noms distincts (variante, forcés, SDH, image, numéro)', () => {
  const s = lireSonde({
    format: {},
    streams: [
      video,
      piste(1, 'subrip', 'fre', 'French (France) Forced', { disposition: { forced: 1 } }),
      piste(2, 'subrip', 'fre', 'French (France)'),
      piste(3, 'subrip', 'fre', 'French (Canadien)'),
      piste(4, 'subrip', 'eng', 'English SDH'),
      piste(5, 'hdmv_pgs_subtitle', 'fre', '[PGS] French (VFQ)'),
      piste(6, 'subrip', 'eng', 'English'),
      piste(7, 'subrip', 'eng', 'English full'),
    ],
  });
  const noms = libellesSousTitres(s.sousTitres).map((x) => x.nom);
  assert.deepEqual(noms, [
    'Français · France · forcés',
    'Français · France',
    'Français · Québec',
    'Anglais · SDH',
    'Français · Québec · image',
    'Anglais',
    'Anglais · 2',
  ]);
  // Les sous-titres externes gardent leur nom.
  assert.equal(libellesSousTitres([{ externe: 0, nom: 'Français · fichier', texte: true }])[0].nom, 'Français · fichier');
});

test('sous-titres image : toile 16:9 agrandie sans déformation et centrée dans une image 2.39', () => {
  assert.equal(echelleSousTitres({ largeur: 3840, hauteur: 1608 }, 1608), 'scale=w=3840:h=1608:force_original_aspect_ratio=decrease:force_divisible_by=2');
  const lecture = new Lecture({ bibliotheque: { fichier: () => null }, dossierCache: fs.mkdtempSync(path.join(os.tmpdir(), 'deb-st-')) });
  for (const encodeur of [{ nom: 'nvidia', h264: 'h264_nvenc', hevc: 'hevc_nvenc' }, { nom: 'processeur', h264: 'libx264', hevc: 'libx265' }]) {
    const args = lecture.arguments({
      mode: 'conversion', chemin: 'film.mkv', debut: 0, video: { index: 0, codec: 'hevc', largeur: 3840, hauteur: 1608, hdr: 'HDR10' },
      pisteAudio: null, audioSortie: 'copie', cible: 40, encodeur, sortieHevc: true, garderHdr: true, sousTitreImage: { index: 7 },
    });
    const complexe = args[args.indexOf('-filter_complex') + 1];
    assert.match(complexe, /\[0:7\]scale=w=3840:h=1608:force_original_aspect_ratio=decrease/, encodeur.nom);
    assert.match(complexe, /overlay(_cuda)?=x=\(W-w\)\/2:y=\(H-h\)\/2/, encodeur.nom);
  }
});

test('sous-titres image : une piste vide n\'est jamais incrustée', async () => {
  const sonde = lireSonde({
    format: { duration: '100', bit_rate: '10000000' },
    streams: [
      { index: 0, codec_type: 'video', codec_name: 'h264', width: 1920, height: 1080, pix_fmt: 'yuv420p' },
      { index: 1, codec_type: 'audio', codec_name: 'aac', channels: 2 },
      piste(2, 'hdmv_pgs_subtitle', 'fre', 'Fr. forcés : PGS', { tags: { NUMBER_OF_FRAMES: '0' } }),
    ],
  });
  const fichier = { chemin: 'film.mp4', sonde };
  const lecture = new Lecture({ bibliotheque: { fichier: () => fichier }, dossierCache: fs.mkdtempSync(path.join(os.tmpdir(), 'deb-st-')) });
  const r = await lecture.preparer({ fichierId: 'a', position: 0, qualite: 'auto', caps: { debitMax: 40 }, sousTitreImage: 0 });
  assert.equal(r.mode, 'direct');
  assert.ok(!(r.raisons || []).some((x) => /incrust/.test(x)));
});

// Extraction à la demande : avec un vrai ffmpeg, à partir de la position demandée, horodatage d'origine gardé.
const ffmpegPresent = (() => {
  try {
    execFileSync(OUTILS.ffmpeg, ['-version'], { stdio: 'ignore', windowsHide: true });
    return true;
  } catch {
    return false;
  }
})();
test('sous-titres texte : extraits à partir de la position regardée, tout de suite', { skip: !ffmpegPresent && 'ffmpeg absent' }, async () => {
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'deb-st-'));
  const srt = path.join(dossier, 'st.srt');
  const repliques = [];
  for (let i = 0; i < 24; i++) {
    const t = (s) => `00:${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')},000`;
    repliques.push(`${i + 1}\n${t(i * 5)} --> ${t(i * 5 + 2)}\nRéplique ${i * 5}\n`);
  }
  fs.writeFileSync(srt, repliques.join('\n'));
  const film = path.join(dossier, 'film.mkv');
  execFileSync(OUTILS.ffmpeg, ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=black:s=64x64:r=5:d=120', '-i', srt, '-map', '0:v', '-map', '1:s', '-c:v', 'libx264', '-g', '5', '-c:s', 'srt', film], { windowsHide: true });
  const fichier = { chemin: film, sonde: { sousTitres: [{ index: 1, ordre: 0, texte: true, langue: 'fre' }] } };
  const lecture = new Lecture({ bibliotheque: { fichier: () => fichier }, dossierCache: path.join(dossier, 'cache') });
  const demander = (depuis) =>
    new Promise((ok) => {
      const res = {
        req: { url: `/api/soustitres/abc/1.vtt?depuis=${depuis}` },
        writeHead(code, entetes) {
          this.code = code;
          this.entetes = entetes;
        },
        end(corps) {
          ok({ code: this.code, entetes: this.entetes, corps: String(corps) });
        },
      };
      lecture.sousTitres('abc', '1', res);
    });
  let r = await demander(60);
  const limite = Date.now() + 15_000;
  while (!/Réplique 60/.test(r.corps) && Date.now() < limite) {
    await new Promise((x) => setTimeout(x, 300));
    r = await demander(60);
  }
  assert.equal(r.entetes['X-Complet'], '0');
  assert.equal(r.entetes['X-Debut'], '45');
  assert.match(r.corps, /(00:)?01:00\.000 --> (00:)?01:02\.000\nRéplique 60/);
  assert.ok(!/Réplique 40\b/.test(r.corps), 'rien avant la position demandée (moins 15 s)');
  // Retour en arrière avant la fenêtre : une nouvelle extraction repart de là.
  r = await demander(10);
  const limite2 = Date.now() + 15_000;
  while (!/Réplique 10\b/.test(r.corps) && Date.now() < limite2) {
    await new Promise((x) => setTimeout(x, 300));
    r = await demander(10);
  }
  assert.match(r.corps, /Réplique 10\b/);
  lecture.arreterTout();
  for (const w of [...lecture.fenetres.values()]) lecture.fermerFenetre(w);
});
