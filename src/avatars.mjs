// Galerie d'avatars pour les profils, dans l'esprit des plateformes : personnages dessinés de plusieurs styles
// (DiceBear, styles libres de droits ou sous licence CC BY). Téléchargés une seule fois puis servis par Ondi,
// pour que la télé et le téléphone n'aient pas besoin d'Internet pour les afficher.
import fs from 'node:fs';
import path from 'node:path';

const FONDS = ['b6e3f4', 'c0aede', 'd1d4f9', 'ffd5dc', 'ffdfbf', 'c1f0d1', 'f9e2a2', 'a7d8ff'];
const STYLES = [
  ['adventurer', ['Felix', 'Aneka', 'Milo', 'Jade', 'Oscar', 'Luna']],
  ['avataaars', ['Leo', 'Nina', 'Sam', 'Zoe', 'Hugo', 'Maya']],
  ['big-smile', ['Tom', 'Lily', 'Noah', 'Emma']],
  ['lorelei', ['Iris', 'Paul', 'Lea', 'Max']],
  ['micah', ['Alex', 'Rose', 'Jules', 'Eva']],
  ['fun-emoji', ['Joie', 'Cool', 'Rire', 'Wow']],
  ['bottts', ['Robo', 'Bip', 'Zap', 'Nova']],
  ['thumbs', ['Pouce', 'Top', 'Yo', 'Hey']],
];
export const AVATARS = STYLES.flatMap(([style, graines]) =>
  graines.map((g, i) => ({ id: `${style}-${i + 1}`, url: `https://api.dicebear.com/9.x/${style}/svg?seed=${encodeURIComponent(g)}&backgroundColor=${FONDS[(i + style.length) % FONDS.length]}&radius=0` })),
);

export class Avatars {
  constructor({ dossier, journal = () => {} }) {
    this.dossier = dossier;
    this.journal = journal;
    this.chargement = null;
  }
  chemin(id) {
    return path.join(this.dossier, `${id}.svg`);
  }
  disponibles() {
    return AVATARS.filter((a) => fs.existsSync(this.chemin(a.id))).map((a) => a.id);
  }
  // Télécharge ceux qui manquent (en arrière-plan, au démarrage).
  completer() {
    if (this.chargement) return this.chargement;
    this.chargement = (async () => {
      fs.mkdirSync(this.dossier, { recursive: true });
      let n = 0;
      for (const a of AVATARS) {
        if (fs.existsSync(this.chemin(a.id))) continue;
        try {
          const r = await fetch(a.url, { signal: AbortSignal.timeout(15_000) });
          const svg = await r.text();
          if (r.ok && svg.trimStart().startsWith('<svg')) {
            fs.writeFileSync(this.chemin(a.id), svg);
            n++;
          }
        } catch {}
      }
      if (n) this.journal(`Avatars : ${n} téléchargé(s)`);
      this.chargement = null;
    })();
    return this.chargement;
  }
  envoyer(id, res) {
    if (!/^[a-z-]+-\d+$/.test(id) || !fs.existsSync(this.chemin(id))) {
      res.writeHead(404);
      return res.end();
    }
    res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=604800' });
    fs.createReadStream(this.chemin(id)).pipe(res);
  }
}
