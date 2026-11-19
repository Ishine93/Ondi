import { test } from 'node:test';
import assert from 'node:assert/strict';
import { comparerVersions, versionsApplisTele, VERSION } from '../src/miseajour.mjs';
import { ecrireZip, lireZip } from '../src/zip.mjs';

test('mises à jour : comparaison des numéros de version', () => {
  assert.equal(comparerVersions('2.0.1', '2.0.0'), 1);
  assert.equal(comparerVersions('v2.1.0', '2.0.9'), 1);
  assert.equal(comparerVersions('2.0.0', '2.0.0'), 0);
  assert.equal(comparerVersions('1.9.10', '2.0.0'), -1);
  assert.equal(comparerVersions('2.10.0', '2.9.0'), 1);
  assert.match(VERSION, /^\d+\.\d+\.\d+$/);
  const tele = versionsApplisTele();
  assert.match(tele.samsung, /^\d+\.\d+\.\d+$/);
  assert.equal(tele.lg, tele.samsung, 'LG et Samsung au même numéro');
  assert.equal(tele.android, tele.samsung, 'Android et Samsung au même numéro');
});

test('zip : ce qui est écrit est relu à l’identique (accents, binaire, scripts exécutables)', () => {
  const entrees = [
    { nom: 'Debrideur/package.json', donnees: Buffer.from('{"version":"9.9.9"}') },
    { nom: 'Debrideur/installer.command', donnees: Buffer.from('#!/bin/bash\necho Ondi\n') },
    { nom: 'Debrideur/public/icône.png', donnees: Buffer.from(Array.from({ length: 5000 }, (_, i) => (i * 7) % 256)) },
  ];
  const relues = lireZip(ecrireZip(entrees));
  assert.deepEqual(relues.map((e) => e.nom), entrees.map((e) => e.nom));
  relues.forEach((e, i) => assert.ok(e.donnees.equals(entrees[i].donnees), e.nom));
  assert.equal(relues[1].executable, true);
  assert.equal(relues[0].executable, false);
  assert.throws(() => lireZip(Buffer.from('pas un zip')), /illisible/);
});
