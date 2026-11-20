// Liste d'envies : les films et les saisons de séries qu'on veut. Ondi les cherche tout seul sur les sources
// de recherche, à intervalles réguliers, et télécharge la première version qui convient au profil voulu
// (le serveur fait le travail : src/envies.mjs). Ici : la fenêtre de la liste, l'ajout, et la rangée de l'accueil.
/* global $, element, api, t, taille, boutonSources, profilEnMots, ouvrirSources, rangee, cadreAffiche, LIBELLES, LANGUE */

let vueEnvies = 'liste';
let minuterieEnvies = null;

const sousTitreEnvie = (e) => [e.type === 'film' ? t('Film') : t('Série · saison {n}', { n: e.saison }), e.annee].filter(Boolean).join(' · ');

function ilYA(ms) {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 90) return t('à l’instant');
  if (s < 3600) return t('il y a {n} min', { n: Math.round(s / 60) });
  if (s < 86400) return t('il y a {n} h', { n: Math.round(s / 3600) });
  return t('il y a {n} j', { n: Math.round(s / 86400) });
}
function dansCombien(ms) {
  const s = Math.round((ms - Date.now()) / 1000);
  if (s <= 90) return t('dans un instant');
  if (s < 3600) return t('dans {n} min', { n: Math.round(s / 60) });
  return t('dans {n} h', { n: Math.round(s / 3600) });
}

// L'état d'une envie en quelques mots, et sa couleur.
function etatEnvie(e) {
  if (e.etat === 'terminee') return { classe: 'libre', texte: t('Arrivé dans ta bibliothèque') };
  if (e.etat === 'envoyee') return { classe: 'fort', texte: t('Trouvé · {etat}', { etat: t(LIBELLES[e.telechargement] || 'Téléchargement') }) };
  if (e.enRecherche) return { classe: '', texte: t('Recherche en cours…') };
  return { classe: 'prive', texte: t('En attente d’une version') };
}

// ---------- fenêtre ----------

function fenetreEnvies() {
  let d = $('#dlgEnvies');
  if (d) return d;
  d = element('dialog');
  d.id = 'dlgEnvies';
  const form = element('form');
  form.method = 'dialog';
  const tete = element('div', 'dlg-tete');
  tete.append(element('h2'));
  form.append(tete, element('div', 'dlg-corps'), element('div', 'dlg-pied'));
  d.append(form);
  document.body.append(d);
  // Retour (télécommande, Échap) : d'abord revenir à la liste, puis fermer.
  const remonter = (e) => {
    if (vueEnvies === 'liste') return;
    e.preventDefault();
    afficherListeEnvies();
  };
  d.addEventListener('cancel', remonter);
  d.addEventListener('keydown', (e) => e.key === 'Escape' && !document.querySelector('.choix-option') && remonter(e));
  d.addEventListener('close', () => {
    clearTimeout(minuterieEnvies);
    if (typeof majRangeesPerso === 'function') majRangeesPerso();
    if (d.dataset.reglages === 'oui' && typeof ouvrirReglages === 'function') ouvrirReglages('#btnEnvies');
  });
  return d;
}

function peindreEnvies(titre, corps, boutons, message = '', classe = 'ok') {
  const d = fenetreEnvies();
  clearTimeout(minuterieEnvies);
  d.querySelector('h2').textContent = titre;
  d.querySelector('.dlg-corps').replaceChildren(...corps);
  const msg = element('span', message ? `msg ${classe}` : 'msg', message);
  d.querySelector('.dlg-pied').replaceChildren(msg, ...boutons);
  d.querySelector('.dlg-corps').scrollTop = 0;
  return msg;
}

// ajouter : un titre à chercher tout de suite ; detail : l'identifiant d'une envie à montrer.
async function ouvrirEnvies({ ajouter = '', detail = '' } = {}) {
  const d = fenetreEnvies();
  const reglages = $('#reglages');
  d.dataset.reglages = reglages?.open ? 'oui' : 'non';
  if (reglages?.open) reglages.close();
  if (!d.open) d.showModal();
  if (ajouter) return afficherAjoutEnvie(ajouter);
  if (detail) {
    try {
      const e = (await api('/api/envies')).envies.find((x) => x.id === detail);
      if (e) return afficherDetailEnvie(e);
    } catch {}
  }
  return afficherListeEnvies();
}

function miniAffiche(url) {
  const cadre = element('span', 'env-affiche');
  if (url) {
    const img = new Image();
    img.alt = '';
    img.loading = 'lazy';
    img.referrerPolicy = 'no-referrer';
    img.src = url;
    cadre.append(img);
  }
  return cadre;
}

// Une ligne à sélectionner : affiche, titre, sous-titre, et une étiquette ou un texte à droite.
function ligneEnvie({ affiche, titre, sousTitre, etiquette, detail }, action) {
  const b = boutonSources('', 'src-ligne env-ligne', action);
  const textes = element('span', 'env-textes');
  textes.append(element('span', 'src-nom', titre), element('span', 'src-desc', sousTitre));
  if (detail) textes.append(element('span', 'src-desc env-detail', detail));
  b.append(miniAffiche(affiche), textes);
  if (etiquette) b.append(element('span', `src-etiquette ${etiquette.classe}`, etiquette.texte));
  return b;
}

async function afficherListeEnvies(message = '') {
  vueEnvies = 'liste';
  const fermer = boutonSources('Fermer', 'bouton', () => fenetreEnvies().close());
  let msg = peindreEnvies(t('Liste d’envies'), [element('p', 'aide', t('Chargement…'))], [fermer], message);
  let r;
  try {
    r = await api('/api/envies');
  } catch (e) {
    msg.className = 'msg ko';
    msg.textContent = e.message;
    return;
  }
  if (vueEnvies !== 'liste') return;
  const corps = [];
  corps.push(element('p', 'aide', t('Mets ici les films et les saisons que tu veux. Ondi les cherche sur tes sources toutes les 6 heures et télécharge la première version qui convient ({profil}).', { profil: profilEnMots(r.profil) })));
  if (!r.sources) {
    const alerte = boutonSources('', 'src-ligne src-ajout', () => {
      fenetreEnvies().close();
      ouvrirSources();
    });
    alerte.append(element('span', 'src-nom', t('Aucune source de recherche n’est activée : en ajouter une…')));
    corps.push(alerte);
  }
  const bloc = element('div', 'src-bloc');
  const ajouter = boutonSources('', 'src-ligne src-ajout', () => afficherAjoutEnvie(''));
  ajouter.append(element('span', 'src-nom', t('+ Ajouter un film ou une série…')));
  bloc.append(ajouter);
  for (const e of r.envies) {
    bloc.append(ligneEnvie({ affiche: e.affiche, titre: e.titre, sousTitre: sousTitreEnvie(e), etiquette: etatEnvie(e), detail: e.etat === 'attente' && !e.enRecherche ? t(e.message) : e.version?.nom || '' }, () => afficherDetailEnvie(e)));
  }
  if (!r.envies.length) bloc.append(element('p', 'aide', t('Ta liste est vide.')));
  corps.push(bloc);
  msg = peindreEnvies(t('Liste d’envies'), corps, [fermer], message);
  (bloc.querySelector('.env-ligne') || ajouter).focus();
  // Une recherche encore en cours : on rafraîchit la liste un peu plus tard.
  if (r.envies.some((e) => e.enRecherche)) minuterieEnvies = setTimeout(() => vueEnvies === 'liste' && fenetreEnvies().open && afficherListeEnvies(), 4000);
}

// Chercher un film ou une série à ajouter (TMDB), ou l'écrire à la main sans clé TMDB.
async function afficherAjoutEnvie(q) {
  vueEnvies = 'ajout';
  const retour = boutonSources('Retour', 'bouton', () => afficherListeEnvies());
  const champ = element('input');
  champ.type = 'search';
  champ.value = q;
  champ.placeholder = t('Titre du film ou de la série…');
  champ.setAttribute('aria-label', t('Titre du film ou de la série'));
  champ.autocomplete = 'off';
  champ.spellcheck = false;
  const chercher = boutonSources('Chercher', 'bouton principal', () => afficherAjoutEnvie(champ.value.trim()));
  champ.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    afficherAjoutEnvie(champ.value.trim());
  });
  const barre = element('div', 'src-filtres');
  barre.append(champ, chercher);
  const resultats = element('div', 'src-bloc');
  resultats.append(element('p', 'aide', q ? t('Recherche de « {q} »…', { q }) : t('Écris le titre, puis « Chercher ».')));
  const msg = peindreEnvies(t('Ajouter à la liste d’envies'), [barre, resultats], [retour]);
  if (!q) return void champ.focus();
  let r;
  try {
    r = await api(`/api/envies/titres?q=${encodeURIComponent(q)}${typeof LANGUE === 'string' && LANGUE === 'en' ? '&langue=en' : ''}`);
  } catch (e) {
    msg.className = 'msg ko';
    msg.textContent = e.message;
    r = { tmdb: true, titres: [], rate: true };
  }
  if (vueEnvies !== 'ajout' || champ.value.trim() !== q) return;
  const lignes = r.titres.map((c) =>
    ligneEnvie(
      { affiche: c.affiche, titre: c.titre, sousTitre: [c.type === 'film' ? t('Film') : t('Série'), c.annee, c.titreOriginal && c.titreOriginal !== c.titre ? c.titreOriginal : ''].filter(Boolean).join(' · '), detail: c.resume },
      () => (c.type === 'serie' ? afficherSaisonsEnvie(c, q) : ajouterEnvie(c)),
    ),
  );
  resultats.replaceChildren(...lignes);
  if (!lignes.length) resultats.append(element('p', 'aide', !r.tmdb ? t('Sans clé TMDB (Réglages), Ondi ne peut pas proposer les titres : écris ce que tu veux ci-dessous.') : r.rate ? t('La recherche des titres a échoué : tu peux écrire ce que tu veux ci-dessous.') : t('Aucun film ni série de ce nom : vérifie l’orthographe, ou écris ce que tu veux ci-dessous.')));
  // À la main : toujours possible, en bas (un titre exact, l'année pour un film, la saison pour une série).
  resultats.append(formulaireEnvieALaMain(q));
  (lignes[0] || champ).focus();
}

function formulaireEnvieALaMain(q) {
  const bloc = element('div', 'src-bloc');
  bloc.append(element('div', 'f-titre', t('Ou l’écrire à la main')));
  const champs = element('div', 'src-profil');
  const etiquette = (texte, el) => {
    const l = element('label', '', t(texte));
    l.append(el);
    return l;
  };
  const type = element('select');
  for (const [v, texte] of [['film', 'Film'], ['serie', 'Série']]) {
    const o = element('option', '', t(texte));
    o.value = v;
    type.append(o);
  }
  const titre = element('input');
  titre.value = q;
  titre.spellcheck = false;
  const annee = element('input');
  annee.type = 'number';
  annee.inputMode = 'numeric';
  annee.min = '1900';
  annee.max = '2100';
  annee.placeholder = t('facultatif');
  const saison = element('select');
  for (let n = 1; n <= 30; n++) saison.append(element('option', '', String(n)));
  const lAnnee = etiquette('Année du film', annee);
  const lSaison = etiquette('Saison', saison);
  const basculer = () => {
    lAnnee.hidden = type.value !== 'film';
    lSaison.hidden = type.value !== 'serie';
  };
  type.addEventListener('change', basculer);
  basculer();
  champs.append(etiquette('Film ou série', type), etiquette('Titre exact', titre), lAnnee, lSaison);
  const ajouter = boutonSources('Ajouter à ma liste', 'bouton', () => ajouterEnvie({ type: type.value, titre: titre.value, annee: type.value === 'film' ? annee.value : '', saison: saison.value }));
  ajouter.style.justifySelf = 'start';
  bloc.append(champs, ajouter);
  return bloc;
}

// Série choisie : quelle saison ?
async function afficherSaisonsEnvie(c, q) {
  vueEnvies = 'saisons';
  const retour = boutonSources('Retour', 'bouton', () => afficherAjoutEnvie(q));
  const msg = peindreEnvies(c.titre, [element('p', 'aide', t('Chargement des saisons…'))], [retour]);
  let saisons = [];
  try {
    ({ saisons } = await api(`/api/envies/saisons?tmdb=${c.tmdb}`));
  } catch (e) {
    msg.className = 'msg ko';
    msg.textContent = e.message;
  }
  if (vueEnvies !== 'saisons') return;
  if (!saisons.length) saisons = Array.from({ length: 10 }, (_, i) => ({ numero: i + 1, episodes: 0, annee: null }));
  const bloc = element('div', 'src-bloc');
  bloc.append(element('div', 'f-titre', t('Quelle saison veux-tu ?')));
  for (const s of saisons) {
    const b = boutonSources('', 'src-ligne', () => ajouterEnvie({ ...c, saison: s.numero }));
    b.append(element('span', 'src-nom', t('Saison {n}', { n: s.numero })), element('span', 'src-detail', [s.episodes ? t('{n} épisodes', { n: s.episodes }) : '', s.annee].filter(Boolean).join(' · ')));
    bloc.append(b);
  }
  peindreEnvies(c.titre, [element('p', 'aide', t('Ondi prend la saison entière d’un coup, quand elle existe dans la version voulue.')), bloc], [retour]);
  bloc.querySelector('button').focus();
}

async function ajouterEnvie(d) {
  const msg = fenetreEnvies().querySelector('.dlg-pied .msg');
  msg.className = 'msg';
  msg.textContent = t('Ajout, et première recherche sur tes sources…');
  try {
    const r = await api('/api/envies', { method: 'POST', body: JSON.stringify(d) });
    afficherDetailEnvie(r.envie, r.envie.etat === 'envoyee' ? t('Trouvé tout de suite : le téléchargement est lancé.') : t('Ajouté à ta liste.'));
    if (typeof rafraichir === 'function') rafraichir();
  } catch (e) {
    msg.className = 'msg ko';
    msg.textContent = e.message;
  }
}

function afficherDetailEnvie(e, message = '') {
  vueEnvies = 'detail';
  const etat = etatEnvie(e);
  const tete = element('div', 'env-tete');
  const textes = element('div', 'env-textes');
  textes.append(element('span', 'src-desc', sousTitreEnvie(e)), element('span', `src-etiquette ${etat.classe}`, etat.texte));
  tete.append(miniAffiche(e.affiche), textes);
  const corps = [tete];
  const ligne = (texte) => corps.push(element('p', 'aide env-info', texte));
  if (e.etat === 'attente') {
    if (e.message) corps.push(element('p', 'src-essai', t(e.message)));
    if (e.enRecherche) ligne(t('Recherche en cours sur tes sources…'));
    else if (e.verifiee) ligne(t(e.essais > 1 ? 'Dernière recherche {quand} · prochaine {prochaine} · {n} recherches en tout' : 'Dernière recherche {quand} · prochaine {prochaine}', { quand: ilYA(e.verifiee), prochaine: dansCombien(e.prochaine), n: e.essais }));
    ligne(t('Ondi télécharge la première version qui convient : {profil}. Ça se règle dans Réglages → Sources de recherche.', { profil: profilEnMots() }));
  } else {
    if (e.version) corps.push(element('p', 'src-essai ok', [e.version.nom, e.version.taille ? taille(e.version.taille) : '', e.version.source].filter(Boolean).join(' · ')));
    ligne(e.etat === 'terminee' ? t('Arrivé {quand} : il est dans ta bibliothèque.', { quand: ilYA(e.terminee) }) : t('Le téléchargement se suit dans « Téléchargements ».'));
  }
  const retour = boutonSources('Retour', 'bouton', () => afficherListeEnvies());
  const retirer = boutonSources('Retirer de la liste', 'bouton danger', async () => {
    try {
      await api('/api/envies/retirer', { method: 'POST', body: JSON.stringify({ id: e.id }) });
      afficherListeEnvies(t('« {titre} » retiré de la liste.', { titre: e.titre }));
    } catch (err) {
      msg.className = 'msg ko';
      msg.textContent = err.message;
    }
  });
  const boutons = [retour, retirer];
  let chercher = null;
  if (e.etat === 'attente') {
    chercher = boutonSources('Chercher maintenant', 'bouton principal', async () => {
      chercher.disabled = true;
      msg.className = 'msg';
      msg.textContent = t('Recherche sur tes sources…');
      try {
        const r = await api('/api/envies/verifier', { method: 'POST', body: JSON.stringify({ id: e.id }) });
        afficherDetailEnvie(r.envie, r.envie.etat === 'envoyee' ? t('Trouvé : le téléchargement est lancé.') : t('Pas encore : Ondi continue de chercher.'));
        if (typeof rafraichir === 'function') rafraichir();
      } catch (err) {
        msg.className = 'msg ko';
        msg.textContent = err.message;
        chercher.disabled = false;
      }
    });
    boutons.push(chercher);
  }
  const msg = peindreEnvies(e.titre, corps, boutons, message);
  (chercher || retour).focus();
  // Recherche encore en cours côté serveur : on relit l'envie un peu plus tard.
  if (e.enRecherche) {
    minuterieEnvies = setTimeout(async () => {
      if (vueEnvies !== 'detail' || !fenetreEnvies().open) return;
      try {
        const suite = (await api('/api/envies')).envies.find((x) => x.id === e.id);
        if (suite && vueEnvies === 'detail') afficherDetailEnvie(suite, message);
      } catch {}
    }, 4000);
  }
}

// ---------- accueil : la rangée « Ma liste d'envies » ----------

async function rangeeEnvies() {
  let r;
  try {
    r = await api('/api/envies');
  } catch {
    return null;
  }
  if (!r.envies.length) return null;
  const cartes = r.envies.slice(0, 30).map((e) => {
    const b = element('button', 'affiche');
    b.type = 'button';
    b.setAttribute('aria-haspopup', 'dialog');
    const infos = element('span', 'affiche-infos');
    const etat = etatEnvie(e);
    infos.append(element('span', 'affiche-titre', e.titre), element('span', 'affiche-sous', `${e.type === 'serie' ? `${t('Saison {n}', { n: e.saison })} · ` : ''}${etat.texte}`));
    b.append(cadreAffiche(e.affiche, e.titre), infos);
    b.setAttribute('aria-label', `${e.titre}, ${etat.texte}`);
    b.addEventListener('click', () => ouvrirEnvies({ detail: e.id }));
    return b;
  });
  const attendues = r.envies.filter((e) => e.etat === 'attente').length;
  return rangee(t('Ma liste d’envies'), cartes, { info: attendues ? t(attendues > 1 ? '{n} attendus' : '{n} attendu', { n: attendues }) : '' });
}

document.addEventListener('DOMContentLoaded', () => $('#btnEnvies')?.addEventListener('click', () => ouvrirEnvies()));
