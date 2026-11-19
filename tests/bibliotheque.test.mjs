import { test } from 'node:test';
import assert from 'node:assert/strict';
import { titreDeFichier } from '../src/bibliotheque.mjs';
import { lireSonde, resumeVideo } from '../src/video.mjs';

test('bibliothèque : titre et année tirés du nom de fichier', () => {
  const cas = [
    ['Avengers.Endgame.2019.1080p.BluRay.x264-[YTS.LT].mp4', 'Avengers Endgame', 2019],
    ['Bagarre.2026.FRENCH.HDR.2160p.WEB.H265-SUPPLY.mkv', 'Bagarre', 2026],
    ['Hunger games - La révolte - Part 2 (2015) Blu-ray UHD 2160p 4KLightHi-Res 10bits HDR Multi DTS HD-MA Dolby Atmos x265.mkv', 'Hunger games - La révolte - Part 2', 2015],
    ["Le_livre_d'Eli_2010_Multi_VFF_Bluray_1080p_DTS_HDMA_x264.mkv", "Le livre d'Eli", 2010],
    ['The.Odyssey.2026.MULTI.VFQ.2160p.BluRay.4KLight.DV.HDR10_.DTS-HD.MA.5.1.x265-SpK79.mkv', 'The Odyssey', 2026],
  ];
  for (const [nom, titre, annee] of cas) assert.deepEqual(titreDeFichier(nom), { titre, annee }, nom);
});

test('vidéo : pistes lues depuis ffprobe (Dolby Vision, sous-titres forcés, image)', () => {
  const s = lireSonde({
    format: { duration: '6587.1', bit_rate: '26553665', format_name: 'matroska,webm' },
    streams: [
      { index: 0, codec_type: 'video', codec_name: 'hevc', profile: 'Main 10', width: 3840, height: 1608, pix_fmt: 'yuv420p10le', color_transfer: 'smpte2084', avg_frame_rate: '24000/1001', side_data_list: [{ side_data_type: 'DOVI configuration record', dv_profile: 8 }] },
      { index: 1, codec_type: 'audio', codec_name: 'eac3', profile: 'Dolby Digital Plus + Dolby Atmos', channels: 6, tags: { language: 'fre', title: 'French' }, disposition: { default: 1 } },
      { index: 2, codec_type: 'audio', codec_name: 'dts', profile: 'DTS-HD MA', channels: 8, tags: { language: 'eng' } },
      { index: 3, codec_type: 'subtitle', codec_name: 'subrip', tags: { language: 'fre', title: 'French Forced' } },
      { index: 4, codec_type: 'subtitle', codec_name: 'hdmv_pgs_subtitle', tags: { language: 'eng', title: 'English SDH' } },
      { index: 5, codec_type: 'video', codec_name: 'mjpeg', disposition: { attached_pic: 1 } },
    ],
  });
  assert.equal(s.video.hdr, 'Dolby Vision');
  assert.equal(s.video.dvProfil, 8);
  assert.equal(s.video.bits, 10);
  assert.equal(s.video.ips, 23.98);
  assert.equal(resumeVideo(s.video), '4K · Dolby Vision · HEVC');
  assert.deepEqual(s.audios.map((a) => [a.ordre, a.nom]), [[0, 'Français · Atmos · 5.1'], [1, 'Anglais · DTS-HD MA · 7.1']]);
  assert.deepEqual(s.sousTitres.map((x) => [x.ordre, x.nom, x.texte, x.force]), [[0, 'Français · forcés', true, true], [1, 'Anglais · SDH · image', false, false]]);
  assert.equal(Math.round(s.duree), 6587);
});
