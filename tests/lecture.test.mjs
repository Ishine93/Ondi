import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { OUTILS, sonder } from '../src/video.mjs';
import { Lecture, annoncerDuree } from '../src/lecture.mjs';

const processeur = { nom: 'processeur', h264: 'libx264', hevc: 'libx265' };
const video = { index: 0, codec: 'h264', bits: 8, largeur: 1920, hauteur: 1080 };
const audio = { index: 1, ordre: 0, codec: 'ac3', canaux: 6 };
const lecture = () => new Lecture({ bibliotheque: { fichier: () => null }, dossierCache: path.join(os.tmpdir(), 'ondi-test-lecture') });

test('flux : pas de liste de montage, départ calé sur la position', () => {
  const l = lecture();
  const remux = l.arguments({ mode: 'remux', chemin: 'film.mkv', debut: 60.227, video, pisteAudio: audio, audioSortie: 'copie' });
  // ffmpeg cherche 0,13 s avant la cible quand il y a des images B : on vise après le point clé.
  assert.equal(remux[remux.indexOf('-ss') + 1], '60.377');
  assert.ok(remux.indexOf('-ss') < remux.indexOf('-i'));
  assert.equal(remux[remux.indexOf('-use_editlist') + 1], '0');
  assert.equal(remux.lastIndexOf('-ss'), remux.indexOf('-ss'), 'pas de coupe en sortie pour une image recopiée');

  const conv = l.arguments({ mode: 'conversion', chemin: 'film.mkv', debut: 3600, video, pisteAudio: audio, audioSortie: 'copie', cible: 10, encodeur: processeur });
  assert.equal(conv[conv.indexOf('-ss') + 1], '3600.000');
  // Le son recopié d'avant la position est retiré en sortie.
  const sortie = conv.lastIndexOf('-ss');
  assert.ok(sortie > conv.indexOf('-i'));
  assert.equal(conv[sortie + 1], '0');
  assert.equal(conv[conv.indexOf('-use_editlist') + 1], '0');

  const debutFilm = l.arguments({ mode: 'conversion', chemin: 'film.mkv', debut: 0, video, pisteAudio: audio, audioSortie: 'aac', cible: 10, encodeur: processeur });
  assert.ok(!debutFilm.includes('-ss'));
});

let ffmpegPresent = true;
try {
  execFileSync(OUTILS.ffmpeg, ['-version'], { stdio: 'ignore', windowsHide: true });
} catch {
  ffmpegPresent = false;
}

// Un éclair toutes les 24 images et un bip au même instant ; dans le flux envoyé, lu sans tenir compte des
// listes de montage (comme une télé Samsung), éclairs et bips doivent rester ensemble.
test('flux : son et image synchrones même pour un lecteur qui ignore les listes de montage', { skip: !ffmpegPresent && 'ffmpeg absent', timeout: 120_000 }, async () => {
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'ondi-synchro-'));
  try {
    const source = path.join(dossier, 'source.mkv');
    execFileSync(OUTILS.ffmpeg, [
      '-v', 'error', '-y',
      '-f', 'lavfi', '-i', "color=c=black:s=320x240:r=24000/1001:d=30,drawbox=x=0:y=0:w=iw:h=ih:color=white:t=fill:enable='eq(mod(n\\,24)\\,0)'",
      '-f', 'lavfi', '-i', "aevalsrc=exprs='if(lt(mod(t\\,1.001)\\,0.04)\\,0.8*sin(2*PI*1000*t)\\,0)':s=48000:d=30:c=5.1",
      '-map', '0:v', '-map', '1:a', '-c:v', 'libx264', '-bf', '3', '-g', '24', '-pix_fmt', 'yuv420p', '-c:a', 'ac3', '-b:a', '384k', source,
    ], { windowsHide: true });
    const sonde = await sonder(source);
    const l = new Lecture({ bibliotheque: { fichier: () => ({ id: 's', chemin: source, sonde }) }, dossierCache: dossier });
    const ecarts = (fichier) => {
      const r = spawnSync(OUTILS.ffmpeg, ['-hide_banner', '-ignore_editlist', '1', '-i', fichier, '-vf', 'blackdetect=d=0:pix_th=0.3', '-af', 'silencedetect=n=-30dB:d=0.005', '-f', 'null', '-'], { encoding: 'utf8', windowsHide: true });
      // Le dernier éclair, coupé par la fin de l'extrait (6 s), n'est pas compté.
      const eclairs = [...r.stderr.matchAll(/black_end:\s*([\d.]+)/g)].map((m) => Number(m[1])).filter((x) => x < 5.5);
      const bips = [...r.stderr.matchAll(/silence_end:\s*([\d.]+)/g)].map((m) => Number(m[1]));
      return eclairs.map((e) => bips.reduce((b, x) => (Math.abs(x - e) < Math.abs(b - e) ? x : b), Infinity) - e).filter((x) => Math.abs(x) < 0.5);
    };
    const r = await l.preparer({ fichierId: 's', position: 10.4, audio: 0, caps: { ac3: true, debitMax: 120 } });
    const remux = l.sessions.get(r.session);
    assert.equal(remux.mode, 'remux');
    const sessions = [
      ['remux', remux],
      ['conversion', { mode: 'conversion', chemin: source, debut: 10.4, video: sonde.video, pisteAudio: sonde.audios[0], audioSortie: 'copie', cible: 2, encodeur: processeur }],
    ];
    for (const [nom, s] of sessions) {
      const args = l.arguments(s);
      const fichier = path.join(dossier, `${nom}.mp4`);
      args.splice(args.lastIndexOf('-f'), 0, '-t', '6');
      args[args.length - 1] = fichier;
      execFileSync(OUTILS.ffmpeg, ['-y', ...args], { windowsHide: true });
      const e = ecarts(fichier);
      assert.ok(e.length >= 4, `${nom} : éclairs et bips retrouvés (${e.length})`);
      for (const x of e) assert.ok(Math.abs(x) < 0.045, `${nom} : son décalé de ${Math.round(x * 1000)} ms`);

      // En-tête réécrit avec la durée (ce que fait l'envoi) : la durée est lue et le flux se décode sans erreur.
      const b = fs.readFileSync(fichier);
      const ftyp = b.readUInt32BE(0);
      const moov = b.subarray(ftyp, ftyp + b.readUInt32BE(ftyp));
      const avec = annoncerDuree(moov, 21.5);
      assert.equal(avec.length, moov.length + 16, `${nom} : mehd ajoutée`);
      const sortie = path.join(dossier, `${nom}-duree.mp4`);
      fs.writeFileSync(sortie, Buffer.concat([b.subarray(0, ftyp), avec, b.subarray(ftyp + moov.length)]));
      const duree = Number(execFileSync(OUTILS.ffprobe, ['-v', 'error', '-show_entries', 'stream=duration', '-select_streams', 'v:0', '-of', 'csv=p=0', sortie], { encoding: 'utf8', windowsHide: true }));
      assert.equal(duree, 21.5);
      const r = spawnSync(OUTILS.ffmpeg, ['-v', 'error', '-i', sortie, '-f', 'null', '-'], { encoding: 'utf8', windowsHide: true });
      assert.equal(r.status, 0);
      assert.equal(r.stderr.trim(), '');
      assert.deepEqual(ecarts(sortie), e);
    }
  } finally {
    fs.rmSync(dossier, { recursive: true, force: true });
  }
});
