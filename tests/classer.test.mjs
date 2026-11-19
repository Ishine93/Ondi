import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { analyserEpisode, nettoyerNom, planifier, assainir } from '../src/classer.mjs';

test('nettoyerNom', () => {
  assert.equal(nettoyerNom('The.Boys'), 'The Boys');
  assert.equal(nettoyerNom('the.last.of.us'), 'The Last Of Us');
  assert.equal(nettoyerNom('Doctor.Who.2005'), 'Doctor Who (2005)');
  assert.equal(nettoyerNom('The.Boys.MULTi.1080p.WEB'), 'The Boys');
  assert.equal(nettoyerNom('www.Torrent9.ws - Lupin'), 'Lupin');
  assert.equal(nettoyerNom('[Team] Arcane'), 'Arcane');
  assert.equal(nettoyerNom(''), '');
});

test('analyserEpisode : nom complet', () => {
  assert.deepEqual(analyserEpisode('The.Boys.S04E01.MULTi.1080p.WEB.x264.mkv'), { serie: 'The Boys', saison: 4, episode: 1 });
  assert.deepEqual(analyserEpisode('the_boys_s04_e03_vostfr.mkv'), { serie: 'The Boys', saison: 4, episode: 3 });
  assert.deepEqual(analyserEpisode('Lupin 2x05 FRENCH.mkv'), { serie: 'Lupin', saison: 2, episode: 5 });
  assert.deepEqual(analyserEpisode('Lupin Saison 3 Episode 7.mp4'), { serie: 'Lupin', saison: 3, episode: 7 });
  assert.deepEqual(analyserEpisode('Doctor.Who.2005.S13E02.mkv'), { serie: 'Doctor Who (2005)', saison: 13, episode: 2 });
});

test('analyserEpisode : la série est dans le dossier ou le torrent', () => {
  assert.deepEqual(analyserEpisode('The.Boys.S04.MULTi.1080p/S04E02.mkv'), { serie: 'The Boys', saison: 4, episode: 2 });
  assert.deepEqual(analyserEpisode('Arcane/Saison 2/Episode 03.mkv'), { serie: 'Arcane', saison: 2, episode: 3 });
  assert.deepEqual(analyserEpisode('E05 - Le titre.mkv', 'Shogun.S01.MULTi.2160p'), { serie: 'Shogun', saison: 1, episode: 5 });
  assert.deepEqual(analyserEpisode('05 - Le titre.mkv', 'Shogun S01'), { serie: 'Shogun', saison: 1, episode: 5 });
});

test('analyserEpisode : les films ne sont pas pris pour des épisodes', () => {
  for (const f of [
    'Bagarre.2026.FRENCH.HDR.2160p.WEB.H265-SUPPLY.mkv',
    "Le_livre_d'Eli_2010_Multi_VFF_Bluray_1080p_DTS_HDMA_x264.mkv",
    'Obsession.2025.MULTi.VF2.HDR.DV.2160p.WEB.H265-SUPPLY.mkv',
    'The.Odyssey.2026.MULTI.VFQ.2160p.BluRay.4KLight.DV.HDR10_.DTS-HD.MA.5.1.x265-SpK79.mkv',
    'Se7en.1995.1920x1080.mkv',
    'Sense8.Movie.mkv',
  ]) {
    assert.equal(analyserEpisode(f), null, f);
  }
});

test('assainir', () => {
  assert.equal(assainir('a:b?c*.mkv'), 'a b c .mkv');
  assert.equal(assainir('con.mkv'), '_con.mkv');
  assert.equal(assainir('fin. '), 'fin');
});

test('planifier', () => {
  const racine = fs.mkdtempSync(path.join(os.tmpdir(), 'debrideur-'));
  const dossiers = { films: path.join(racine, 'Films'), series: path.join(racine, 'Séries') };
  fs.mkdirSync(path.join(dossiers.series, 'the boys', 'Season 4'), { recursive: true });

  const film = planifier(
    [
      { chemin: 'Dune.2021.MULTi.2160p/Dune.2021.MULTi.2160p.mkv', nom: 'Dune.2021.MULTi.2160p.mkv', taille: 1 },
      { chemin: 'Dune.2021.MULTi.2160p/Sample/dune-sample.mkv', nom: 'dune-sample.mkv', taille: 1 },
      { chemin: 'Dune.2021.MULTi.2160p/Subs/French.srt', nom: 'French.srt', taille: 1 },
      { chemin: 'Dune.2021.MULTi.2160p/info.nfo', nom: 'info.nfo', taille: 1 },
    ],
    { mode: 'auto', contexte: 'Dune.2021.MULTi.2160p', dossiers },
  );
  assert.deepEqual(
    film.map((p) => p.dest),
    [path.join(dossiers.films, 'Dune.2021.MULTi.2160p.mkv'), path.join(dossiers.films, 'Dune.2021.MULTi.2160p.fr.srt')],
  );

  const serie = planifier(
    [
      { chemin: 'The.Boys.S04.MULTi/The.Boys.S04E01.MULTi.mkv', nom: 'The.Boys.S04E01.MULTi.mkv', taille: 1 },
      { chemin: 'The.Boys.S04.MULTi/The.Boys.S04E02.MULTi.mkv', nom: 'The.Boys.S04E02.MULTi.mkv', taille: 1 },
      { chemin: 'The.Boys.S04.MULTi/Subs/The.Boys.S04E02.FRENCH.srt', nom: 'The.Boys.S04E02.FRENCH.srt', taille: 1 },
      { chemin: 'Arcane.S02/Arcane.S02E01.mkv', nom: 'Arcane.S02E01.mkv', taille: 1 },
    ],
    { mode: 'auto', contexte: 'The.Boys.S04.MULTi', dossiers },
  );
  assert.deepEqual(
    serie.map((p) => p.dest),
    [
      path.join(dossiers.series, 'the boys', 'Season 4', 'The.Boys.S04E01.MULTi.mkv'),
      path.join(dossiers.series, 'the boys', 'Season 4', 'The.Boys.S04E02.MULTi.mkv'),
      path.join(dossiers.series, 'Arcane', 'Saison 02', 'Arcane.S02E01.mkv'),
      path.join(dossiers.series, 'the boys', 'Season 4', 'The.Boys.S04E02.MULTi.fr.srt'),
    ],
  );

  // Mode « Série » forcé sur un fichier sans numéro d'épisode
  const force = planifier([{ chemin: 'Mini serie partie 1.mkv', nom: 'Mini serie partie 1.mkv', taille: 1 }], {
    mode: 'serie',
    contexte: 'Mini.Serie.FRENCH',
    dossiers,
  });
  assert.equal(force[0].dest, path.join(dossiers.series, 'Mini Serie', 'Mini serie partie 1.mkv'));

  // Mode « Film » forcé sur un épisode
  const forceFilm = planifier([{ chemin: 'X.S01E01.mkv', nom: 'X.S01E01.mkv', taille: 1 }], { mode: 'film', dossiers });
  assert.equal(forceFilm[0].dest, path.join(dossiers.films, 'X.S01E01.mkv'));

  fs.rmSync(racine, { recursive: true, force: true });
});
