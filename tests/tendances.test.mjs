import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nettoyerSaison } from '../src/tendances.mjs';

test('tendances : noms de saisons iTunes ramenés au titre de la série', () => {
  const cas = [
    ['MobLand, Saison 1 (VF)', 'MobLand', 'Saison 1'],
    ['Chicago Fire, Saison 15 (VOST)', 'Chicago Fire', 'Saison 15'],
    ['Doctor Who, Saison 6, Partie 2', 'Doctor Who', 'Saison 6'],
    ['Doctor Who, Season 1', 'Doctor Who', 'Saison 1'],
    ["The Big Bang Theory, L'Intégrale (VF & VOST)", 'The Big Bang Theory', 'Intégrale'],
    ['Kaamelott, Livre IV', 'Kaamelott', 'Livre IV'],
    ['Looney Tunes Platinum Collection, All Stars, Vol. 1', 'Looney Tunes Platinum Collection, All Stars', 'Vol. 1'],
    ['Profilage, Saison 2, Partie 1', 'Profilage', 'Saison 2'],
    ['Il a déjà tes yeux, Saison 1', 'Il a déjà tes yeux', 'Saison 1'],
    ['Tintin dans le Monde arabe', 'Tintin dans le Monde arabe', ''],
    ['Shadowhunters (VF)', 'Shadowhunters', ''],
  ];
  for (const [nom, titre, saison] of cas) assert.deepEqual(nettoyerSaison(nom), { titre, saison }, nom);
});
