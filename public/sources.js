// Sources de recherche : Ondi cherche sur plusieurs sites à la fois (leurs descriptions viennent du
// catalogue public de Prowlarr, lu par le serveur : src/sources.mjs). Ici : la fenêtre de gestion,
// ouverte depuis les Réglages, et les versions trouvées, affichées en haut de la recherche.
/* global $, element, api, t, dernier, taille, mode */

const ACCES = { libre: 'Sans inscription', inscription: 'Inscription gratuite', prive: 'Sur invitation' };
const LANGUES_SOURCES = { fr: 'Français', en: 'Anglais', es: 'Espagnol', de: 'Allemand', it: 'Italien', pt: 'Portugais', ru: 'Russe', zh: 'Chinois', ja: 'Japonais', nl: 'Néerlandais', pl: 'Polonais' };
const nomLangue = (code) => LANGUES_SOURCES[String(code).slice(0, 2).toLowerCase()] || String(code).slice(0, 2).toUpperCase();
const hoteSource = (lien) => {
  try {
    return new URL(lien).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
};
const nombreSources = () => Number(dernier.config?.sources) || 0;

// ---------- profil : la version voulue ----------

const CHOIX_DEFINITION = [['2160', '4K uniquement'], ['2160,1080', '4K ou 1080p'], ['1080', '1080p uniquement'], ['', 'Toutes les définitions']];
const CHOIX_LANGUE = [['vf+vo', 'VF et VO dans le même fichier'], ['vf', 'Au moins la VF'], ['toutes', 'Toutes les langues']];
const CHOIX_POIDS = [['equilibre', 'Équilibré'], ['leger', 'Fichiers les plus légers'], ['maximum', 'Qualité maximale (très gros fichiers)']];

function profilEnMots(p = dernier.config?.profilVersions) {
  if (!p) return '';
  const definition = CHOIX_DEFINITION.find(([v]) => v === (p.definitions || []).join(','))?.[1] || `${(p.definitions || []).join(', ')}p`;
  const langue = { 'vf+vo': 'VF + VO', vf: 'avec la VF', toutes: 'toutes langues' }[p.langue] || '';
  return [t(definition), t(langue)].filter(Boolean).join(', ');
}

function champChoix(libelle, choix, valeur, surChangement) {
  const label = element('label', '', t(libelle));
  const sel = element('select');
  for (const [v, texte] of choix) {
    const o = element('option', '', t(texte));
    o.value = v;
    sel.append(o);
  }
  sel.value = valeur;
  sel.addEventListener('change', () => surChangement(sel.value));
  label.append(sel);
  return label;
}

// ---------- fenêtre ----------

let vueSources = 'liste';

function fenetreSources() {
  let d = $('#dlgSources');
  if (d) return d;
  d = element('dialog');
  d.id = 'dlgSources';
  const form = element('form');
  form.method = 'dialog';
  const tete = element('div', 'dlg-tete');
  tete.append(element('h2'));
  const pied = element('div', 'dlg-pied');
  form.append(tete, element('div', 'dlg-corps'), pied);
  d.append(form);
  document.body.append(d);
  // Retour de la télécommande, Échap : on remonte d'un écran avant de fermer.
  const remonter = (e) => {
    if (vueSources === 'liste') return;
    e.preventDefault();
    vueSources === 'source' && d.dataset.depuis === 'catalogue' ? afficherCatalogueSources() : afficherListeSources();
  };
  // La télécommande passe par « cancel » (voir la gestion de Retour dans la page) ; Échap est pris ici, au
  // clavier, sinon le navigateur ferme la fenêtre d'office au deuxième appui de suite.
  d.addEventListener('cancel', remonter);
  d.addEventListener('keydown', (e) => e.key === 'Escape' && !document.querySelector('.choix-option') && remonter(e));
  d.addEventListener('close', () => {
    majResumeSources();
    // Fermée : on revient aux Réglages, d'où elle a été ouverte.
    if (d.dataset.reglages === 'oui' && typeof ouvrirReglages === 'function') ouvrirReglages('#btnSources');
  });
  return d;
}

function peindreSources(titre, corps, boutons, message = '') {
  const d = fenetreSources();
  d.querySelector('h2').textContent = t(titre);
  d.querySelector('.dlg-corps').replaceChildren(...corps);
  const msg = element('span', 'msg', message);
  d.querySelector('.dlg-pied').replaceChildren(msg, ...boutons);
  d.querySelector('.dlg-corps').scrollTop = 0;
  return msg;
}

function boutonSources(texte, classe, action) {
  const b = element('button', classe, t(texte));
  b.type = 'button';
  b.addEventListener('click', action);
  return b;
}

async function ouvrirSources() {
  const d = fenetreSources();
  const reglages = $('#reglages');
  d.dataset.reglages = reglages?.open ? 'oui' : 'non';
  if (reglages?.open) reglages.close();
  if (!d.open) d.showModal();
  await afficherListeSources();
}

// Écran principal : la version voulue et les sources activées.
async function afficherListeSources(message = '') {
  vueSources = 'liste';
  const fermer = boutonSources('Fermer', 'bouton', () => fenetreSources().close());
  let msg = peindreSources('Sources de recherche', [element('p', 'aide', t('Chargement…'))], [fermer], message);
  let actives;
  try {
    ({ actives } = await api('/api/sources'));
  } catch (e) {
    msg.className = 'msg ko';
    msg.textContent = e.message;
    return;
  }
  if (vueSources !== 'liste') return;
  dernier.config.sources = actives.length;
  const p = dernier.config.profilVersions || {};
  const sauverProfil = async (changement) => {
    try {
      const r = await api('/api/config', { method: 'POST', body: JSON.stringify({ profilVersions: { ...dernier.config.profilVersions, ...changement } }) });
      dernier.config = r.config;
      msg.className = 'msg ok';
      msg.textContent = t('Version voulue : {profil}', { profil: profilEnMots() });
    } catch (e) {
      msg.className = 'msg ko';
      msg.textContent = e.message;
    }
  };
  const profil = element('div', 'src-bloc');
  const champs = element('div', 'src-profil');
  champs.append(
    champChoix('Définition', CHOIX_DEFINITION, (p.definitions || []).join(','), (v) => sauverProfil({ definitions: v ? v.split(',').map(Number) : [] })),
    champChoix('Langues', CHOIX_LANGUE, p.langue || 'vf+vo', (v) => sauverProfil({ langue: v })),
    champChoix('Poids des fichiers', CHOIX_POIDS, p.poids || 'equilibre', (v) => sauverProfil({ poids: v })),
  );
  const dv = element('label', 'f-case');
  const caseDv = element('input');
  caseDv.type = 'checkbox';
  caseDv.checked = !!p.dolbyVisionSeul;
  caseDv.addEventListener('change', () => sauverProfil({ dolbyVisionSeul: caseDv.checked }));
  dv.append(caseDv, ` ${t('Accepter les images en Dolby Vision seul')}`);
  profil.append(
    element('div', 'f-titre', t('Version voulue')),
    champs,
    dv,
    element('p', 'aide', t('Quand plusieurs versions existent, celles qui conviennent passent devant, la meilleure en tête. Dolby Vision seul : à cocher uniquement si ta télé le gère (les télés Samsung ne le gèrent pas : les couleurs seraient fausses).')),
  );

  const bloc = element('div', 'src-bloc');
  bloc.append(element('div', 'f-titre', t('Sources activées')));
  if (!actives.length) bloc.append(element('p', 'aide', t('Aucune pour l’instant. Ajoute les sites où tu veux chercher : Ondi les interroge tous à la fois.')));
  // Une ligne par source, à sélectionner d'un bloc (plus simple à la télécommande) : elle ouvre ses réglages,
  // où se trouve aussi « Retirer ».
  for (const s of actives) {
    const ligne = boutonSources('', 'src-ligne', () => afficherSource(s.id, 'liste'));
    ligne.append(element('span', 'src-nom', s.nom));
    if (s.acces) ligne.append(element('span', `src-etiquette ${s.acces}`, t(ACCES[s.acces])));
    ligne.append(element('span', 'src-detail', s.utilisable ? hoteSource(s.lien) : t('Inutilisable : {raison}', { raison: t(s.raison) })), element('span', 'src-suite', `${t('Réglages')} ›`));
    bloc.append(ligne);
  }
  const ajouter = boutonSources('', 'src-ligne src-ajout', () => afficherCatalogueSources());
  ajouter.append(element('span', 'src-nom', t('+ Ajouter une source…')));
  bloc.append(ajouter);
  msg = peindreSources('Sources de recherche', [profil, bloc], [fermer], message);
  msg.className = message ? 'msg ok' : 'msg';
  (bloc.querySelector('.src-ligne') || ajouter).focus();
}

// Écran du catalogue : choisir un site parmi ceux que le moteur sait lire.
let catalogueSources = null;
const filtresCatalogue = { texte: '', francais: false, libre: false, video: true };

async function afficherCatalogueSources() {
  vueSources = 'catalogue';
  const retour = boutonSources('Retour', 'bouton', () => afficherListeSources());
  const msg = peindreSources('Ajouter une source', [element('p', 'aide', t('Chargement du catalogue…'))], [retour]);
  try {
    catalogueSources = await api('/api/sources/catalogue');
  } catch (e) {
    msg.className = 'msg ko';
    msg.textContent = e.message;
    return;
  }
  if (vueSources !== 'catalogue') return;
  const champ = element('input');
  champ.type = 'search';
  champ.placeholder = t('Nom du site…');
  champ.setAttribute('aria-label', t('Nom du site'));
  champ.autocomplete = 'off';
  champ.spellcheck = false;
  champ.value = filtresCatalogue.texte;
  const liste = element('div', 'co-liste src-catalogue');
  const compte = element('p', 'aide');
  const remplir = () => {
    const mots = filtresCatalogue.texte.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/\s+/).filter(Boolean);
    const garde = catalogueSources.sources.filter((s) => {
      if (filtresCatalogue.francais && !s.langue.toLowerCase().startsWith('fr')) return false;
      if (filtresCatalogue.libre && s.acces !== 'libre') return false;
      if (filtresCatalogue.video && !s.films && !s.series) return false;
      const texte = `${s.nom} ${s.id}`.toLowerCase();
      return mots.every((m) => texte.includes(m));
    });
    garde.sort((a, b) => b.utilisable - a.utilisable);
    liste.replaceChildren(
      ...garde.slice(0, 60).map((s) => {
        const b = element('button', `co-option src-choix${s.utilisable ? '' : ' inutilisable'}`);
        b.type = 'button';
        const haut = element('span', 'src-haut');
        haut.append(element('span', 'src-nom', s.nom), element('span', 'src-etiquette', t(nomLangue(s.langue))), element('span', `src-etiquette ${s.acces}`, t(ACCES[s.acces])));
        if (s.active) haut.append(element('span', 'src-etiquette libre', t('Activée')));
        if (!s.utilisable) haut.append(element('span', 'src-etiquette souci', t(s.raison)));
        b.append(haut, element('span', 'src-desc', s.description));
        b.addEventListener('click', () => afficherSource(s.id, 'catalogue'));
        return b;
      }),
    );
    compte.textContent = garde.length > 60 ? t('{n} sites : les 60 premiers sont affichés, précise le nom pour voir les autres.', { n: garde.length }) : garde.length ? t('{n} sites', { n: garde.length }) : t('Aucun site ne correspond.');
  };
  champ.addEventListener('input', () => {
    filtresCatalogue.texte = champ.value;
    remplir();
  });
  const puce = (texte, cle) => {
    const b = boutonSources(texte, 'chip', () => {
      filtresCatalogue[cle] = !filtresCatalogue[cle];
      b.setAttribute('aria-pressed', String(filtresCatalogue[cle]));
      remplir();
    });
    b.setAttribute('aria-pressed', String(filtresCatalogue[cle]));
    return b;
  };
  const filtres = element('div', 'src-filtres');
  filtres.append(champ, puce('En français', 'francais'), puce('Sans inscription', 'libre'), puce('Films et séries', 'video'));
  remplir();
  const aide = element('p', 'aide', t('Les sites viennent du catalogue public de Prowlarr, qu’Ondi lit lui-même : rien d’autre à installer. Un site sur invitation demande ton compte chez lui.'));
  peindreSources('Ajouter une source', [aide, filtres, compte, liste], [retour]);
  champ.focus();
}

// Écran d'une source : ses réglages, puis un essai tout de suite.
async function afficherSource(id, depuis) {
  vueSources = 'source';
  const d = fenetreSources();
  d.dataset.depuis = depuis;
  const revenir = () => (depuis === 'catalogue' ? afficherCatalogueSources() : afficherListeSources());
  const retour = boutonSources('Retour', 'bouton', revenir);
  const msg = peindreSources('Source', [element('p', 'aide', t('Chargement…'))], [retour]);
  let f;
  try {
    f = await api(`/api/sources/reglages?id=${encodeURIComponent(id)}`);
  } catch (e) {
    msg.className = 'msg ko';
    msg.textContent = e.message;
    return;
  }
  if (vueSources !== 'source') return;
  const corps = [];
  const tete = element('div', 'src-haut');
  tete.append(element('span', 'src-etiquette', t(nomLangue(f.langue))), element('span', `src-etiquette ${f.acces}`, t(ACCES[f.acces])));
  if (f.antiRobot) tete.append(element('span', 'src-etiquette prive', t('Vérification anti-robot possible')));
  corps.push(tete, element('p', 'aide', f.description));
  // Une source activée peut être retirée d'ici (ses réglages sont alors oubliés).
  const retirer = boutonSources('Retirer cette source', 'bouton danger', async () => {
    try {
      await api('/api/sources/retirer', { method: 'POST', body: JSON.stringify({ id }) });
      afficherListeSources(t('{nom} retirée.', { nom: f.nom }));
    } catch (e) {
      msg.className = 'msg ko';
      msg.textContent = e.message;
    }
  });
  const pied = f.active ? [retour, retirer] : [retour];
  if (!f.utilisable) {
    corps.push(element('p', 'src-essai ko', t('Ce site n’est pas utilisable dans Ondi : {raison}.', { raison: t(f.raison) })));
    peindreSources(f.nom, corps, pied);
    retour.focus();
    return;
  }
  if (f.antiRobot) corps.push(element('p', 'aide', t('Si ce site affiche une vérification « je ne suis pas un robot », Ondi ne peut pas la passer : la recherche y échouera.')));
  const lireValeurs = [];
  const adresse = element('label', '', t('Adresse du site'));
  const champAdresse = element('input');
  champAdresse.value = f.lien;
  champAdresse.spellcheck = false;
  champAdresse.inputMode = 'url';
  adresse.append(champAdresse, element('p', 'aide', t('À changer seulement si le site a déménagé.')));
  corps.push(adresse);
  for (const r of f.reglages) {
    if (r.type === 'info') {
      if (r.texte) corps.push(element('p', 'aide', `${r.libelle} : ${r.texte}`));
      continue;
    }
    if (r.type === 'case') {
      const label = element('label', 'f-case');
      const c = element('input');
      c.type = 'checkbox';
      c.checked = !!r.valeur;
      label.append(c, ` ${r.libelle}`);
      lireValeurs.push(() => [r.nom, c.checked]);
      corps.push(label);
      continue;
    }
    const label = element('label', '', r.libelle);
    if (r.type === 'choix') {
      const sel = element('select');
      for (const o of r.options) {
        const option = element('option', '', o.libelle);
        option.value = o.valeur;
        sel.append(option);
      }
      sel.value = r.valeur;
      lireValeurs.push(() => [r.nom, sel.value]);
      label.append(sel);
    } else {
      const c = element('input');
      c.spellcheck = false;
      c.autocomplete = 'off';
      if (r.type === 'secret') {
        c.type = 'password';
        c.placeholder = r.rempli ? t('Enregistré — laisse vide pour le garder') : '';
      } else c.value = r.valeur ?? '';
      lireValeurs.push(() => [r.nom, c.value]);
      label.append(c);
    }
    corps.push(label);
  }
  const essai = element('p', 'src-essai');
  essai.hidden = true;
  corps.push(essai);
  const enregistrer = boutonSources(f.active ? 'Enregistrer et essayer' : 'Activer et essayer', 'bouton principal', async () => {
    enregistrer.disabled = true;
    essai.hidden = false;
    essai.className = 'src-essai';
    essai.textContent = t('Essai en cours sur {site}…', { site: f.nom });
    try {
      const r = await api('/api/sources', { method: 'POST', body: JSON.stringify({ id, valeurs: Object.fromEntries(lireValeurs.map((lire) => lire())), lien: champAdresse.value }) });
      dernier.config.sources = r.actives.length;
      if (r.essai.erreur) {
        essai.className = 'src-essai ko';
        essai.textContent = t('La source est enregistrée, mais l’essai a échoué : {erreur}', { erreur: r.essai.erreur });
      } else {
        essai.className = 'src-essai ok';
        essai.textContent = r.essai.versions
          ? t('Ça marche : {n} versions reçues en {s} s (par exemple « {exemple} »).', { n: r.essai.versions, s: (r.essai.ms / 1000).toFixed(1), exemple: r.essai.exemple })
          : t('Le site répond, sans rien renvoyer pour l’essai. Lance une vraie recherche pour vérifier.');
      }
      enregistrer.textContent = t('Enregistrer et essayer');
    } catch (e) {
      essai.className = 'src-essai ko';
      essai.textContent = e.message;
    } finally {
      enregistrer.disabled = false;
      essai.scrollIntoView({ block: 'nearest' });
    }
  });
  peindreSources(f.nom, corps, [...pied, enregistrer]);
  // Sur une source déjà activée, on arrive sur le bouton (pas dans un champ, qui ouvrirait le clavier de la télé).
  (f.active ? enregistrer : d.querySelector('.dlg-corps input[type="password"], .dlg-corps label:not(:first-of-type) input:not([type="checkbox"])') || enregistrer).focus();
}

// Ligne de résumé dans les Réglages.
function majResumeSources() {
  const el = $('#cSources');
  if (!el) return;
  const n = nombreSources();
  el.textContent = n ? t(n > 1 ? '{n} sources activées · version voulue : {profil}' : '{n} source activée · version voulue : {profil}', { n, profil: profilEnMots() }) : t('Aucune source activée : Ondi ne cherche que sur le site de recherche ci-dessus.');
}

// ---------- les sources dans la recherche, l'accueil et les fiches ----------
// Les films et séries trouvés sur les sources rejoignent la même grille que ceux du site : même carte quand
// c'est le même titre. Dans la fiche d'un contenu, l'onglet « Sources » liste ses versions (langue, qualité,
// taille, partageurs), cherchées exprès pour lui ; l'onglet du site reste comme avant.
/* global recherche, resumes, contenuDe, ajouterResultats, majGroupe, etatResultats, carteContenu, sansAnnee, rangee, vueActive, rubriqueAccueil, mode, rafraichir */

const ORIGINES_SOURCES = { remux: 'REMUX', bluray: 'BluRay', webdl: 'WEB', webrip: 'WEBRip', hdlight: 'Light', hdtv: 'HDTV', dvd: 'DVD', salle: 'CAM', disque: 'Disque' };
const DEFINITIONS_SOURCES = { 2160: '4K', 1080: '1080p', 720: '720p', 480: 'SD' };
const FAMILLES_SOURCES = { MULTI: 'multi', DUAL: 'multi', VF2: 'vf', VFF: 'vf', VFQ: 'vf', VFI: 'vf', VF: 'vf', VOSTFR: 'vostfr', VO: 'vo' };
const NOMS_FAMILLES = { multi: 'MULTI', vf: 'VF', vostfr: 'VOSTFR', vo: 'VO' };
const famillesDe = (versions) => Object.keys(NOMS_FAMILLES).filter((f) => versions.some((v) => (v.langues.length ? v.langues.some((l) => FAMILLES_SOURCES[l] === f) : f === 'vo')));

let rechercheSources = null; // la recherche en cours sur les sources (pour l'arrêter)
let dernieresSources = null; // { q, r } : dernier état reçu pour la recherche affichée

function viderSources() {
  rechercheSources?.abort();
  rechercheSources = null;
  dernieresSources = null;
  const zone = $('#versionsSources');
  if (zone) {
    zone.hidden = true;
    zone.replaceChildren();
  }
}

// Lit une réponse envoyée ligne par ligne : une ligne JSON à chaque source qui a répondu.
async function lireFluxSources(adresse, signal, surEtape) {
  const r = await fetch(adresse, { signal });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).erreur || `Erreur ${r.status}`);
  const lignes = (texte) => {
    for (const ligne of texte.split('\n')) {
      if (!ligne.trim()) continue;
      let etape;
      try {
        etape = JSON.parse(ligne);
      } catch {
        continue;
      }
      surEtape(etape);
    }
  };
  if (!r.body?.getReader) return lignes(await r.text());
  const lecteur = r.body.getReader();
  const decodeur = new TextDecoder();
  let reste = '';
  for (;;) {
    const { done, value } = await lecteur.read();
    if (done) break;
    reste += decodeur.decode(value, { stream: true });
    const fin = reste.lastIndexOf('\n');
    if (fin < 0) continue;
    lignes(reste.slice(0, fin));
    reste = reste.slice(fin + 1);
  }
  lignes(reste);
}

// Pose sur un contenu (une carte de la grille ou de l'accueil) ce que les sources en ont. La carte reçoit des
// versions « de remplacement » (une par définition pour un film, une par saison pour une série) : elles servent
// à ses puces et aux filtres ; les vraies versions s'affichent dans l'onglet « Sources » de la fiche.
function poserSources(c, versions) {
  const lots = new Map();
  for (const v of versions) {
    const cle = c.type === 'serie' ? (v.saison ?? 'tout') : DEFINITIONS_SOURCES[v.definition] || '';
    if (!lots.has(cle)) lots.set(cle, []);
    lots.get(cle).push(v);
  }
  const image = `/api/sources/affiche?titre=${encodeURIComponent(c.titre)}${c.annee ? `&annee=${c.annee}` : ''}&type=${c.type}`;
  const fiches = [];
  let g = null;
  for (const [cle, vs] of lots) {
    const familles = famillesDe(vs);
    const definition = Math.max(0, ...vs.map((v) => v.definition || 0));
    const x = {
      url: `sources:${c.cleSite}:${cle}`, deSource: true, brut: c.titre, image, chemin: t('Sur tes sources'),
      titre: c.titreAffiche, cle: c.cleSite, serie: c.type === 'serie',
      langue: NOMS_FAMILLES[familles[0]] || '', familles,
      qualite: c.type === 'serie' ? DEFINITIONS_SOURCES[definition] || '' : cle,
      saison: c.type !== 'serie' ? '' : cle === 'tout' ? 'Intégrale' : `Saison ${cle}`,
      saisonNum: c.type !== 'serie' ? null : cle === 'tout' ? 999 : cle,
      episodes: '', annee: c.annee ? String(c.annee) : '', genres: '', note: '',
    };
    // Pas de liens d'hébergeur à vérifier pour ces versions-là : leur état est dit tout de suite.
    resumes.set(x.url, { etat: 'inconnu', total: 0, autres: vs.length, texte: t(vs.length > 1 ? '{n} versions sur tes sources' : '{n} version sur tes sources', { n: vs.length }) });
    g = contenuDe(x);
    const deja = g.versions.find((v) => v.url === x.url);
    if (deja !== x) Object.assign(deja, x);
    fiches.push(deja);
  }
  if (g) g.sources = versions;
  return { g, fiches };
}

// Les contenus trouvés sur les sources entrent dans la grille de la recherche affichée.
function fondreSources() {
  const etat = dernieresSources;
  if (!etat || typeof recherche === 'undefined' || !recherche || recherche.q !== etat.q) return;
  const { r } = etat;
  const parId = new Map(r.versions.map((v) => [v.id, v]));
  const fiches = [];
  const touches = [];
  for (const c of r.contenus.slice(0, 80)) {
    const pose = poserSources(c, c.versions.map((id) => parId.get(id)).filter(Boolean));
    fiches.push(...pose.fiches);
    if (pose.g) touches.push(pose.g);
  }
  recherche.sources = r.sources.filter((s) => !s.erreur).length;
  ajouterResultats(fiches);
  for (const g of touches) majGroupe(g);
  if (recherche.groupes.size || r.fini) etatResultats(recherche.pageEnCours);
}

// type : 'film', 'serie' ou rien (les deux). Les résultats arrivent au fur et à mesure et rejoignent la grille ;
// ici ne s'affiche qu'une ligne d'état (sources en panne) et le raccourci vers la liste d'envies.
async function chercherSurSources(q, type) {
  const zone = $('#versionsSources');
  viderSources();
  if (!zone || !q || !nombreSources()) return;
  const ctrl = (rechercheSources = new AbortController());
  const total = nombreSources();
  const info = element('span', 'vs-info', t(total > 1 ? 'Recherche sur tes {n} sources…' : 'Recherche sur ta source…', { n: total }));
  const pannes = element('div', 'vs-pannes');
  const envie = element('div', 'vs-envie');
  zone.replaceChildren(info, pannes, envie);
  zone.hidden = false;
  const montrer = (r) => {
    if (ctrl.signal.aborted) return;
    if (r.erreur) {
      info.className = 'vs-info ko';
      info.textContent = r.erreur;
      return;
    }
    dernieresSources = { q, r };
    const n = r.contenus.length;
    info.className = 'vs-info';
    info.textContent = !r.fini
      ? t('Tes sources : {fait} sur {total} ont répondu…', { fait: r.sources.length, total })
      : n ? t(n > 1 ? 'Tes sources : {n} films et séries, mêlés aux résultats ci-dessous.' : 'Tes sources : {n} film ou série, mêlé aux résultats ci-dessous.', { n }) : t('Tes sources n’ont rien pour « {q} ».', { q });
    pannes.replaceChildren(...r.sources.filter((s) => s.erreur).map((s) => element('p', 'vs-info ko', s.enPause ? t('{erreur} Mise de côté quelques minutes.', { erreur: s.erreur }) : s.erreur)));
    if (r.fini && typeof ouvrirEnvies === 'function' && !envie.firstChild) {
      const b = boutonSources('', 'lien-bouton', () => ouvrirEnvies({ ajouter: q }));
      b.textContent = t('+ Mettre « {q} » dans ma liste d’envies', { q });
      envie.append(b);
    }
    fondreSources();
  };
  try {
    await lireFluxSources(`/api/sources/recherche?flux=1&q=${encodeURIComponent(q)}${type ? `&type=${type}` : ''}`, ctrl.signal, montrer);
  } catch (e) {
    if (ctrl.signal.aborted) return;
    info.className = 'vs-info ko';
    info.textContent = e.message;
  }
}

// ---------- fiche d'un contenu : onglets « Site » et « Sources » ----------

// Appelé à l'ouverture d'une fiche (index.html). Sans source activée, la fiche reste comme avant.
function ongletsFiche(g) {
  if (!g.zoneSite) {
    g.barreOnglets = element('div', 'saisons fiche-onglets');
    g.barreOnglets.setAttribute('role', 'tablist');
    g.barreOnglets.setAttribute('aria-label', t('Où chercher'));
    g.zoneSite = element('div', 'zone-site');
    g.zoneSite.append(g.zoneVersions, g.zoneSources);
    g.zoneTorrents = element('div', 'zone-torrents');
    g.panneau.replaceChildren(g.barreOnglets, g.zoneSite, g.zoneTorrents);
  }
  const duSite = g.versions.some((v) => !v.deSource);
  if (!nombreSources()) {
    g.barreOnglets.hidden = true;
    g.zoneTorrents.hidden = true;
    g.zoneSite.hidden = false;
    return;
  }
  if (!duSite) g.ongletFiche = 'sources';
  else g.ongletFiche ||= g.ko ? 'sources' : 'site';
  g.barreOnglets.hidden = false;
  const onglet = (cle, texte, detail) => {
    const b = element('button', 'saison', texte);
    b.type = 'button';
    b.setAttribute('role', 'tab');
    b.dataset.onglet = cle;
    b.setAttribute('aria-selected', String(g.ongletFiche === cle));
    if (detail) b.append(element('span', 'saison-n', detail));
    b.addEventListener('click', () => {
      g.ongletFiche = cle;
      ongletsFiche(g);
      g.barreOnglets.querySelector(`[data-onglet="${cle}"]`)?.focus({ preventScroll: true });
    });
    return b;
  };
  const nbSite = g.versions.filter((v) => !v.deSource).length;
  const nbSources = g.sources?.length || 0;
  const boutons = [];
  if (duSite) boutons.push(onglet('site', hoteSource(dernier.config?.siteRecherche || '') || t('Le site'), t(nbSite > 1 ? '{n} fiches' : '{n} fiche', { n: nbSite })));
  boutons.push(onglet('sources', t('Tes sources'), g.sourcesCherchees ? t(nbSources > 1 ? '{n} versions' : '{n} version', { n: nbSources }) : nbSources ? t(nbSources > 1 ? '{n} versions' : '{n} version', { n: nbSources }) : t('à chercher')));
  g.barreOnglets.replaceChildren(...boutons);
  const sources = g.ongletFiche === 'sources';
  g.zoneSite.hidden = sources;
  g.zoneTorrents.hidden = !sources;
  if (sources) rendreOngletSources(g);
}

// L'onglet « Sources » : ce qu'on sait déjà de ce contenu, puis une recherche faite exprès pour lui.
function rendreOngletSources(g) {
  const zone = g.zoneTorrents;
  const dessiner = () => {
    const versions = g.sources || [];
    const choisie = document.activeElement?.closest?.('.zone-torrents .vs-ligne')?.dataset.id;
    const bonnes = versions.filter((v) => v.convient);
    const autres = versions.filter((v) => !v.convient);
    const profil = profilEnMots();
    const morceaux = [];
    const etat = g.rechercheSources;
    const resume = element('p', 'aide');
    if (etat?.enCours) resume.textContent = versions.length ? t('{n} versions déjà trouvées · recherche de ce titre sur tes sources…', { n: versions.length }) : t('Recherche de ce titre sur tes sources…');
    else if (!versions.length) resume.textContent = t('Tes sources n’ont pas ce titre pour l’instant. Tu peux le mettre dans ta liste d’envies : Ondi le téléchargera dès qu’une version convient.');
    else resume.textContent = bonnes.length
      ? t(bonnes.length > 1 ? '{n} versions conviennent à ton profil ({profil}), la mieux notée en premier. Deux appuis sur une version pour l’envoyer à AllDebrid.' : '{n} version convient à ton profil ({profil}). Deux appuis dessus pour l’envoyer à AllDebrid.', { n: bonnes.length, profil })
      : t('Aucune version ne convient à ton profil ({profil}). Tu peux en envoyer une quand même, ou mettre ce titre dans ta liste d’envies.', { profil });
    morceaux.push(resume);
    for (const erreur of etat?.pannes || []) morceaux.push(element('p', 'vs-info ko', erreur));
    const liste = (vs) => {
      const l = element('div', 'vs-liste');
      l.append(...vs.map(ligneVersion));
      return l;
    };
    if (g.serie) {
      // Par saison : les saisons entières d'abord, puis les épisodes dans l'ordre.
      const parSaison = new Map();
      for (const v of bonnes) {
        const k = v.saison ?? 0;
        if (!parSaison.has(k)) parSaison.set(k, []);
        parSaison.get(k).push(v);
      }
      for (const [saison, vs] of [...parSaison].sort((a, b) => a[0] - b[0])) {
        vs.sort((a, b) => (a.episode ?? -1) - (b.episode ?? -1) || b.note - a.note);
        morceaux.push(element('div', 'v-sous-titre', saison ? t('Saison {n}', { n: saison }) : t('Intégrale')), liste(vs.slice(0, 80)));
      }
    } else if (bonnes.length) morceaux.push(liste(bonnes.slice(0, 60)));
    if (autres.length) {
      if (g.autresMontrees) morceaux.push(element('div', 'v-sous-titre', t('Ne conviennent pas à ton profil')), liste(autres.slice(0, 100)));
      else {
        const voir = boutonSources('', 'lien-bouton', () => {
          g.autresMontrees = true;
          dessiner();
          zone.querySelector('.vs-ligne.refusee .vs-bouton')?.focus();
        });
        voir.textContent = t(autres.length > 1 ? 'Voir les {n} versions qui ne conviennent pas' : 'Voir la version qui ne convient pas', { n: autres.length });
        morceaux.push(voir);
      }
    }
    const pied = element('div', 'r-pied');
    if (typeof ouvrirEnvies === 'function') pied.append(boutonSources('+ Liste d’envies', 'bouton', () => ouvrirEnvies({ ajouter: sansAnnee(g.versions[0].titre) })));
    if (!etat?.enCours) pied.append(boutonSources('Chercher encore', 'bouton', () => chercherContenuSources(g, dessiner, true)));
    morceaux.push(pied);
    zone.replaceChildren(...morceaux);
    if (choisie) [...zone.querySelectorAll('.vs-ligne')].find((l) => l.dataset.id === choisie)?.querySelector('.vs-bouton, .dl-regarder')?.focus({ preventScroll: true });
  };
  dessiner();
  chercherContenuSources(g, dessiner, false);
}

// Recherche de ce contenu précis sur les sources (au plus une fois toutes les cinq minutes, sauf demande).
async function chercherContenuSources(g, dessiner, forcer) {
  const etat = (g.rechercheSources ||= { t: 0, enCours: false, pannes: [] });
  if (etat.enCours || (!forcer && Date.now() - etat.t < 5 * 60_000)) return;
  etat.enCours = true;
  dessiner();
  try {
    const titre = sansAnnee(g.versions[0].titre);
    const r = await api(`/api/sources/contenu?titre=${encodeURIComponent(titre)}${g.annee && !g.serie ? `&annee=${g.annee}` : ''}&type=${g.serie ? 'serie' : 'film'}`);
    const parId = new Map((g.sources || []).map((v) => [v.id, v]));
    for (const v of r.versions) parId.set(v.id, v);
    g.sources = [...parId.values()].sort((a, b) => b.convient - a.convient || b.note - a.note || (b.sources ?? -1) - (a.sources ?? -1));
    etat.pannes = r.sources.filter((s) => s.erreur).map((s) => s.erreur);
    etat.t = Date.now();
    g.sourcesCherchees = true;
  } catch (e) {
    etat.pannes = [e.message];
  }
  etat.enCours = false;
  if (!g.panneau.isConnected) return;
  // Le nombre de versions de l'onglet, sans toucher à la sélection.
  const compte = g.barreOnglets?.querySelector('[data-onglet="sources"] .saison-n');
  if (compte) compte.textContent = t((g.sources?.length || 0) > 1 ? '{n} versions' : '{n} version', { n: g.sources?.length || 0 });
  if (g.ongletFiche === 'sources') dessiner();
}

// ---------- accueil : les dernières sorties des sources ----------

const nouveautesSources = new Map(); // type → { t, promesse }
function chargerNouveautesSources(type) {
  const garde = nouveautesSources.get(type);
  if (garde && Date.now() - garde.t < 10 * 60_000) return garde.promesse;
  const promesse = api(`/api/sources/nouveautes?type=${type}`);
  nouveautesSources.set(type, { t: Date.now(), promesse });
  promesse.catch(() => nouveautesSources.delete(type));
  return promesse;
}

// Les rangées « Nouveautés sur tes sources » de l'accueil : seulement ce qui existe dans une version qui convient.
// Prêtes tout de suite si la réponse est déjà là ; sinon elles sont posées sur l'accueil dès qu'elle arrive.
async function rangeesSources(rubrique) {
  if (!nombreSources() || /manga|anim/i.test(rubrique || '')) return [];
  const types = /film/i.test(rubrique || '') ? ['film'] : /serie/i.test(rubrique || '') ? ['serie'] : ['film', 'serie'];
  const construire = (r, type) => {
    const parId = new Map(r.versions.map((v) => [v.id, v]));
    const cartes = [];
    for (const c of r.contenus) {
      if (c.type !== type || !c.conviennent || cartes.length >= 30) continue;
      const { g } = poserSources(c, c.versions.map((id) => parId.get(id)).filter(Boolean));
      if (g) cartes.push(carteContenu(g));
    }
    if (!cartes.length) return null;
    const ligne = rangee(t(type === 'film' ? 'Nouveautés sur tes sources · Films' : 'Nouveautés sur tes sources · Séries'), cartes, { info: profilEnMots() });
    ligne.classList.add('rangee-perso', 'rangee-sources');
    return ligne;
  };
  const tout = Promise.all(types.map((type) => chargerNouveautesSources(type).then((r) => construire(r, type), () => null))).then((lignes) => {
    const pretes = lignes.filter(Boolean);
    if (pretes.length) rangeesSourcesPretes = { rubrique: rubrique || '', lignes: pretes };
    return pretes;
  });
  const vite = await Promise.race([tout, new Promise((ok) => setTimeout(() => ok(null), 700))]);
  if (vite) return vite;
  return [];
}

// Les rangées des sources prêtes pour l'accueil affiché : si elles n'y sont pas (réponse arrivée après la
// construction de l'accueil, accueil refait entre-temps, retour d'un autre écran), elles sont posées après
// les rangées personnelles.
let rangeesSourcesPretes = null; // { rubrique, lignes }
setInterval(() => {
  const pretes = rangeesSourcesPretes;
  const conteneur = $('#rangees');
  if (!pretes || !conteneur || typeof vueActive === 'undefined' || vueActive !== 'accueil' || (rubriqueAccueil ?? '') !== pretes.rubrique) return;
  if (conteneur.querySelector('.rangee-sources') || !conteneur.querySelector('.rangee:not(.attente)')) return;
  const derniere = [...conteneur.querySelectorAll('.rangee-perso')].pop();
  if (derniere) derniere.after(...pretes.lignes);
  else conteneur.prepend(...pretes.lignes);
}, 1500);

// ---------- une version : ce qu'elle est, si elle vaut le coup, l'envoi et son suivi ----------

function ligneVersion(v) {
  const ligne = element('div', `vs-ligne${v.convient ? '' : ' refusee'}`);
  ligne.dataset.id = v.id;
  ligne._version = v;
  const b = element('button', 'vs-bouton');
  b.type = 'button';
  const etiquettes = element('span', 'vs-etiquettes');
  const etiquette = (texte, classe = '') => texte && etiquettes.append(element('span', `src-etiquette ${classe}`, texte));
  etiquette(DEFINITIONS_SOURCES[v.definition] || '', 'fort');
  for (const l of v.langues) etiquettes.append(element('span', `puce langue l-${FAMILLES_SOURCES[l] || 'vo'}`, l));
  if (!v.langues.length) etiquette(t('Langue non précisée'));
  etiquette(v.hdr.map((h) => ({ dv: 'Dolby Vision', 'hdr10+': 'HDR10+', hdr: 'HDR' })[h]).join(' · '));
  etiquette(ORIGINES_SOURCES[v.origine] || '');
  etiquette({ hevc: 'x265', avc: 'x264', av1: 'AV1', xvid: 'XviD' }[v.codec] || '');
  if (v.saison !== null) etiquette(v.integrale ? t('Intégrale') : `S${String(v.saison).padStart(2, '0')}${v.episode !== null ? `E${String(v.episode).padStart(2, '0')}` : ''}`);
  // Partageurs (ceux qui ont le fichier entier) et téléchargeurs : sans partageur, rien ne viendra.
  const sante = element('span', 'vs-sante');
  if (v.sources !== null) {
    sante.classList.add(v.sources >= 10 ? 'bonne' : v.sources > 0 ? 'moyenne' : 'nulle');
    sante.textContent = [
      v.sources ? t(v.sources > 1 ? '▲ {n} partageurs' : '▲ {n} partageur', { n: v.sources }) : t('▲ aucun partageur'),
      v.pairs !== null ? t(v.pairs > 1 ? '▼ {n} téléchargeurs' : '▼ {n} téléchargeur', { n: v.pairs }) : '',
    ].filter(Boolean).join(' · ');
  }
  const infos = element('span', 'vs-infos');
  infos.append([v.taille ? taille(v.taille) : '', [v.sourceNom, ...v.autres].join(', ')].filter(Boolean).join(' · '), ' ', sante);
  const repos = () => (v.convient ? t('Envoyer') : t(v.refus));
  const action = element('span', 'vs-action', repos());
  b.append(element('span', 'vs-nom', v.nom), action, etiquettes, infos);
  ligne.append(b);
  // Deux appuis : le premier demande confirmation, le second envoie (pas d'envoi par mégarde à la télécommande).
  let minuterie = null;
  b.addEventListener('click', async () => {
    if (v.job || ligne.classList.contains('occupee')) return;
    if (!ligne.classList.contains('armee')) {
      ligne.classList.remove('ratee');
      ligne.classList.add('armee');
      action.textContent = t('Appuie encore pour envoyer à AllDebrid');
      minuterie = setTimeout(() => {
        ligne.classList.remove('armee');
        action.textContent = repos();
      }, 6000);
      return;
    }
    clearTimeout(minuterie);
    ligne.classList.remove('armee');
    ligne.classList.add('occupee');
    action.textContent = t('Envoi…');
    try {
      const r = await api('/api/sources/envoyer', { method: 'POST', body: JSON.stringify({ id: v.id, mode: typeof mode === 'string' ? mode : 'auto' }) });
      if (!r.ajoutes?.length) throw new Error(t('Refusé par Ondi.'));
      v.job = r.ajoutes[0];
      if (typeof rafraichir === 'function') await rafraichir();
      majSuiviVersion(ligne);
    } catch (e) {
      ligne.classList.add('ratee');
      action.textContent = e.message;
    } finally {
      ligne.classList.remove('occupee');
    }
  });
  if (v.job) majSuiviVersion(ligne);
  return ligne;
}

// Suivi d'une version envoyée, sous sa ligne : d'abord AllDebrid qui récupère le fichier (tout de suite fini
// s'il l'a déjà), puis le téléchargement vers le PC, puis « Regarder » dès que c'est dans la bibliothèque.
function majSuiviVersion(ligne) {
  const v = ligne._version;
  const j = v?.job ? (dernier.jobs || []).find((x) => x.id === v.job) : null;
  let zone = ligne.querySelector('.vs-suivi');
  if (!j) {
    // Le téléchargement a été retiré de la liste : la ligne redevient envoyable.
    if (zone && v) v.job = null;
    zone?.remove();
    ligne.classList.remove('envoyee');
    return;
  }
  ligne.classList.add('envoyee');
  ligne.querySelector('.vs-action').textContent = t('Envoyé ✓');
  if (!zone) {
    zone = element('div', 'vs-suivi');
    const etape = (classe, nom) => {
      const e = element('span', `vs-etape ${classe}`);
      const barre = element('span', 'dl-barre');
      barre.append(element('span'));
      e.append(element('span', 'vs-etape-nom', nom), barre);
      return e;
    };
    zone.append(etape('ad', t('1 · Chez AllDebrid')), etape('pc', t('2 · Vers ton PC')), element('span', 'dl-ligne'));
    ligne.append(zone);
  }
  const rate = j.etat === 'erreur' || j.etat === 'annule';
  const passeAllDebrid = ['file', 'telechargement', 'termine'].includes(j.etat);
  const pctAd = passeAllDebrid ? 100 : j.torrent?.total ? Math.min(100, (j.torrent.fait / j.torrent.total) * 100) : null;
  const pctPc = j.etat === 'termine' ? 100 : j.etat === 'telechargement' && j.total ? Math.min(100, (j.fait / j.total) * 100) : 0;
  const video = j.fichiers.find((f) => !f.sousTitre && f.lecture) || null;
  const cle = [j.id, j.etat, Math.floor(pctAd ?? -1), Math.floor(pctPc), j.vitesse ? Math.round(j.vitesse / 1e5) : 0, j.torrent?.vitesse ? Math.round(j.torrent.vitesse / 1e5) : 0, video?.lecture?.versionId || '', j.message].join('|');
  if (zone.dataset.cle === cle) return;
  zone.dataset.cle = cle;
  zone.dataset.etat = j.etat;
  const barre = (classe, pct, vague) => {
    const b = zone.querySelector(`.vs-etape.${classe} .dl-barre`);
    b.classList.toggle('indeterminee', vague);
    b.querySelector('span').style.width = `${pct ?? 0}%`;
    zone.querySelector(`.vs-etape.${classe}`).classList.toggle('finie', pct === 100);
  };
  barre('ad', pctAd, pctAd == null && !rate);
  barre('pc', pctPc, false);
  const ligneTexte = zone.querySelector('.dl-ligne');
  const dire = (texte, classe = '') => ligneTexte.replaceChildren(element('span', `dl-texte ${classe}`, texte));
  if (rate) dire(j.message || t(LIBELLES[j.etat]), 'ko');
  else if (j.etat === 'torrent') {
    dire([
      t('AllDebrid récupère le fichier'),
      pctAd != null ? `${Math.floor(pctAd)} %` : j.message,
      j.torrent?.vitesse ? `${taille(j.torrent.vitesse)}/s` : '',
      j.torrent?.sources != null ? t(j.torrent.sources > 1 ? '{n} partageurs' : '{n} partageur', { n: j.torrent.sources }) : '',
    ].filter(Boolean).join(' · '));
  } else if (j.etat === 'file') dire(t('Prêt chez AllDebrid · attend son tour pour descendre sur ton PC'));
  else if (j.etat === 'telechargement') dire([t('Téléchargement {p} %', { p: Math.floor(pctPc) }), j.vitesse ? `${taille(j.vitesse)}/s` : '', j.reste ? t('reste {d}', { d: duree(j.reste) }) : ''].filter(Boolean).join(' · '));
  else if (j.etat === 'termine') {
    const texte = element('span', 'dl-texte ok', video ? t('Téléchargé ✓') : t('Téléchargé ✓ · ajout à la bibliothèque…'));
    if (!video) return void ligneTexte.replaceChildren(texte);
    const regarder = element('button', 'bouton principal petit dl-regarder');
    regarder.type = 'button';
    regarder.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.5-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5Z"/></svg>';
    regarder.append(t('Regarder'));
    regarder.addEventListener('click', () => lireDepuisFiche(video.lecture.cle, video.lecture.cleLecture, { depuis: regarder, versionId: video.lecture.versionId }));
    const avaitFocus = ligne.contains(document.activeElement);
    ligneTexte.replaceChildren(texte, regarder);
    if (avaitFocus) regarder.focus();
  } else dire(t('Envoi à AllDebrid…'));
}
// Appelé à chaque nouvel état des téléchargements (index.html).
const majSuivisVersions = () => document.querySelectorAll('.vs-ligne').forEach((l) => l._version?.job && majSuiviVersion(l));

document.addEventListener('DOMContentLoaded', () => {
  $('#btnSources')?.addEventListener('click', ouvrirSources);
  // Affiche introuvable (titre inconnu de TMDB) : pas d'image cassée dans l'en-tête de la fiche.
  $('#detailAffiche')?.addEventListener('error', () => ($('#detailAffiche').hidden = true));
});
