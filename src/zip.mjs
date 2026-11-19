// Archives zip sans dépendance : écriture (paquets d'installation, application télé) et lecture
// (mise à jour automatique). Méthode « deflate », noms en UTF-8, droits Unix gardés (scripts exécutables sur Mac).
import zlib from 'node:zlib';

const executable = (nom) => /\.(command|sh)$/.test(nom) || /(^|\/)(node|ffmpeg|ffprobe)$/.test(nom);

// entrees : [{ nom: 'dossier/fichier.txt', donnees: Buffer }]
export function ecrireZip(entrees) {
  const locaux = [];
  const central = [];
  let decalage = 0;
  const d = new Date();
  const heure = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  for (const { nom, donnees } of entrees) {
    const nomOctets = Buffer.from(nom, 'utf8');
    const comprime = zlib.deflateRawSync(donnees, { level: 9 });
    const crc = zlib.crc32(donnees);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // noms en UTF-8
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(heure, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(comprime.length, 18);
    local.writeUInt32LE(donnees.length, 22);
    local.writeUInt16LE(nomOctets.length, 26);
    locaux.push(local, nomOctets, comprime);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0);
    c.writeUInt16LE((3 << 8) | 20, 4); // « fait sous Unix » : les droits ci-dessous sont lus par le Mac
    c.writeUInt16LE(20, 6);
    c.writeUInt16LE(0x0800, 8);
    c.writeUInt16LE(8, 10);
    c.writeUInt16LE(heure, 12);
    c.writeUInt16LE(date, 14);
    c.writeUInt32LE(crc, 16);
    c.writeUInt32LE(comprime.length, 20);
    c.writeUInt32LE(donnees.length, 24);
    c.writeUInt16LE(nomOctets.length, 28);
    c.writeUInt32LE(((executable(nom) ? 0o100755 : 0o100644) << 16) >>> 0, 38);
    c.writeUInt32LE(decalage, 42);
    central.push(c, nomOctets);
    decalage += local.length + nomOctets.length + comprime.length;
  }
  const tailleCentral = central.reduce((n, b) => n + b.length, 0);
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0);
  fin.writeUInt16LE(entrees.length, 8);
  fin.writeUInt16LE(entrees.length, 10);
  fin.writeUInt32LE(tailleCentral, 12);
  fin.writeUInt32LE(decalage, 16);
  return Buffer.concat([...locaux, ...central, fin]);
}

// → [{ nom, donnees, executable }] (les dossiers seuls sont ignorés)
export function lireZip(buf) {
  let i = buf.length - 22;
  while (i >= 0 && buf.readUInt32LE(i) !== 0x06054b50) i--;
  if (i < 0) throw new Error('Archive zip illisible.');
  const n = buf.readUInt16LE(i + 10);
  let p = buf.readUInt32LE(i + 16);
  const entrees = [];
  for (let k = 0; k < n; k++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('Archive zip abîmée.');
    const methode = buf.readUInt16LE(p + 10);
    const crc = buf.readUInt32LE(p + 16);
    const tailleComprimee = buf.readUInt32LE(p + 20);
    const lgNom = buf.readUInt16LE(p + 28);
    const lgExtra = buf.readUInt16LE(p + 30);
    const lgCommentaire = buf.readUInt16LE(p + 32);
    const attributs = buf.readUInt32LE(p + 38);
    const local = buf.readUInt32LE(p + 42);
    const nom = buf.toString('utf8', p + 46, p + 46 + lgNom);
    p += 46 + lgNom + lgExtra + lgCommentaire;
    if (nom.endsWith('/')) continue;
    const debut = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const brut = buf.subarray(debut, debut + tailleComprimee);
    const donnees = methode === 8 ? zlib.inflateRawSync(brut) : methode === 0 ? Buffer.from(brut) : null;
    if (!donnees) throw new Error(`Compression non prise en charge (${methode}) pour ${nom}.`);
    if (zlib.crc32(donnees) !== crc) throw new Error(`Fichier abîmé dans l'archive : ${nom}.`);
    entrees.push({ nom, donnees, executable: ((attributs >>> 16) & 0o111) !== 0 || executable(nom) });
  }
  return entrees;
}
