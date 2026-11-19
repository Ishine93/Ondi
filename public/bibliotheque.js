// Bibliothèque (onglet « Bibliothèque ») : tes films et séries rangés sur le PC, avec les infos TMDB,
// la rangée « Reprendre la lecture » de l'accueil et la fiche plein écran (versions, pistes, casting, épisodes).
/* global t, element, api, $, LANGUE, cadreAffiche, rangee, rangeeAttente, jetonProfil, profilActif, ouvrirLecteur, vueActive, rubriqueAccueil, afficherVue, modeClavier */
let catalogueBiblio = null;
let historiqueBiblio = {};
let filtreBiblio = 'tout';
let triBiblio = 'recent';

const ICONE_LECTURE = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.5-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5Z"/></svg>';
const ICONE_FERMER = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';
const ICONE_VU = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 5 5L20 7"/></svg>';

// ---------- formats ----------

function dureeMinutes(min) {
  if (!min) return '';
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h ? (m ? t('{h} h {m} min', { h, m }) : t('{h} h', { h })) : t('{m} min', { m });
}
function horloge(s) {
  s = Math.max(0, Math.floor(s || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const x = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${x}` : `${m}:${x}`;
}
const resteTexte = (pos, duree) => t('Reste {temps}', { temps: dureeMinutes(Math.max(1, (duree - pos) / 60)) });
const pourcent = (h) => (h?.duree ? Math.min(100, Math.max(2, (h.position / h.duree) * 100)) : 0);
function barreLecture(p) {
  const b = element('span', 'barre-lecture');
  const s = element('span');
  s.style.width = `${p}%`;
  b.append(s);
  return b;
}
const AGES = { TP: 'Tous publics', U: 'Tous publics' };

// ---------- données ----------

async function chargerCatalogue() {
  catalogueBiblio = await api(`/api/bibliotheque?langue=${LANGUE}`);
  return catalogueBiblio;
}
async function chargerHistorique() {
  if (!jetonProfil) return (historiqueBiblio = {});
  try {
    historiqueBiblio = (await api('/api/historique')).historique || {};
  } catch {
    historiqueBiblio = {};
  }
  return historiqueBiblio;
}
const reprendreListe = () => (jetonProfil ? api(`/api/reprendre?langue=${LANGUE}`).then((r) => r.elements || []).catch(() => []) : Promise.resolve([]));

function sousTitreItem(item) {
  if (item.type === 'serie') return [item.nbSaisons > 1 ? t('{n} saisons', { n: item.nbSaisons }) : t('{n} épisodes', { n: item.nbEpisodes }), item.annee].filter(Boolean).join(' · ');
  return [item.annee, dureeMinutes(item.duree)].filter(Boolean).join(' · ');
}

// ---------- cartes ----------

function carteBiblio(item) {
  const b = element('button', 'affiche');
  b.type = 'button';
  b.setAttribute('aria-haspopup', 'dialog');
  const cadre = cadreAffiche(item.affiche, item.titre);
  if (item.type === 'film') {
    const h = historiqueBiblio[item.cle];
    if (h?.vu) cadre.append(element('span', 'affiche-vu', '✓'));
    else if (h?.position) cadre.append(barreLecture(pourcent(h)));
  } else {
    const prefixe = `e:${item.cle.slice(2)}:`;
    const eps = Object.entries(historiqueBiblio).filter(([k]) => k.startsWith(prefixe));
    if (eps.length && eps.filter(([, h]) => h.vu).length >= item.nbEpisodes) cadre.append(element('span', 'affiche-vu', '✓'));
  }
  const infos = element('span', 'affiche-infos');
  infos.append(element('span', 'affiche-titre', item.titre), element('span', 'affiche-sous', sousTitreItem(item)));
  b.append(cadre, infos);
  b.setAttribute('aria-label', `${item.titre}, ${sousTitreItem(item)}`);
  b.addEventListener('click', () => ouvrirFicheMedia(item.cle, b));
  return b;
}

function vignetteReprendre(e) {
  const b = element('button', 'vignette');
  b.type = 'button';
  const image = element('span', 'vignette-image');
  if (e.image) {
    const img = new Image();
    img.alt = '';
    img.loading = 'lazy';
    img.referrerPolicy = 'no-referrer';
    img.src = e.image;
    image.append(img);
  }
  if (e.aSuivre) image.append(element('span', 'vignette-etiquette', t('Épisode suivant')));
  if (e.position && e.duree) image.append(barreLecture(pourcent(e)));
  const jouer = element('span', 'vignette-jouer');
  jouer.innerHTML = ICONE_LECTURE;
  image.append(jouer);
  b.append(image, element('span', 'vignette-titre', e.titre), element('span', 'vignette-sous', e.sousTitre || ''));
  if (e.position && e.duree) b.append(element('span', 'vignette-reste', resteTexte(e.position, e.duree)));
  b.setAttribute('aria-label', [e.titre, e.sousTitre, e.position ? resteTexte(e.position, e.duree) : ''].filter(Boolean).join(', '));
  b.addEventListener('click', () => lireDepuisFiche(e.cle, e.cleLecture, { depuis: b }));
  return b;
}

// ---------- rangées de l'accueil ----------

// Rangées propres au profil, en haut de l'accueil : « Reprendre la lecture » et ta bibliothèque.
async function rangeesPerso(rubrique) {
  const lignes = [];
  try {
    const [cat, reprise] = await Promise.all([chargerCatalogue(), reprendreListe(), chargerHistorique()]);
    const type = /film/i.test(rubrique || '') ? 'films' : /serie/i.test(rubrique || '') ? 'series' : /manga|anim/i.test(rubrique || '') ? 'mangas' : '';
    if (!rubrique && reprise.length) lignes.push(rangee(t('Reprendre la lecture'), reprise.map(vignetteReprendre), { info: profilActif ? profilActif.nom : '' }));
    if (!rubrique) {
      const recents = [...cat.films, ...cat.series].sort((a, b) => b.ajoute - a.ajoute).slice(0, 24);
      if (recents.length) lignes.push(rangee(t('Dans ta bibliothèque'), recents.map(carteBiblio), { info: t('Ajoutés récemment') }));
    } else if (type === 'films' && cat.films.length) lignes.push(rangee(t('Tes films'), cat.films.map(carteBiblio), { info: t('Dans ta bibliothèque') }));
    else if (type === 'series' && cat.series.length) lignes.push(rangee(t('Tes séries'), cat.series.map(carteBiblio), { info: t('Dans ta bibliothèque') }));
  } catch {}
  for (const l of lignes) l.classList.add('rangee-perso');
  return lignes;
}

async function majRangeesPerso() {
  if (vueActive === 'bibliotheque') return construireBibliotheque();
  const conteneur = $('#rangees');
  if (!conteneur) return;
  const lignes = await rangeesPerso(rubriqueAccueil ?? '');
  conteneur.querySelectorAll('.rangee-perso').forEach((x) => x.remove());
  conteneur.prepend(...lignes);
}

// ---------- onglet Bibliothèque ----------

function heroBiblio(item, reprise) {
  const s = element('section', 'hero avec-fond');
  const fond = element('div', 'hero-fond');
  fond.style.backgroundImage = `url("${(item.fond || item.affiche || '').replace(/"/g, '%22')}")`;
  const contenu = element('div', 'hero-contenu');
  contenu.append(element('p', 'hero-sur-titre', reprise ? t('Reprendre la lecture') : t('Dans ta bibliothèque')));
  if (item.logo) {
    const logo = new Image();
    logo.className = 'fm-logo';
    logo.alt = item.titre;
    logo.src = item.logo;
    contenu.append(logo);
  } else contenu.append(element('h1', `hero-titre${item.titre.length > 30 ? ' long' : ''}`, item.titre));
  contenu.append(element('p', 'hero-meta', [item.annee, item.genres.slice(0, 2).join(', '), item.type === 'film' ? dureeMinutes(item.duree) : item.nbSaisons > 1 ? t('{n} saisons', { n: item.nbSaisons }) : t('{n} épisodes', { n: item.nbEpisodes })].filter(Boolean).join('  ·  ')));
  if (item.resume) contenu.append(element('p', 'hero-resume', item.resume));
  const actions = element('div', 'hero-actions');
  const lecture = element('button', 'bouton principal grand');
  lecture.type = 'button';
  lecture.innerHTML = ICONE_LECTURE;
  lecture.append(reprise?.position ? t('Reprendre') : t('Lecture'));
  lecture.addEventListener('click', () => (reprise ? lireDepuisFiche(reprise.cle, reprise.cleLecture, { depuis: lecture }) : lireDepuisFiche(item.cle, null, { depuis: lecture })));
  const infos = element('button', 'bouton grand verre', t('Plus d\'infos'));
  infos.type = 'button';
  infos.addEventListener('click', () => ouvrirFicheMedia(item.cle, infos));
  actions.append(lecture, infos);
  contenu.append(actions);
  s.append(fond, contenu);
  return s;
}

let constructionBiblio = null;
async function construireBibliotheque() {
  const vue = $('#vueBibliotheque');
  const jeton = (constructionBiblio = Symbol('biblio'));
  if (!vue.children.length) vue.replaceChildren(rangeeAttente(), rangeeAttente());
  let cat;
  let reprise;
  try {
    [cat, reprise] = await Promise.all([chargerCatalogue(), reprendreListe(), chargerHistorique()]);
  } catch (e) {
    vue.replaceChildren(element('p', 'biblio-vide', e.message));
    return;
  }
  if (jeton !== constructionBiblio) return;
  const tout = [...cat.films, ...cat.series];
  const morceaux = [];

  // À la une : ce que tu regardes, sinon un titre récent avec une belle image de fond.
  const enCours = reprise.find((r) => r.position);
  const vedette = (enCours && tout.find((x) => x.cle === enCours.cle)) || tout.filter((x) => x.fond).sort((a, b) => b.ajoute - a.ajoute)[0];
  if (vedette && filtreBiblio === 'tout') morceaux.push(heroBiblio(vedette, enCours && enCours.cle === vedette.cle ? enCours : null));

  // Barre : Tout / Films / Séries, tri, actualiser.
  const tete = element('div', 'biblio-tete');
  const segments = element('div', 'segments');
  segments.setAttribute('role', 'radiogroup');
  for (const [v, texte] of [['tout', t('Tout')], ['films', t('Films')], ['series', t('Séries')]]) {
    const b = element('button', '', texte);
    b.type = 'button';
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(filtreBiblio === v));
    b.addEventListener('click', () => {
      filtreBiblio = v;
      construireBibliotheque().then(() => $('#vueBibliotheque .biblio-tete [aria-checked="true"]')?.focus({ preventScroll: true }));
    });
    segments.append(b);
  }
  tete.append(segments);
  if (filtreBiblio !== 'tout') {
    const tri = element('select');
    tri.setAttribute('aria-label', t('Trier'));
    for (const [v, texte] of [['recent', t('Ajoutés récemment')], ['titre', t('Titre (A → Z)')], ['annee', t('Année de sortie')], ['note', t('Mieux notés')]]) {
      const o = element('option', '', texte);
      o.value = v;
      tri.append(o);
    }
    tri.value = triBiblio;
    tri.addEventListener('change', () => {
      triBiblio = tri.value;
      construireBibliotheque();
    });
    tete.append(tri);
  }
  tete.append(element('span', 'espace'));
  const etat = element('span', 'biblio-etat', cat.scan.enCours ? t('Lecture des dossiers…') : `${t(cat.films.length > 1 ? '{n} films' : '{n} film', { n: cat.films.length })} · ${t(cat.series.length > 1 ? '{m} séries' : '{m} série', { m: cat.series.length })}`);
  const actualiser = element('button', 'bouton', t('Actualiser'));
  actualiser.type = 'button';
  actualiser.title = t('Relit les dossiers Films et Séries');
  actualiser.addEventListener('click', async () => {
    actualiser.disabled = true;
    etat.textContent = t('Lecture des dossiers…');
    await api('/api/bibliotheque/scanner', { method: 'POST', body: '{}' }).catch(() => {});
    setTimeout(() => construireBibliotheque(), 2500);
  });
  tete.append(etat, actualiser);
  morceaux.push(tete);

  if (!tout.length) {
    const vide = element('div', 'biblio-vide');
    vide.append(element('p', '', t('Ta bibliothèque est vide pour l\'instant : les films et séries téléchargés arrivent ici tout seuls.')));
    morceaux.push(vide);
  } else if (filtreBiblio === 'tout') {
    const rangees = element('div', 'rangees');
    if (reprise.length) rangees.append(rangee(t('Reprendre la lecture'), reprise.map(vignetteReprendre)));
    const recents = [...tout].sort((a, b) => b.ajoute - a.ajoute).slice(0, 24);
    rangees.append(rangee(t('Ajoutés récemment'), recents.map(carteBiblio)));
    if (cat.films.length) rangees.append(rangee(t('Films'), cat.films.map(carteBiblio), { info: String(cat.films.length) }));
    if (cat.series.length) rangees.append(rangee(t('Séries'), cat.series.map(carteBiblio), { info: String(cat.series.length) }));
    // Genres (au moins deux titres).
    const parGenre = new Map();
    for (const x of tout) for (const g of x.genres) parGenre.set(g, [...(parGenre.get(g) || []), x]);
    [...parGenre.entries()]
      .filter(([, l]) => l.length >= 2)
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, 8)
      .forEach(([g, l]) => rangees.append(rangee(g, l.map(carteBiblio))));
    const nonVus = cat.films.filter((x) => !historiqueBiblio[x.cle]?.vu);
    if (jetonProfil && nonVus.length && nonVus.length < cat.films.length) rangees.append(rangee(t('Pas encore vus'), nonVus.map(carteBiblio)));
    morceaux.push(rangees);
  } else {
    const liste = [...(filtreBiblio === 'films' ? cat.films : cat.series)];
    const comparer = {
      recent: (a, b) => b.ajoute - a.ajoute,
      titre: (a, b) => a.titre.localeCompare(b.titre, 'fr', { sensitivity: 'base' }),
      annee: (a, b) => (b.annee || 0) - (a.annee || 0),
      note: (a, b) => (b.note || 0) - (a.note || 0),
    }[triBiblio];
    const grille = element('div', 'biblio-grille');
    grille.append(...liste.sort(comparer).map(carteBiblio));
    morceaux.push(grille);
  }
  if (!cat.tmdb) {
    const aide = element('p', 'biblio-vide');
    aide.textContent = t('Ajoute ta clé TMDB dans les Réglages pour avoir les affiches, résumés et casting.');
    morceaux.push(aide);
  }
  vue.replaceChildren(...morceaux);
  if (cat.scan.enCours) setTimeout(() => vueActive === 'bibliotheque' && construireBibliotheque(), 4000);
  if (document.body.classList.contains('grand') && (!document.activeElement || document.activeElement === document.body)) vue.querySelector('.hero .principal, .affiche, .vignette')?.focus({ preventScroll: true });
}

// ---------- fiche plein écran ----------

let ficheMedia = null; // { cle, f, depuis, version, saison }
let ignorerRetourFiche = false;

function elementFiche() {
  let el = $('#ficheMedia');
  if (!el) {
    el = element('div', 'fiche-media modal-plein');
    el.id = 'ficheMedia';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.hidden = true;
    document.body.append(el);
  }
  return el;
}

async function ouvrirFicheMedia(cle, depuis = document.activeElement) {
  const el = elementFiche();
  const dejaOuverte = !!ficheMedia;
  ficheMedia = { cle, f: null, depuis, version: null, saison: null };
  el.hidden = false;
  document.body.classList.add('fiche-ouverte');
  if (!dejaOuverte) history.pushState({ debrideur: 'fiche' }, '');
  el.replaceChildren(element('div', 'lc-attente'));
  try {
    const [f] = await Promise.all([api(`/api/bibliotheque/element?cle=${encodeURIComponent(cle)}&langue=${LANGUE}`), chargerHistorique()]);
    if (ficheMedia?.cle !== cle) return;
    ficheMedia.f = f;
    rendreFiche({ focus: true });
  } catch (e) {
    el.replaceChildren(element('p', 'biblio-vide', e.message));
  }
}

function fermerFicheMedia({ historique = true } = {}) {
  if (!ficheMedia) return;
  const { depuis } = ficheMedia;
  ficheMedia = null;
  elementFiche().hidden = true;
  elementFiche().replaceChildren();
  document.body.classList.remove('fiche-ouverte');
  if (historique && history.state?.debrideur === 'fiche') {
    ignorerRetourFiche = true;
    history.back();
  }
  if (depuis?.isConnected) depuis.focus({ preventScroll: true });
  majRangeesPerso();
}

// Prochain épisode à regarder : celui en cours, sinon le premier non vu après le dernier vu.
function episodeAProposer(f) {
  const eps = f.saisons.flatMap((s) => s.episodes.map((e) => ({ ...e, saison: s.numero })));
  const h = f.historique || {};
  const enCours = eps.filter((e) => h[e.cleLecture]?.position && !h[e.cleLecture]?.vu).sort((a, b) => h[b.cleLecture].maj - h[a.cleLecture].maj)[0];
  if (enCours) return enCours;
  let dernierVu = -1;
  eps.forEach((e, i) => h[e.cleLecture]?.vu && (dernierVu = i));
  return eps[dernierVu + 1] || eps[0];
}

function puce(texte, classe = '') {
  return element('span', `puce ${classe}`, texte);
}

function rendreFiche({ focus = false } = {}) {
  const el = elementFiche();
  const { f } = ficheMedia;
  const h = f.historique || {};
  const defil = element('div', 'fm-defilement');
  defil.tabIndex = -1;
  const fond = element('div', `fm-fond${f.fond ? '' : ' flou'}`);
  if (f.fond || f.affiche) fond.style.backgroundImage = `url("${(f.fond || f.affiche).replace(/"/g, '%22')}")`;
  const fermer = element('button', 'icone fm-fermer');
  fermer.type = 'button';
  fermer.title = t('Retour (Échap)');
  fermer.setAttribute('aria-label', t('Fermer la fiche'));
  fermer.innerHTML = ICONE_FERMER;
  fermer.addEventListener('click', () => fermerFicheMedia());

  // --- haut : titre, infos, résumé, boutons ---
  const haut = element('div', 'fm-haut');
  if (f.logo) {
    const logo = new Image();
    logo.className = 'fm-logo';
    logo.alt = f.titre;
    logo.src = f.logo;
    logo.addEventListener('error', () => logo.replaceWith(element('h1', 'fm-titre', f.titre)));
    haut.append(logo);
  } else haut.append(element('h1', 'fm-titre', f.titre));
  const meta = element('p', 'fm-meta');
  if (f.annee) meta.append(element('span', '', String(f.annee)));
  if (f.type === 'film' && f.duree) meta.append(element('span', '', dureeMinutes(f.duree)));
  if (f.type === 'serie') meta.append(element('span', '', f.saisons.length > 1 ? t('{n} saisons', { n: f.saisons.length }) : t('{n} épisodes', { n: f.saisons[0]?.episodes.length || 0 })));
  if (f.age) meta.append(element('span', 'age', t(AGES[f.age] || f.age)));
  if (f.note) meta.append(element('span', 'note', `★ ${f.note.toFixed(1)}`));
  if (f.genres?.length) meta.append(element('span', '', f.genres.join(', ')));
  haut.append(meta);
  if (f.slogan) haut.append(element('p', 'fm-slogan', f.slogan));
  if (f.resume) haut.append(element('p', 'fm-resume', f.resume));

  const actions = element('div', 'fm-actions');
  const bouton = (texte, classe, action, icone = '') => {
    const b = element('button', `bouton grand ${classe}`);
    b.type = 'button';
    if (icone) b.innerHTML = icone;
    b.append(texte);
    b.addEventListener('click', action);
    return b;
  };
  let progres = null;
  if (f.type === 'film') {
    const hf = h[f.cleLecture];
    const v = ficheMedia.version || f.versions[0]?.id;
    if (hf?.position && !hf.vu) {
      actions.append(bouton(t('Reprendre'), 'principal', () => lireFilm(f, v, hf.position), ICONE_LECTURE), bouton(t('Depuis le début'), 'verre', () => lireFilm(f, v, 0)));
      progres = element('div', 'fm-progres');
      progres.append(barreLecture(pourcent(hf)), element('span', '', resteTexte(hf.position, hf.duree)));
    } else actions.append(bouton(t('Lecture'), 'principal', () => lireFilm(f, v, 0), ICONE_LECTURE));
    actions.append(
      bouton(hf?.vu ? t('Vu') : t('Marquer comme vu'), 'verre', async () => {
        await api('/api/historique/vu', { method: 'POST', body: JSON.stringify({ cles: [f.cleLecture], vu: !hf?.vu }) });
        await rechargerFiche();
      }, ICONE_VU),
    );
  } else if (f.saisons.length) {
    const e = episodeAProposer(f);
    const he = h[e.cleLecture];
    const nomEp = t('S{s} É{e}', { s: e.saison, e: e.numero });
    actions.append(bouton(he?.position && !he.vu ? t('Reprendre {ep}', { ep: nomEp }) : t('Lecture {ep}', { ep: nomEp }), 'principal', () => lireEpisode(f, e.cleLecture, he?.vu ? 0 : he?.position || 0), ICONE_LECTURE));
    if (he?.position && !he.vu) {
      progres = element('div', 'fm-progres');
      progres.append(barreLecture(pourcent(he)), element('span', '', `${nomEp} · ${resteTexte(he.position, he.duree)}`));
    }
  }
  haut.append(actions);
  if (progres) haut.append(progres);

  // --- corps : épisodes, versions et pistes, casting ---
  const corps = element('div', 'fm-corps');
  if (f.type === 'serie') corps.append(sectionEpisodes(f));
  else corps.append(sectionTechnique(f));
  if (f.casting?.length) {
    const s = element('section', 'fm-section');
    s.append(element('h2', '', t('Distribution')));
    const liste = element('div', 'fm-casting');
    for (const c of f.casting) {
      const a = element('div', 'fm-acteur');
      if (c.photo) {
        const img = new Image();
        img.className = 'photo';
        img.alt = '';
        img.loading = 'lazy';
        img.src = c.photo;
        a.append(img);
      } else a.append(element('span', 'photo', (c.nom[0] || '?').toUpperCase()));
      a.append(element('b', '', c.nom), element('span', '', c.role));
      liste.append(a);
    }
    s.append(liste);
    corps.append(s);
  }
  const credits = [];
  if (f.realisateurs?.length) credits.push(`${f.type === 'film' ? t('Réalisation') : t('Création')} : ${f.realisateurs.join(', ')}`);
  if (f.titreOriginal && f.titreOriginal !== f.titre) credits.push(`${t('Titre original')} : ${f.titreOriginal}`);
  if (f.source === 'tmdb') credits.push(t('Infos : TMDB'));
  if (credits.length) corps.append(element('p', 'aide', credits.join(' · ')));

  defil.append(fond, fermer, haut, corps);
  const ancien = el.querySelector('.fm-defilement');
  const position = ancien?.scrollTop || 0;
  el.replaceChildren(defil);
  if (!focus) defil.scrollTop = position;
  else
    requestAnimationFrame(() => {
      if (!modeClavier && !document.body.classList.contains('grand')) defil.focus({ preventScroll: true });
      else actions.querySelector('.principal')?.focus({ preventScroll: true });
    });
}

function sectionTechnique(f) {
  const s = element('section', 'fm-section');
  s.append(element('h2', '', f.versions.length > 1 ? t('Versions') : t('Détails techniques')));
  const tech = element('div', 'fm-technique');
  const v = f.versions.find((x) => x.id === ficheMedia.version) || f.versions[0];
  if (f.versions.length > 1) {
    const liste = element('div', 'fm-versions');
    for (const x of f.versions) {
      const b = element('button', 'fm-version');
      b.type = 'button';
      b.setAttribute('aria-pressed', String(x.id === v.id));
      b.append(element('span', '', [x.resume, x.langue].filter(Boolean).join(' · ')), element('small', '', `${(x.taille / 1e9).toFixed(1)} ${t('Go')}`));
      b.addEventListener('click', () => {
        ficheMedia.version = x.id;
        rendreFiche();
      });
      liste.append(b);
    }
    tech.append(liste);
  }
  if (v) tech.append(...lignesPistes(v));
  s.append(tech);
  return s;
}

function lignesPistes(v) {
  const ligne = (titre, puces) => {
    const l = element('div', 'fm-ligne');
    l.append(element('b', '', titre), ...puces);
    return l;
  };
  const lignes = [];
  const video = [v.resume];
  if (v.video?.bits > 8) video.push(t('{n} bits', { n: v.video.bits }));
  if (v.video?.ips) video.push(`${v.video.ips} ${t('images/s')}`);
  lignes.push(ligne(t('Vidéo'), video.filter(Boolean).map((x) => puce(x))));
  if (v.audios.length) lignes.push(ligne(t('Audio'), v.audios.map((a) => puce(a.nom))));
  if (v.sousTitres.length) lignes.push(ligne(t('Sous-titres'), v.sousTitres.map((x) => puce(x.nom))));
  lignes.push(ligne(t('Fichier'), [puce(`${(v.taille / 1e9).toFixed(1)} ${t('Go')}`), puce(dureeMinutes(v.duree / 60)), puce(v.nom, 'fichier')]));
  return lignes;
}

function sectionEpisodes(f) {
  const s = element('section', 'fm-section');
  const h = f.historique || {};
  if (ficheMedia.saison == null || !f.saisons.some((x) => x.numero === ficheMedia.saison)) ficheMedia.saison = episodeAProposer(f)?.saison ?? f.saisons[0]?.numero;
  if (f.saisons.length > 1) {
    const onglets = element('div', 'saisons');
    onglets.setAttribute('role', 'tablist');
    for (const x of f.saisons) {
      const b = element('button', 'saison');
      b.type = 'button';
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', String(x.numero === ficheMedia.saison));
      b.append(x.nom, element('span', 'saison-n', t('{n} épisodes', { n: x.episodes.length })));
      b.addEventListener('click', () => {
        ficheMedia.saison = x.numero;
        rendreFiche();
        requestAnimationFrame(() => elementFiche().querySelector('.saison[aria-selected="true"]')?.focus({ preventScroll: true }));
      });
      onglets.append(b);
    }
    s.append(onglets);
  } else s.append(element('h2', '', f.saisons[0]?.nom || t('Épisodes')));
  const saison = f.saisons.find((x) => x.numero === ficheMedia.saison);
  const tete = element('div', 'fm-actions');
  const tousVus = saison.episodes.every((e) => h[e.cleLecture]?.vu);
  const marquer = element('button', 'bouton petit', tousVus ? t('Marquer la saison comme non vue') : t('Marquer la saison comme vue'));
  marquer.type = 'button';
  marquer.addEventListener('click', async () => {
    await api('/api/historique/vu', { method: 'POST', body: JSON.stringify({ cles: saison.episodes.map((e) => e.cleLecture), vu: !tousVus }) });
    await rechargerFiche();
  });
  tete.append(marquer);
  if (saison.nbEpisodesTotal && saison.nbEpisodesTotal > saison.episodes.length) tete.append(element('span', 'aide', t('{n} sur {m} épisodes téléchargés', { n: saison.episodes.length, m: saison.nbEpisodesTotal })));
  s.append(tete);
  const liste = element('div', 'fm-episodes');
  for (const e of saison.episodes) {
    const he = h[e.cleLecture];
    const b = element('button', 'fm-episode');
    b.type = 'button';
    const image = element('span', 'fm-ep-image');
    if (e.image) {
      const img = new Image();
      img.alt = '';
      img.loading = 'lazy';
      img.src = e.image;
      image.append(img);
    }
    if (he?.vu) image.append(element('span', 'affiche-vu', '✓'));
    else if (he?.position) image.append(barreLecture(pourcent(he)));
    const jouer = element('span', 'vignette-jouer');
    jouer.innerHTML = ICONE_LECTURE;
    image.append(jouer);
    const texte = element('span', 'fm-ep-texte');
    const titre = element('span', 'fm-ep-titre');
    titre.append(element('span', '', `${e.numero}. ${e.titre}`), element('span', 'duree', dureeMinutes(e.duree)));
    texte.append(titre);
    if (e.resume) texte.append(element('p', 'fm-ep-resume', e.resume));
    const bas = element('span', 'fm-ep-versions');
    for (const v of e.versions) bas.append(puce([v.resume, v.langue].filter(Boolean).join(' · ')));
    if (he?.vu) bas.append(element('span', 'fm-ep-vu', t('Vu')));
    else if (he?.position) bas.append(element('span', 'aide', resteTexte(he.position, he.duree)));
    texte.append(bas);
    b.append(image, texte);
    b.addEventListener('click', () => lireEpisode(f, e.cleLecture, he?.vu ? 0 : he?.position || 0));
    liste.append(b);
  }
  s.append(liste);
  return s;
}

async function rechargerFiche() {
  if (!ficheMedia) return;
  try {
    ficheMedia.f = await api(`/api/bibliotheque/element?cle=${encodeURIComponent(ficheMedia.cle)}&langue=${LANGUE}`);
    await chargerHistorique();
    rendreFiche();
  } catch {}
}

// ---------- lancer la lecture ----------

function lireFilm(f, versionId, position) {
  ouvrirLecteur({ fiche: f, cleLecture: f.cleLecture, versions: f.versions, versionId, position, titre: f.titre, sousTitre: [f.annee, dureeMinutes(f.duree)].filter(Boolean).join(' · ') });
}

function lireEpisode(f, cleLecture, position) {
  const eps = f.saisons.flatMap((s) => s.episodes.map((e) => ({ ...e, saison: s.numero })));
  const e = eps.find((x) => x.cleLecture === cleLecture);
  if (!e) return;
  ouvrirLecteur({
    fiche: f,
    cleLecture,
    versions: e.versions,
    versionId: e.versions[0]?.id,
    position,
    titre: f.titre,
    sousTitre: `${t('S{s} É{e}', { s: e.saison, e: e.numero })} · ${e.titre}`,
    suivant: () => {
      const i = eps.indexOf(e);
      return eps[i + 1] ? { ...eps[i + 1], image: eps[i + 1].image || f.fond } : null;
    },
    lireSuivant: (suivant) => lireEpisode(f, suivant.cleLecture, 0),
  });
}

// Depuis une vignette « Reprendre » ou l'affiche à la une : on lit la fiche puis on lance.
async function lireDepuisFiche(cle, cleLecture, { depuis, versionId } = {}) {
  try {
    const [f] = await Promise.all([api(`/api/bibliotheque/element?cle=${encodeURIComponent(cle)}&langue=${LANGUE}`), chargerHistorique()]);
    const h = f.historique || {};
    // Version précise demandée (le fichier qu'on vient de télécharger), sinon la meilleure.
    const version = f.type === 'film' && f.versions.some((v) => v.id === versionId) ? versionId : f.versions?.[0]?.id;
    if (f.type === 'film') return lireFilm(f, version, h[f.cleLecture]?.vu ? 0 : h[f.cleLecture]?.position || 0);
    const cible = cleLecture || episodeAProposer(f)?.cleLecture;
    lireEpisode(f, cible, h[cible]?.vu ? 0 : h[cible]?.position || 0);
  } catch (e) {
    depuis?.focus();
    const m = element('div', 'lc-message ko', e.message);
    m.style.position = 'fixed';
    document.body.append(m);
    setTimeout(() => m.remove(), 6000);
  }
}

// Retour (télécommande, Échap, navigateur) : true si la fiche était ouverte.
function retourBiblio({ depuisHistorique = false } = {}) {
  if (depuisHistorique && ignorerRetourFiche) {
    ignorerRetourFiche = false;
    return true;
  }
  if (!ficheMedia) return false;
  fermerFicheMedia({ historique: !depuisHistorique });
  return true;
}
