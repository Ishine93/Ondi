import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Profils } from '../src/profils.mjs';

const dossierTemp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'debrideur-profils-'));

test('profils : création, connexion sans et avec mot de passe, jetons', () => {
  const dossier = dossierTemp();
  const p = new Profils({ dossier });
  const libre = p.creer({ nom: '  Léo  ', avatar: 'adventurer-1' });
  assert.equal(libre.nom, 'Léo');
  assert.equal(libre.protege, false);
  const prive = p.creer({ nom: 'Maman', motDePasse: 'secret' });
  assert.equal(prive.protege, true);
  assert.throws(() => p.creer({ nom: 'léo' }), /déjà pris/);
  assert.throws(() => p.creer({ nom: '   ' }), /Choisis un nom/);
  assert.throws(() => p.creer({ nom: 'X', avatar: 'javascript:alert(1)' }), /refusée/);

  const { jeton } = p.connecter(libre.id);
  assert.equal(p.profilDuJeton(jeton).id, libre.id);
  assert.throws(() => p.connecter(prive.id, 'faux'), /incorrect/);
  assert.throws(() => p.connecter(prive.id), /incorrect/);
  const ok = p.connecter(prive.id, 'secret');
  assert.equal(p.profilDuJeton(ok.jeton).nom, 'Maman');
  assert.equal(p.profilDuJeton('inconnu'), null);
  assert.equal(p.profilDuJeton('__proto__'), null);

  // Rien de secret dans la liste publique, et tout est relu après redémarrage.
  assert.ok(!JSON.stringify(p.liste()).includes('hash'));
  const relu = new Profils({ dossier });
  assert.equal(relu.liste().length, 2);
  assert.equal(relu.profilDuJeton(ok.jeton).nom, 'Maman');
  relu.deconnecter(ok.jeton);
  assert.equal(relu.profilDuJeton(ok.jeton), null);
});

test('profils : 5 mauvais mots de passe → attente', () => {
  const p = new Profils({ dossier: dossierTemp() });
  const { id } = p.creer({ nom: 'A', motDePasse: '1234' });
  for (let i = 0; i < 5; i++) assert.throws(() => p.connecter(id, 'x'), /incorrect/);
  assert.throws(() => p.connecter(id, '1234'), /Trop d'essais/);
});

test('profils : historique séparé par profil, « vu » à la fin, supprimé avec le profil', () => {
  const dossier = dossierTemp();
  const p = new Profils({ dossier });
  const a = p.creer({ nom: 'A' });
  const b = p.creer({ nom: 'B' });
  p.enregistrerPosition(a.id, 'film:1', { position: 600, duree: 7200, fichier: 'f1' });
  assert.equal(p.historique(a.id)['film:1'].position, 600);
  assert.equal(p.historique(a.id)['film:1'].vu, false);
  assert.deepEqual(p.historique(b.id), {});
  // Générique de fin : vu, et la reprise repart du début.
  const fin = p.enregistrerPosition(a.id, 'film:1', { position: 7000, duree: 7200 });
  assert.equal(fin.vu, true);
  assert.equal(fin.position, 0);
  p.marquerVu(a.id, ['ep:1', 'ep:2']);
  assert.equal(p.historique(a.id)['ep:2'].vu, true);
  p.marquerVu(a.id, 'ep:2', false);
  assert.equal(p.historique(a.id)['ep:2'], undefined);
  p.sauverTout();
  assert.ok(fs.existsSync(path.join(dossier, 'historique', `${a.id}.json`)));
  assert.equal(new Profils({ dossier }).historique(a.id)['film:1'].vu, true);
  p.supprimer(a.id);
  assert.ok(!fs.existsSync(path.join(dossier, 'historique', `${a.id}.json`)));
  assert.equal(p.liste().length, 1);
});
