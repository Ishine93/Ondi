// Faux AllDebrid pour tester Ondi de bout en bout sans compte ni Internet.
// node tests/faux-alldebrid.mjs <port> [Mo/s par connexion]
import http from 'node:http';

const PORT = Number(process.argv[2]) || 18098;
const DEBIT = (Number(process.argv[3]) || 0) * 1024 * 1024; // 0 = illimité
const BASE = `http://127.0.0.1:${PORT}`;
const Mo = 1024 * 1024;

const FICHIERS = {
  'The.Boys.S04E01.MULTi.1080p.WEB.x264.mkv': 70 * Mo + 123,
  'The.Boys.S04E02.MULTi.1080p.WEB.x264.mkv': 66 * Mo + 7,
  'sample-the.boys.mkv': 2 * Mo,
  'The.Boys.S04E02.FRENCH.srt': 40_000,
  'Dune.Part.Two.2024.MULTi.2160p.WEB.H265.mkv': 150 * Mo + 999,
  'Protege.2023.FRENCH.1080p.mkv': 40 * Mo,
  'Archive.Film.2022.part1.rar': 5 * Mo,
};

// Contenu déterministe, vérifiable après coup.
export function octet(nom, i) {
  let h = 0;
  for (const c of nom) h = (h * 31 + c.charCodeAt(0)) & 0xff;
  return (i * 7 + h + (i >> 20)) & 0xff;
}

let appelsStatut = 0;
let coupureFaite = false;
const ouvertures = new Map(); // lien protégé → nombre de fois qu'on a demandé à l'ouvrir
const ok = (res, data) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ status: 'success', data }));
};
const ko = (res, code, message) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ status: 'error', error: { code, message } }));
};
const lire = (req) => new Promise((r) => {
  const m = [];
  req.on('data', (c) => m.push(c));
  req.on('end', () => r(Buffer.concat(m).toString('latin1')));
});

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, BASE);
    if (url.pathname.startsWith('/dl/')) return servirFichier(req, res, decodeURIComponent(url.pathname.slice(4)));
    if (req.headers.authorization !== 'Bearer cle-de-test') return ko(res, 'AUTH_BAD_APIKEY', 'The auth apikey is invalid');
    const corps = await lire(req);
    const champ = (nom) => [...corps.matchAll(new RegExp(`name="${nom.replace(/[[\]]/g, '\\$&')}"\\r\\n\\r\\n([^\\r]*)`, 'g'))].map((m) => m[1]);
    console.log('API', url.pathname, champ('link')[0] || champ('magnets[]')[0] || champ('id')[0] || '');

    switch (url.pathname) {
      case '/v4/user':
        return ok(res, { user: { username: 'testeur', isPremium: true, isTrial: false, premiumUntil: 1830000000 } });
      case '/v4/magnet/upload':
        if (!champ('magnets[]')[0]?.startsWith('magnet:')) return ok(res, { magnets: [{ magnet: '?', error: { code: 'MAGNET_INVALID_URI', message: 'x' } }] });
        appelsStatut = 0;
        return ok(res, { magnets: [{ magnet: champ('magnets[]')[0], hash: 'abc', name: 'The.Boys.S04.MULTi.1080p.WEB', size: 136 * Mo, ready: false, id: 777 }] });
      case '/v4/magnet/upload/file':
        return ok(res, { files: [{ file: 'x.torrent', name: 'Dune.Part.Two.2024.MULTi.2160p.WEB.H265', size: 150 * Mo, hash: 'def', ready: true, id: 888 }] });
      case '/v4.1/magnet/status': {
        const id = Number(champ('id')[0]);
        if (!id) return ok(res, { magnets: [{ id: 888, filename: 'Dune.Part.Two.2024.MULTi.2160p.WEB.H265', size: 150 * Mo, status: 'Ready', statusCode: 4, completionDate: 1795000000 }] });
        if (id === 888) return ok(res, { magnets: [{ id, filename: 'Dune', size: 150 * Mo, status: 'Ready', statusCode: 4 }] });
        appelsStatut++;
        if (appelsStatut < 3) {
          return ok(res, { magnets: [{ id, filename: 'The.Boys.S04', size: 136 * Mo, status: 'Downloading', statusCode: 1, downloaded: appelsStatut * 40 * Mo, downloadSpeed: 12 * Mo, seeders: 23 }] });
        }
        return ok(res, { magnets: [{ id, filename: 'The.Boys.S04', size: 136 * Mo, status: 'Ready', statusCode: 4 }] });
      }
      case '/v4/magnet/files': {
        const id = Number(champ('id[]')[0]);
        const f = (n) => ({ n, s: FICHIERS[n], l: `https://alldebrid.com/f/${encodeURIComponent(n)}` });
        if (id === 888) return ok(res, { magnets: [{ id: String(id), files: [{ n: 'Dune.Part.Two.2024.MULTi.2160p.WEB.H265', e: [f('Dune.Part.Two.2024.MULTi.2160p.WEB.H265.mkv'), { n: 'info.nfo', s: 10, l: 'https://alldebrid.com/f/nfo' }] }] }] });
        return ok(res, {
          magnets: [{
            id: String(id),
            files: [{
              n: 'The.Boys.S04.MULTi.1080p.WEB',
              e: [
                f('The.Boys.S04E01.MULTi.1080p.WEB.x264.mkv'),
                f('The.Boys.S04E02.MULTi.1080p.WEB.x264.mkv'),
                { n: 'Sample', e: [f('sample-the.boys.mkv')] },
                { n: 'Subs', e: [f('The.Boys.S04E02.FRENCH.srt')] },
                { n: 'RARBG.txt', s: 30, l: 'https://alldebrid.com/f/txt' },
              ],
            }],
          }],
        });
      }
      case '/v4/link/unlock': {
        const lien = champ('link')[0] || '';
        let nom = null;
        // Épisode caché derrière dl-protect (« redirect.alldebrid.com/les-gardiens-s1-e3-uptobox ») : petit fichier fabriqué.
        const ep = lien.match(/^https:\/\/redirect\.alldebrid\.com\/(.+)-s(\d+)-e(\d+)/);
        if (ep && !lien.includes('mort')) {
          const titre = ep[1].split('-').map((m) => m[0].toUpperCase() + m.slice(1)).join('.');
          nom = `${titre}.S${ep[2].padStart(2, '0')}E${ep[3].padStart(2, '0')}.VOSTFR.HD.mkv`;
          FICHIERS[nom] ??= 3 * Mo + Number(ep[3]);
        }
        if (lien.startsWith('https://alldebrid.com/f/')) nom = decodeURIComponent(lien.slice(24));
        if (lien === 'https://1fichier.com/?film') nom = 'Dune.Part.Two.2024.MULTi.2160p.WEB.H265.mkv';
        if (lien === 'https://redirect.alldebrid.com/protege-0') nom = 'Protege.2023.FRENCH.1080p.mkv';
        if (lien === 'https://1fichier.com/?archive') nom = 'Archive.Film.2022.part1.rar';
        if (lien === 'https://1fichier.com/?mort') return ko(res, 'LINK_DOWN', 'This link is not available');
        if (!nom || !(nom in FICHIERS)) return ko(res, 'LINK_HOST_NOT_SUPPORTED', 'This host or link is not supported');
        return ok(res, { link: `${BASE}/dl/${encodeURIComponent(nom)}`, filename: nom, filesize: FICHIERS[nom], host: 'test', id: 'x' });
      }
      case '/v4/link/infos': {
        // Lien contenant « mort » : supprimé de l'hébergeur ; autres hébergeurs connus : en ligne.
        const connus = {
          'https://1fichier.com/?film': 'Dune.Part.Two.2024.MULTi.2160p.WEB.H265.mkv',
          'https://1fichier.com/?archive': 'Archive.Film.2022.part1.rar',
          'https://redirect.alldebrid.com/protege-0': 'Protege.2023.FRENCH.1080p.mkv',
        };
        return ok(res, {
          infos: champ('link[]').map((link) => {
            // Hébergeur qu'AllDebrid ne gère pas (annoncé « Uploady » par le faux site).
            if (link.includes('uploady')) return { link, error: { code: 'LINK_HOST_NOT_SUPPORTED', message: 'This host or link is not supported' } };
            if (/mort(-|$)/.test(link) || link.includes('?mort') || link.includes('/mort')) return { link, error: { code: 'LINK_DOWN', message: 'This link is not available on the file hoster website' } };
            const host = ['1fichier', 'uptobox', 'rapidgator', 'redirect.alldebrid'].find((h) => link.includes(h));
            if (!host) return { link, error: { code: 'LINK_HOST_NOT_SUPPORTED', message: 'This host or link is not supported' } };
            const slug = decodeURIComponent(link.split('?fn=')[0].split(/[/?=]/).pop() || 'fichier');
            const ep = slug.match(/^(.+)-s(\d+)-e(\d+)/);
            const titre = (s) => s.split('-').map((m) => m[0].toUpperCase() + m.slice(1)).join('.');
            const filename = connus[link] || (ep ? `${titre(ep[1])}.S${ep[2].padStart(2, '0')}E${ep[3].padStart(2, '0')}.VOSTFR.HD.mkv` : `${slug}.mkv`);
            // Comme le vrai AllDebrid : un lien caché par un protecteur donne l'hébergeur réel.
            const annonce = link.includes('/etoile-') && ['rapidgator', 'turbobit'].find((h) => link.includes(h));
            const reel = host === 'redirect.alldebrid' ? annonce || '1fichier' : host;
            return { link, filename, size: FICHIERS[filename] || 1.4 * 1024 * Mo, host: reel, hostDomain: `${reel}.com` };
          }),
        });
      }
      case '/v4/hosts':
        return ok(res, {
          hosts: {
            '1fichier': { name: '1fichier', type: 'premium', domains: ['1fichier.com', 'alterupload.com', 'desfichiers.com'], status: true },
            uptobox: { name: 'uptobox', type: 'premium', domains: ['uptobox.com', 'uptostream.com'], status: true },
            rapidgator: { name: 'rapidgator', type: 'premium', domains: ['rapidgator.net', 'rg.to'], status: true },
          },
          streams: {},
          redirectors: { 'dl-protect': { name: 'dl-protect', type: 'free', domains: ['dl-protect.link', 'dl-protect.net'] } },
        });
      case '/v4/link/redirector': {
        // « dl-protect.link/les-gardiens-s1-e3 » cache un épisode ; les autres cachent le film « Protégé ».
        const lien = champ('link')[0] || '';
        if (!lien.includes('dl-protect')) return ko(res, 'REDIRECTOR_NOT_SUPPORTED', 'Redirector not supported');
        const slug = lien.split('?')[0].split('/').pop();
        // Liens « etoile-… » (hébergeur annoncé par le site), comme le vrai AllDebrid : un lien jamais vu
        // est long à ouvrir (ici Turbobit, 1,5 s), et le tout premier essai peut rater (REDIRECTOR_ERROR passager).
        if (slug.startsWith('etoile-')) {
          const essai = (ouvertures.get(slug) || 0) + 1;
          ouvertures.set(slug, essai);
          if (essai === 1 && slug.includes('turbobit')) {
            await new Promise((r) => setTimeout(r, 1500));
            if (!slug.includes('mort')) return ko(res, 'REDIRECTOR_ERROR', 'Could not extract links from redirector');
          }
          return ok(res, { links: [`https://redirect.alldebrid.com/${slug}`] });
        }
        return ok(res, { links: [/-s\d+-e\d+/.test(slug) ? `https://redirect.alldebrid.com/${slug}` : 'https://redirect.alldebrid.com/protege-0'] });
      }
      default:
        res.writeHead(404, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ status: 'error', error: { code: '404', message: 'Endpoint doesnt exist' } }));
    }
  })
  .listen(PORT, () => console.log(`Faux AllDebrid sur ${BASE} (débit ${DEBIT ? `${DEBIT / Mo} Mo/s` : 'illimité'} par connexion)`));

async function servirFichier(req, res, nom) {
  const total = FICHIERS[nom];
  if (total === undefined) {
    res.writeHead(404);
    return res.end();
  }
  let debut = 0;
  let fin = total - 1;
  const plage = req.headers.range?.match(/bytes=(\d+)-(\d*)/);
  if (plage) {
    debut = Number(plage[1]);
    if (plage[2]) fin = Math.min(total - 1, Number(plage[2]));
    res.writeHead(206, { 'Content-Range': `bytes ${debut}-${fin}/${total}`, 'Content-Length': fin - debut + 1, 'Accept-Ranges': 'bytes' });
  } else res.writeHead(200, { 'Content-Length': total, 'Accept-Ranges': 'bytes' });

  // Une seule fois : on coupe brutalement la connexion au milieu du 2e bloc du film.
  const couper = nom.startsWith('Dune') && debut === 32 * Mo && !coupureFaite;
  const MORCEAU = 256 * 1024;
  let envoye = 0;
  for (let pos = debut; pos <= fin; pos += MORCEAU) {
    const n = Math.min(MORCEAU, fin - pos + 1);
    const buf = Buffer.allocUnsafe(n);
    for (let i = 0; i < n; i++) buf[i] = octet(nom, pos + i);
    if (res.destroyed) return;
    if (!res.write(buf)) await new Promise((r) => res.once('drain', r));
    envoye += n;
    if (couper && envoye >= 5 * Mo) {
      coupureFaite = true;
      console.log('COUPURE simulée sur', nom);
      return req.socket.destroy();
    }
    if (DEBIT) await new Promise((r) => setTimeout(r, (n / DEBIT) * 1000));
  }
  res.end();
}
