import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Bibliotheque } from '../src/bibliotheque.mjs';

// Un téléchargement fini se lance depuis la recherche : le serveur retrouve son fichier dans la bibliothèque.
test('bibliothèque : fichier téléchargé → clé de lecture (film et épisode)', () => {
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'deb-lecture-'));
  try {
    const films = path.join(dossier, 'Films');
    const series = path.join(dossier, 'Séries');
    const b = new Bibliotheque({ config: { dossiers: { films, series } }, dossierDonnees: dossier });
    const film = path.join(films, 'Avengers.Endgame.2019.1080p.BluRay.x264.mp4');
    const episode = path.join(series, 'Game of Thrones', 'Game.of.Thrones.S01E02.FRENCH.1080p.mkv');
    b.fichiers = {
      f1: { id: 'f1', type: 'films', chemin: film, rel: path.basename(film) },
      e2: { id: 'e2', type: 'series', chemin: episode, rel: 'Game of Thrones/Game.of.Thrones.S01E02.FRENCH.1080p.mkv' },
    };
    b.vue = null;

    assert.deepEqual(b.lectureDeChemin(film), { cle: 'f:avengers endgame:2019', cleLecture: 'f:avengers endgame:2019', versionId: 'f1' });
    // Même fichier écrit autrement (casse différente sous Windows) : retrouvé quand même.
    assert.equal(b.lectureDeChemin(film.toUpperCase())?.versionId, 'f1');
    const ep = b.lectureDeChemin(episode);
    assert.equal(ep.versionId, 'e2');
    assert.match(ep.cleLecture, /^e:game of thrones:1:2$/);
    // Pas encore rangé (bibliothèque pas encore relue) : rien.
    assert.equal(b.lectureDeChemin(path.join(films, 'Inconnu.2020.mkv')), null);

    // Nouveau fichier : l'index se refait quand la bibliothèque change.
    const autre = path.join(films, 'Le.Livre.d.Eli.2010.mkv');
    b.fichiers.f2 = { id: 'f2', type: 'films', chemin: autre, rel: path.basename(autre) };
    b.vue = null;
    assert.equal(b.lectureDeChemin(autre)?.versionId, 'f2');
  } finally {
    fs.rmSync(dossier, { recursive: true, force: true });
  }
});
