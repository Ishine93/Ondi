// Repérage de l'intro et du générique de fin (src/generiques.mjs) : parties calculées, sans ffmpeg.
import test from 'node:test';
import assert from 'node:assert/strict';
import { passagesCommuns, blocsCommuns, confianceConsensus, choisirIntro, choisirFin, finParImage, SEUIL } from '../src/generiques.mjs';

const PAS = 0.1238;
const pts = (s) => Math.round(s / PAS);
// Empreinte de « secondes » de bruit, avec une graine pour que deux épisodes diffèrent.
function bruit(secondes, graine) {
  const a = new Uint32Array(pts(secondes));
  let x = graine >>> 0 || 1;
  for (let i = 0; i < a.length; i++) {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    a[i] = x >>> 0;
  }
  return a;
}
// Colle l'intro (même empreinte, à 1 bit près pour imiter un autre encodage) à la position voulue.
function avecIntro(episode, intro, position, graine = 7) {
  const e = episode.slice();
  for (let i = 0; i < intro.length && pts(position) + i < e.length; i++) e[pts(position) + i] = (intro[i] ^ (1 << ((i * graine) % 32))) >>> 0;
  return e;
}

test('passages communs : intro de 40 s placée à des endroits différents', () => {
  const intro = bruit(40, 99);
  const a = avecIntro(bruit(300, 1), intro, 0);
  const b = avecIntro(bruit(300, 2), intro, 75);
  const p = passagesCommuns(a, b);
  assert.equal(p.length, 1);
  assert.ok(Math.abs(p[0][0] - 0) < 1 && Math.abs(p[0][1] - 40) < 1, JSON.stringify(p));
  // Deux épisodes sans rien en commun : aucun passage.
  assert.deepEqual(passagesCommuns(bruit(300, 3), bruit(300, 4)), []);
});

test('consensus : il faut les trois quarts des épisodes voisins, et au moins deux', () => {
  assert.equal(confianceConsensus(0, 8), 0);
  assert.equal(confianceConsensus(1, 1), 50); // deux épisodes seulement : jamais proposé
  assert.ok(confianceConsensus(1, 1) < SEUIL);
  assert.ok(confianceConsensus(2, 2) >= SEUIL);
  assert.ok(confianceConsensus(3, 5) < SEUIL); // thème musical repris dans quelques scènes
  assert.ok(confianceConsensus(2, 3) < SEUIL);
  assert.equal(confianceConsensus(7, 8), 100);
  assert.equal(confianceConsensus(3, 8), 0);
});

test("intro : retrouvée dans tous les voisins, un thème repris dans un seul n'est pas proposé", () => {
  const intro = bruit(45, 50);
  const theme = bruit(25, 60);
  const positions = [0, 120, 30, 200, 90];
  const eps = positions.map((p, i) => avecIntro(bruit(600, 10 + i), intro, p, 3 + i));
  eps[0] = avecIntro(eps[0], theme, 400);
  eps[3] = avecIntro(eps[3], theme, 300);
  const calc = blocsCommuns(eps[0], eps.slice(1));
  const r = choisirIntro(calc, 0, [], 1800);
  assert.ok(r && r.confiance >= SEUIL, JSON.stringify(r));
  assert.ok(Math.abs(r.debut - 0) < 1.5 && Math.abs(r.fin - 45) < 1.5, JSON.stringify(r));
  const themeSeul = calc.blocs.find((b) => b.debut > 390 && b.debut < 410);
  assert.ok(themeSeul && confianceConsensus(themeSeul.k, calc.n) < SEUIL, JSON.stringify(calc.blocs));
});

test("intro : un bruitage partagé avec un seul épisode juste avant n'avance pas le début", () => {
  const intro = bruit(40, 70);
  const sting = bruit(6, 71);
  const eps = [100, 50, 80, 20, 140].map((p, i) => avecIntro(bruit(600, 30 + i), intro, p, 5 + i));
  // Le premier et le deuxième épisode ont aussi le même bruitage juste avant l'intro.
  eps[0] = avecIntro(eps[0], sting, 94);
  eps[1] = avecIntro(eps[1], sting, 44);
  const r = choisirIntro(blocsCommuns(eps[0], eps.slice(1)), 0, [], 1800);
  assert.ok(r && Math.abs(r.debut - 100) < 1.5, JSON.stringify(r));
});

test('intro : chapitre nommé, ou limite de chapitre qui cale la fin', () => {
  const nomme = choisirIntro(null, 0, [{ debut: 0, fin: 62, titre: 'Prologue' }, { debut: 62, fin: 95, titre: 'Opening' }, { debut: 95, fin: 1300, titre: 'Partie A' }], 1420);
  assert.deepEqual([nomme.debut, nomme.fin, nomme.source], [62, 95, 'chapitre']);
  const calc = { n: 8, blocs: [{ debut: 0, fin: 104, k: 8 }] };
  const chapitres = [{ debut: 0, fin: 6 }, { debut: 6, fin: 107.1 }, { debut: 107.1, fin: 500 }];
  const cale = choisirIntro(calc, 0, chapitres, 3300);
  assert.equal(cale.fin, 107.1); // 3 s après la fin de la musique
  const loin = choisirIntro(calc, 0, [{ debut: 0, fin: 125 }, { debut: 125, fin: 500 }], 3300);
  assert.equal(loin.fin, 104); // limite à 21 s : pas prise
});

test('générique de fin par le son : doit aller jusqu\'au bout du fichier', () => {
  const calc = { n: 8, blocs: [{ debut: 200, fin: 358, k: 8 }, { debut: 40, fin: 90, k: 8 }] };
  const r = choisirFin(calc, 2640, [], 3000);
  assert.equal(r.debut, 2840);
  assert.equal(choisirFin({ n: 8, blocs: [{ debut: 40, fin: 90, k: 8 }] }, 2640, [], 3000), null);
});

test("générique de fin par l'image : logo coloré au milieu, scène sombre juste avant", () => {
  // Fenêtre commençant à 2558 s, fichier de 2918 s (Lupin 1 : texte, logo Netflix de 10 s, crédits de doublage).
  const lupin = finParImage([[110, 184], [194, 358]], 2558, 2918);
  assert.equal(lupin.debut, 2668);
  // Scène sombre courte avant le générique, séparée de plus de 6 s : pas réunie.
  const sombre = finParImage([[20, 30], [42, 116], [128, 360]], 2560, 2920);
  assert.equal(sombre.debut, 2602);
  // Plage noire qui ne mène pas à la fin : pas un générique.
  assert.equal(finParImage([[100, 200]], 2560, 2920), null);
  // Trop courte.
  assert.equal(finParImage([[340, 359]], 2560, 2920), null);
});
