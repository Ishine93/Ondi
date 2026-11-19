// Tendances en France pour les rangées de l'accueil : classements de l'iTunes Store français
// (flux publics, sans clé), avec titres français, affiches et résumés. Mis en cache 6 h.
// Un clic sur un de ces titres lance la recherche sur le site configuré.

const FLUX = 'https://itunes.apple.com/fr/rss';
const RANGEES = {
  films: [
    { id: 'top', titre: 'Top 10 des films en France', chemin: 'topmovies/limit=10', numerote: true },
    { id: 'action', titre: 'Action et aventure', chemin: 'topmovies/limit=20/genre=4401' },
    { id: 'comedie', titre: 'Comédies', chemin: 'topmovies/limit=20/genre=4404' },
    { id: 'sf', titre: 'Science-fiction et fantastique', chemin: 'topmovies/limit=20/genre=4413' },
    { id: 'thriller', titre: 'Thrillers', chemin: 'topmovies/limit=20/genre=4416' },
    { id: 'horreur', titre: 'Horreur', chemin: 'topmovies/limit=20/genre=4408' },
    { id: 'animation', titre: 'Animation japonaise', chemin: 'topmovies/limit=20/genre=4402' },
    { id: 'famille', titre: 'En famille', chemin: 'topmovies/limit=20/genre=4410' },
    { id: 'drame', titre: 'Drames', chemin: 'topmovies/limit=20/genre=4406' },
  ],
  // Les saisons d'une même série sont réunies : on en demande 40 pour garder une vingtaine de séries.
  series: [
    { id: 'series', titre: 'Séries du moment en France', chemin: 'toptvseasons/limit=40', numerote: true },
    { id: 'drame', titre: 'Séries dramatiques', chemin: 'toptvseasons/limit=40/genre=4001' },
    { id: 'action', titre: "Séries d'action et d'aventure", chemin: 'toptvseasons/limit=40/genre=4003' },
    { id: 'comedie', titre: 'Séries comiques', chemin: 'toptvseasons/limit=40/genre=4000' },
    { id: 'sf', titre: 'Séries de science-fiction et fantasy', chemin: 'toptvseasons/limit=40/genre=4008' },
    { id: 'animation', titre: "Séries d'animation", chemin: 'toptvseasons/limit=40/genre=4002' },
  ],
};

const texte = (x) => (x && typeof x === 'object' ? x.label : x) || '';
// Affiche en 400 × 600 (le flux donne des vignettes de 170 px).
const grandeImage = (url) => String(url || '').replace(/\/\d+x\d+bb\.\w+$/, '/400x600bb.jpg');

// « MobLand, Saison 1 (VF) » → { titre: « MobLand », saison: « Saison 1 » } ; gère aussi
// « L'Intégrale (VF & VOST) », « Livre IV », « Vol. 1 », « Saison 6, Partie 2 »…
export function nettoyerSaison(nom) {
  const n = String(nom || '')
    .replace(/\s*\([^)]*\b(?:VF|VOST|VOSTFR|VO|VM)\b[^)]*\)/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  const m = n.match(/^(.+?)[\s,:–-]+(saison|season|livre|partie|vol\.?|volume|l['’]int[ée]grale|int[ée]grale|the complete series|complete series)(?![a-zà-ÿ])\s*(\d+|[IVXLC]+\b)?/i);
  if (!m) return { titre: n, saison: '' };
  const mot = m[2].toLowerCase();
  let saison = `${m[2]} ${m[3] || ''}`.trim();
  if (/saison|season/.test(mot)) saison = m[3] ? `Saison ${m[3]}` : 'Saison';
  else if (/int[ée]grale|complete/.test(mot)) saison = 'Intégrale';
  return { titre: m[1].replace(/[\s,:–-]+$/, '').trim(), saison };
}

function lireEntree(e, serie) {
  const nom = texte(e['im:name']);
  const { titre, saison } = serie ? nettoyerSaison(nom) : { titre: nom, saison: '' };
  return {
    titre,
    saison,
    recherche: titre,
    annee: texte(e['im:releaseDate']).slice(0, 4),
    genre: e.category?.attributes?.label || '',
    image: grandeImage(texte([].concat(e['im:image'] || []).at(-1))),
    resume: texte(e.summary).slice(0, 600),
    type: serie ? 'series' : 'films',
  };
}

async function lireFlux(chemin, serie) {
  const res = await fetch(`${FLUX}/${chemin}/json`, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`iTunes a répondu HTTP ${res.status}`);
  const entrees = [].concat((await res.json()).feed?.entry || []);
  const vus = new Set();
  // Plusieurs saisons d'une même série : on n'en garde qu'une.
  return entrees.map((e) => lireEntree(e, serie)).filter((x) => x.titre && !vus.has(x.titre.toLowerCase()) && vus.add(x.titre.toLowerCase()));
}

const cache = new Map(); // type → { expire, valeur }

// Rangées de tendances pour « films » ou « series » (les rangées qui échouent sont simplement absentes).
export async function tendances(type) {
  const liste = RANGEES[type];
  if (!liste) return [];
  const c = cache.get(type);
  if (c && Date.now() < c.expire) return c.valeur;
  const rangees = await Promise.all(
    liste.map(async (r) => {
      try {
        const items = await lireFlux(r.chemin, type === 'series');
        const max = r.numerote && type === 'films' ? 10 : 20;
        return items.length ? { id: r.id, titre: r.titre, numerote: !!r.numerote, items: items.slice(0, max) } : null;
      } catch {
        return null;
      }
    }),
  );
  const valeur = rangees.filter(Boolean);
  cache.set(type, { valeur, expire: Date.now() + (valeur.length ? 6 * 3600e3 : 5 * 60e3) });
  return valeur;
}
