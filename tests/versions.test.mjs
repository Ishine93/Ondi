import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lireVersion, noterVersion, lireProfil, correspondAuVoeu, PROFIL_DEFAUT } from '../src/versions.mjs';

const resume = (nom) => {
  const v = lireVersion(nom);
  return [v.titre, v.annee, v.definition, v.origine, v.langues.detail.join('+'), v.langues.vf, v.langues.vo];
};

test('nom de version : titre, année, définition, origine, langues', () => {
  assert.deepEqual(resume('Dune.2021.MULTi.2160p.WEB-DL.DV.HDR.x265-GRP'), ['Dune', 2021, 2160, 'webdl', 'MULTI', true, true]);
  assert.deepEqual(resume('Dune.Part.Two.2024.MULTi.VFF.2160p.UHD.BluRay.REMUX.DV.HDR.HEVC.TrueHD.7.1.Atmos-GROUP'), ['Dune Part Two', 2024, 2160, 'remux', 'MULTI+VFF', true, true]);
  assert.deepEqual(resume('Dune 2021 MULTi 2160p WEB x265'), ['Dune', 2021, 2160, 'webdl', 'MULTI', true, true]);
  assert.deepEqual(resume('Dune.Deuxieme.Partie.2024.TRUEFRENCH.1080p.BluRay.x264-XX'), ['Dune Deuxieme Partie', 2024, 1080, 'bluray', 'VFF', true, false]);
  assert.deepEqual(resume('Dune.2021.FRENCH.1080p.WEB.x264-GRP'), ['Dune', 2021, 1080, 'webdl', 'VF', true, false]);
  assert.deepEqual(resume('Dune (2021) VOSTFR 1080p HDLight'), ['Dune', 2021, 1080, 'hdlight', 'VOSTFR', false, true]);
  assert.deepEqual(resume('Dune.2021.2160p.UHD.BluRay.x265.10bit.HDR.TrueHD.7.1.Atmos-GRP'), ['Dune', 2021, 2160, 'bluray', '', false, true]);
  assert.deepEqual(resume('Dune.2021.MULTi.VF2.4KLight.HDR.x265-GRP.mkv'), ['Dune', 2021, 2160, 'hdlight', 'MULTI+VF2', true, true]);
  assert.deepEqual(resume('Dune.2021.VFQ.720p.HDTV.x264'), ['Dune', 2021, 720, 'hdtv', 'VFQ', true, false]);
  // Une année dans le titre, un mot de langue dans le titre.
  assert.deepEqual(resume('Blade.Runner.2049.2017.MULTi.2160p.UHD.BluRay.x265-GRP'), ['Blade Runner 2049', 2017, 2160, 'bluray', 'MULTI', true, true]);
  assert.deepEqual(resume('2001.A.Space.Odyssey.1968.MULTi.1080p.BluRay.x264'), ['2001 A Space Odyssey', 1968, 1080, 'bluray', 'MULTI', true, true]);
  assert.deepEqual(resume('The.French.Dispatch.2021.MULTi.1080p.WEB.H264-GRP'), ['The French Dispatch', 2021, 1080, 'webdl', 'MULTI', true, true]);
  assert.deepEqual(resume('La.Haine.FRENCH.1995.1080p.BluRay.x264'), ['La Haine', 1995, 1080, 'bluray', 'VF', true, false]);
  assert.deepEqual(resume('Dune VOSTFR'), ['Dune', null, null, null, 'VOSTFR', false, true]);
  assert.deepEqual(resume('Dune'), ['Dune', null, null, null, '', false, true]);
  // Origines à écarter.
  assert.equal(lireVersion('Dune.2021.FRENCH.HDCAM.x264').origine, 'salle');
  assert.equal(lireVersion('Dune.2021.MULTi.COMPLETE.UHD.BLURAY-GRP').origine, 'disque');
  assert.equal(lireVersion('Dune.2021.MULTi.1080p.BluRay.3D.HSBS.x264').troisD, true);
});

test('nom de version : image, son, groupe', () => {
  const v = lireVersion('Dune.Part.Two.2024.MULTi.VFF.2160p.UHD.BluRay.REMUX.DV.HDR.HEVC.TrueHD.7.1.Atmos-GROUP');
  assert.deepEqual([v.codec, v.hdr, v.audio, v.groupe], ['hevc', ['dv', 'hdr'], ['atmos', 'truehd'], 'GROUP']);
  const w = lireVersion('The.Boys.S04E08.FiNAL.MULTi.VF2.2160p.AMZN.WEB-DL.DDP5.1.H.265-XX');
  assert.deepEqual([w.titre, w.saison, w.episode, w.codec, w.audio, w.groupe, w.hdr], ['The Boys', 4, 8, 'hevc', ['eac3'], 'XX', []]);
  assert.deepEqual(lireVersion('Film.2023.MULTi.2160p.WEB-DL.DV.H265-GRP').hdr, ['dv']);
  assert.deepEqual(lireVersion('Film.2023.MULTi.2160p.WEB-DL.HDR10+.H265-GRP').hdr, ['hdr10+']);
  assert.equal(lireVersion('Film.2023.MULTi.1080p.WEB-DL').groupe, '');
  assert.equal(lireVersion('Film.2023.MULTi.1080p.BluRay.DTS-HD.MA.5.1.x264').audio[0], 'dts-hd');
});

test('nom de version : saisons et épisodes', () => {
  const s = (nom) => {
    const v = lireVersion(nom);
    return [v.titre, v.saison, v.saisonFin, v.episode, v.episodeFin, v.integrale];
  };
  assert.deepEqual(s('The.Boys.S01.MULTi.1080p.WEB.x264-GRP'), ['The Boys', 1, null, null, null, false]);
  assert.deepEqual(s('The.Boys.S01E02.MULTi.1080p.WEB.x264-GRP'), ['The Boys', 1, null, 2, null, false]);
  assert.deepEqual(s('The.Boys.S01E01-E08.MULTi.1080p'), ['The Boys', 1, null, 1, 8, false]);
  assert.deepEqual(s('The.Boys.S01-S04.MULTi.1080p.WEB'), ['The Boys', 1, 4, null, null, true]);
  assert.deepEqual(s('The Boys Saison 2 VOSTFR 1080p'), ['The Boys', 2, null, null, null, false]);
  assert.deepEqual(s('The.Boys.INTEGRALE.MULTi.1080p.BluRay'), ['The Boys', null, null, null, null, true]);
  assert.deepEqual(s('Dune Prophecy S01 VOSTFR 1080p'), ['Dune Prophecy', 1, null, null, null, false]);
  assert.deepEqual(s('The.Game.2021.S01E03.FRENCH.720p.HDTV'), ['The Game', 1, null, 3, null, false]);
});

test('profil : 4K avec français et version originale dans le même fichier', () => {
  const avis = (nom, profil = PROFIL_DEFAUT, extra) => noterVersion(lireVersion(nom), profil, extra);
  assert.equal(avis('Dune.2021.MULTi.2160p.WEB-DL.DV.HDR.x265-GRP').ok, true);
  assert.equal(avis('Dune.2021.MULTi.1080p.WEB-DL.x264-GRP').refus, '1080p au lieu de 4K');
  assert.equal(avis('Dune.2021.TRUEFRENCH.2160p.WEB-DL.x265').refus, 'français seul, sans version originale');
  assert.equal(avis('Dune.2021.VOSTFR.2160p.WEB-DL.x265').refus, 'pas de version française');
  assert.equal(avis('Dune.2021.2160p.UHD.BluRay.x265-GRP').refus, 'langue non précisée (sans doute sans français)');
  assert.equal(avis('Dune.2021.MULTi.2160p.WEB-DL.DV.H265-GRP').refus, 'image en Dolby Vision seul');
  assert.equal(avis('Dune.2021.MULTi.2160p.WEB-DL.DV.H265-GRP', { ...PROFIL_DEFAUT, dolbyVisionSeul: true }).ok, true);
  assert.equal(avis('Dune.2021.MULTi.HDCAM.2160p').refus, 'filmé en salle');
  assert.equal(avis('Dune.2021.MULTi.COMPLETE.UHD.BLURAY-GRP').refus, 'disque complet, pas un simple fichier vidéo');
  assert.equal(avis('Dune.2021.MULTi.WEB-DL.x265').refus, 'définition non précisée');
  assert.equal(avis('Dune.2021.MULTi.2160p.WEB-DL.x265', PROFIL_DEFAUT, { sources: 0 }).refus, 'plus personne ne la partage');
  assert.equal(avis('Dune.2021.MULTi.2160p.REMUX.HEVC', { ...PROFIL_DEFAUT, tailleMax: 40 }, { taille: 61 * 1024 ** 3 }).refus, 'plus de 40 Go');
  // Autres profils.
  assert.equal(avis('Dune.2021.TRUEFRENCH.1080p.WEB-DL.x264', lireProfil({ definitions: [2160, 1080], langue: 'vf' })).ok, true);
  assert.equal(avis('Dune.2021.720p.HDTV.x264', lireProfil({ definitions: [], langue: 'toutes' })).ok, true);
  assert.deepEqual(lireProfil(null), PROFIL_DEFAUT);
  assert.deepEqual(lireProfil({ definitions: ['1080', 999], langue: 'x', poids: 'leger', tailleMax: '30', dolbyVisionSeul: 1 }), { definitions: [1080], langue: 'vf+vo', poids: 'leger', tailleMax: 30, dolbyVisionSeul: false });
});

test('profil : classement des versions acceptées', () => {
  const ordre = (poids, noms) => noms.map((n) => [n, noterVersion(lireVersion(n), { ...PROFIL_DEFAUT, poids }).note]).sort((a, b) => b[1] - a[1]).map(([n]) => n);
  const remux = 'Dune.2021.MULTi.VFF.2160p.UHD.BluRay.REMUX.DV.HDR.HEVC-GRP';
  const web = 'Dune.2021.MULTi.VFF.2160p.WEB-DL.HDR.H265-GRP';
  const light = 'Dune.2021.MULTi.VFF.4KLight.HDR.x265-GRP';
  assert.deepEqual(ordre('equilibre', [remux, light, web]), [web, light, remux]);
  assert.deepEqual(ordre('maximum', [light, web, remux]), [remux, web, light]);
  assert.deepEqual(ordre('leger', [remux, web, light]), [light, web, remux]);
  // À origine égale : doublage de France avant le québécois, HDR avant sans, plus de partageurs avant moins.
  const note = (n, extra) => noterVersion(lireVersion(n), PROFIL_DEFAUT, extra).note;
  assert.ok(note('Dune.2021.MULTi.VFF.2160p.WEB-DL.x265') > note('Dune.2021.MULTi.2160p.WEB-DL.x265'));
  assert.ok(note('Dune.2021.MULTi.2160p.WEB-DL.x265') > note('Dune.2021.MULTi.VFQ.2160p.WEB-DL.x265'));
  assert.ok(note('Dune.2021.MULTi.2160p.WEB-DL.HDR.x265') > note('Dune.2021.MULTi.2160p.WEB-DL.x265'));
  assert.ok(note('Dune.2021.MULTi.2160p.WEB-DL.x265', { sources: 200 }) > note('Dune.2021.MULTi.2160p.WEB-DL.x265', { sources: 2 }));
});

test('correspondance entre une version et ce qu’on cherche', () => {
  const dune = { titres: ['Dune', 'Dune : Première partie'], annee: 2021, type: 'film' };
  const oui = (nom, voeu) => correspondAuVoeu(lireVersion(nom), voeu);
  assert.ok(oui('Dune.2021.MULTi.2160p.WEB-DL.x265-GRP', dune));
  assert.ok(oui('Dune MULTi 2160p', dune));
  assert.ok(oui('Dune.Premiere.Partie.2021.MULTi.2160p', dune));
  assert.ok(!oui('Dune.1984.MULTi.2160p.BluRay', dune));
  assert.ok(!oui('Dune.Part.Two.2024.MULTi.2160p', dune));
  assert.ok(!oui('Dune.Prophecy.S01.MULTi.2160p', dune));
  assert.ok(oui('The.Batman.2022.MULTi.2160p', { titres: ['The Batman'], annee: 2022, type: 'film' }));
  assert.ok(oui('Les.Trois.Mousquetaires.DArtagnan.2023.FRENCH.2160p', { titres: ["Les Trois Mousquetaires : D'Artagnan"], annee: 2023, type: 'film' }));
  const boys = { titres: ['The Boys'], type: 'serie', saison: 2 };
  assert.ok(oui('The.Boys.S02.MULTi.2160p.WEB', boys));
  assert.ok(oui('The.Boys.S01-S04.MULTi.1080p.WEB', boys));
  assert.ok(oui('The.Boys.INTEGRALE.MULTi.1080p', boys));
  assert.ok(!oui('The.Boys.S03.MULTi.2160p.WEB', boys));
  assert.ok(!oui('The.Boys.Presents.Diabolical.S02.MULTi', boys));
  assert.ok(oui('The.Boys.S02E05.MULTi.2160p.WEB', { ...boys, episode: 5 }));
  assert.ok(!oui('The.Boys.S02E04.MULTi.2160p.WEB', { ...boys, episode: 5 }));
  assert.ok(oui('The.Boys.S02.MULTi.2160p.WEB', { ...boys, episode: 5 }));
  assert.ok(!oui('The.Boys.2019.MULTi.2160p', boys));
});

test('regroupement des versions par film ou série', async () => {
  const { regrouperVersions } = await import('../src/versions.mjs');
  let n = 0;
  const v = (nom, extra = {}) => {
    const lu = lireVersion(nom);
    const avis = noterVersion(lu, lireProfil({ definitions: [2160, 1080], langue: 'vf' }));
    return { id: `v${++n}`, nom, titre: lu.titre, annee: lu.annee, saison: lu.saison, episode: lu.episode, integrale: lu.integrale, definition: lu.definition, langues: lu.langues.detail, vf: lu.langues.vf, vo: lu.langues.vo, convient: avis.ok, note: avis.note, sources: 10, date: 1000 + n, ...extra };
  };
  const versions = [
    v('Dune.2021.4K.MULTi.VFF.2160p.HDR.WEB.EAC3.x265-EXTREME', { sources: 80 }),
    v('Dune.2021.MULTi.TRUEFRENCH.1080p.WEB.H264-EXTREME'),
    v('Dune 2021 VOSTFR 720p'),
    v('Dune MULTi 1080p WEB'), // sans année : rejoint Dune (2021)
    v('Dune.1984.FRENCH.1080p.BluRay.x264'),
    v('Dune.Part.Two.2024.MULTi.1080p.WEB.x264'),
    v('Dune.Prophecy.S01E01.MULTi.1080p.WEB.x264-FW'),
    v('Dune.Prophecy.S01E02.MULTi.1080p.WEB.x264-FW'),
    v('Dune.Prophecy.S02.VOSTFR.1080p.WEB'),
    v('The.Dune.2021.FRENCH.1080p'), // l'article de tête ne compte pas
  ];
  const contenus = regrouperVersions(versions, 'dune');
  assert.deepEqual(contenus.map((c) => [c.type, c.titre, c.annee, c.versions.length, c.conviennent]), [
    ['film', 'Dune', 2021, 5, 4],
    ['film', 'Dune', 1984, 1, 1],
    ['serie', 'Dune Prophecy', null, 3, 2],
    ['film', 'Dune Part Two', 2024, 1, 1],
  ]);
  const [dune, , prophecy] = contenus;
  assert.deepEqual([dune.definitions, dune.familles, dune.pertinence], [[2160, 1080], ['multi', 'vf', 'vostfr'], 3]);
  assert.deepEqual([prophecy.saisons, prophecy.familles, prophecy.pertinence], [[1, 2], ['multi', 'vostfr'], 2]);
  assert.deepEqual(dune.versions.slice(0, 2), ['v1', 'v2']);
  // Sans mot cherché (nouveautés) : les plus récents d'abord, ceux qui conviennent avant les autres.
  assert.deepEqual(regrouperVersions(versions).map((c) => c.titre), ['Dune', 'Dune Prophecy', 'Dune Part Two', 'Dune']);
  assert.deepEqual(regrouperVersions([]), []);
});
