import test from 'node:test';
import assert from 'node:assert/strict';
import { decrireResultat, analyserTexte, episodeDuNom } from '../src/titres.mjs';

test('episodeDuNom', () => {
  assert.deepEqual(episodeDuNom('The Boys - Saison 1 Épisode 12 - [VF HD]'), { saison: 1, episode: 12 });
  assert.deepEqual(episodeDuNom('One Piece - Saison 1 Épisode 1165 - [VOSTFR]'), { saison: 1, episode: 1165 });
  assert.deepEqual(episodeDuNom('Les.Gardiens.S02E03.VOSTFR.mkv'), { saison: 2, episode: 3 });
  assert.deepEqual(episodeDuNom('Episode 7'), { saison: null, episode: 7 });
  assert.equal(episodeDuNom('Dune.Part.Two.2024.MULTi.2160p.mkv'), null);
  assert.equal(episodeDuNom('The Boys - Saison 1 VF HD'), null);
});

// [titre affiché, langue, familles, qualité, saison, épisodes, année, genres, note]
const verifier = (cas) => {
  for (const [entree, attendu] of Object.entries(cas)) {
    const r = decrireResultat(entree);
    assert.deepEqual(
      [r.titre, r.langue, r.familles.join('+'), r.qualite, r.saison, r.episodes, r.annee, r.genres, r.note],
      attendu,
      entree,
    );
  }
};

test('titres du site : langue, qualité, genres et année sans note', () => {
  verifier({
    'Terrifier TRUEFRENCH BDRIP Action, Horreur-Epouvante 2016': ['Terrifier (2016)', 'TRUEFRENCH', 'vf', 'BDRIP', '', '', '2016', 'Action, Horreur-Epouvante', ''],
    'Terrifier MULTI (TRUEFRENCH) HD-LIGHT 1080p Action, Horreur-Epouvante 2016': [
      'Terrifier (2016)', 'MULTI TRUEFRENCH', 'multi+vf', 'HD-LIGHT 1080p', '', '', '2016', 'Action, Horreur-Epouvante', '',
    ],
    'Le Film FRENCH HDrip Xvid (2017)': ['Le Film (2017)', 'FRENCH', 'vf', 'HDrip Xvid', '', '', '2017', '', ''],
    'Jeepers Creepers MULTI (TRUEFRENCH) 4K LIGHT Horreur-Epouvante (2002)': [
      'Jeepers Creepers (2002)', 'MULTI TRUEFRENCH', 'multi+vf', '4K LIGHT', '', '', '2002', 'Horreur-Epouvante', '',
    ],
    'Spider-Man : New Generation 1080p MULTI Animation, Action 6.7 /10 2017': [
      'Spider-Man : New Generation (2017)', 'MULTI', 'multi', '1080p', '', '', '2017', 'Animation, Action', '6.7/10',
    ],
  });
});

test('titres du site : saisons et épisodes', () => {
  verifier({
    'One Piece S01 VOSTFR (+E1180) Action, Aventure': ['One Piece', 'VOSTFR', 'vostfr', '', 'Saison 1', '+E1180', '', 'Action, Aventure', ''],
    'Kaguya-sama S01 VOSTFR (+E13) Comédie, Romance': ['Kaguya-sama', 'VOSTFR', 'vostfr', '', 'Saison 1', '+E13', '', 'Comédie, Romance', ''],
    'Game of Thrones S01 VOSTFR HD (+E10) Fantastique, Dramatique 2011': [
      'Game of Thrones', 'VOSTFR', 'vostfr', 'HD', 'Saison 1', '+E10', '2011', 'Fantastique, Dramatique', '',
    ],
    'The Boys - Saison 4 [VOSTFR] [HD 720p]': ['The Boys', 'VOSTFR', 'vostfr', 'HD 720p', 'Saison 4', '', '', '', ''],
    'The Boys - Saison 4 - Épisode 3 FRENCH': ['The Boys', 'FRENCH', 'vf', '', 'Saison 4', 'E3', '', '', ''],
    'Lupin S02E05 MULTI 1080p': ['Lupin', 'MULTI', 'multi', '1080p', 'Saison 2', 'E5', '', '', ''],
    'Dark Saisons 1 à 3 MULTI 1080p': ['Dark', 'MULTI', 'multi', '1080p', 'Saisons 1 à 3', '', '', '', ''],
  });
});

test('titres : les saisons d’une série ont la même clé, pas les films de même nom', () => {
  const s1 = decrireResultat('Game of Thrones S01 VOSTFR HD (+E10) Fantastique, Dramatique 2011');
  const s2 = decrireResultat('Game of Thrones S02 FRENCH HD (+E10) Fantastique, Dramatique 2012');
  assert.equal(s1.cle, s2.cle);
  assert.equal(s1.serie, true);
  assert.notEqual(decrireResultat('Dune 1080p Science-Fiction 1984').cle, decrireResultat('Dune 4K Science-Fiction 2021').cle);
  assert.equal(decrireResultat('Dune (2021)').cle, decrireResultat('Dune MULTI 1080p (2021)').cle);
});

test('titres : ce qui doit rester dans le titre', () => {
  verifier({
    'The Last Action': ['The Last Action', '', '', '', '', '', '', '', ''],
    'Blade Runner 2049': ['Blade Runner 2049', '', '', '', '', '', '', '', ''],
    'The Light 4K': ['The Light', '', '', '4K', '', '', '', '', ''],
    'Science Fiction': ['Science Fiction', '', '', '', '', '', '', '', ''],
    'Avatar 2 HDLight 1080p French': ['Avatar 2', 'FRENCH', 'vf', 'HDLight 1080p', '', '', '', '', ''],
    'Blade Runner 2049 WEB-DL 1080p Science-Fiction 8/10 2017': ['Blade Runner 2049 (2017)', '', '', 'WEB-DL 1080p', '', '', '2017', 'Science-Fiction', '8/10'],
    'Oppenheimer.2023.MULTi.2160p.WEB.H265.DD5.1': ['Oppenheimer 2023', 'MULTI', 'multi', '2160p WEB H265 DD5.1', '', '', '', '', ''],
    'Dune : Deuxième partie - MULTI - 1080p - (2024)': ['Dune : Deuxième partie (2024)', 'MULTI', 'multi', '1080p', '', '', '2024', '', ''],
  });
});

test('titres réels : genres absents du vocabulaire, « VO », année dans le titre d’une série', () => {
  verifier({
    'ONE OUTS Nobody wins, but I! S01 VOSTFR (+E25) Psychologique, Tournois': [
      'ONE OUTS Nobody wins, but I!', 'VOSTFR', 'vostfr', '', 'Saison 1', '+E25', '', 'Psychologique, Tournois', '',
    ],
    'OneRoom S01 VOSTFR (+E12) Comédie, Tranche de vie': ['OneRoom', 'VOSTFR', 'vostfr', '', 'Saison 1', '+E12', '', 'Comédie, Tranche de vie', ''],
    'The Titan Games S01 VF HD (+E09) Téléréalité 6.8 /10 2019': ['The Titan Games', 'VF', 'vf', 'HD', 'Saison 1', '+E9', '2019', 'Téléréalité', '6.8/10'],
    'Spider-Man: No Way Home VO BDRIP Action, Aventure 8.2 /10 2021': [
      'Spider-Man: No Way Home (2021)', 'VO', 'vo', 'BDRIP', '', '', '2021', 'Action, Aventure', '8.2/10',
    ],
  });
  // Deux séries de même nom, l'une datée dans son titre : pas de fusion.
  assert.notEqual(
    decrireResultat('The Game (2021) S02 VOSTFR HD (+E10) Dramatique 5.7 /10 2022').cle,
    decrireResultat('The Game S01 VF HD (+E04) Dramatique 2025').cle,
  );
  assert.equal(
    decrireResultat('The Game (2021) S01 VF HD (+E10) Dramatique 5.7 /10 2021').cle,
    decrireResultat('The Game (2021) S02 VOSTFR HD (+E10) Dramatique 5.7 /10 2022').cle,
  );
  assert.equal(decrireResultat('Spider-Man: No Way Home VO BDRIP Action 2021').cle, decrireResultat('Spider-Man: No Way Home VOSTFR BDRIP Action 2021').cle);
});

test('analyserTexte : étiquettes autour d’un résultat', () => {
  const a = analyserTexte('2024 · Film · 1080p · MULTI');
  assert.deepEqual([a.qualites, a.langues, a.annee], [['1080p'], ['MULTI'], '2024']);
  assert.deepEqual(analyserTexte('Avec Tom Hanks · HD').qualites, []);
  assert.deepEqual(analyserTexte('(4K Light) TRUEFRENCH DTS-HD').qualites, ['4K', 'Light', 'DTS-HD']);
});

test('decrireResultat : étiquettes prises autour quand le titre n’en a pas', () => {
  const r = decrireResultat('Dune : Deuxième partie', '4K · VOSTFR · 2024');
  assert.deepEqual([r.titre, r.langue, r.qualite], ['Dune : Deuxième partie (2024)', 'VOSTFR', '4K']);
});
