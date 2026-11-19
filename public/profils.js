// Profils : écran « Qui regarde ? », création (nom, avatar ou photo, mot de passe facultatif),
// connexion avec « connexion automatique sur cet appareil », menu du profil dans la barre du haut.
/* global t, element, api, $, lirePreference, ecrirePreference, changerLangue, LANGUE, quandProfilChange */
let jetonProfil = '';
let profilActif = null;

const STOCKAGE_JETON = 'jetonProfil';
function lireJetonSauve() {
  try {
    return localStorage.getItem(STOCKAGE_JETON) || sessionStorage.getItem(STOCKAGE_JETON) || '';
  } catch {
    return '';
  }
}
function sauverJeton(jeton, auto) {
  try {
    localStorage.removeItem(STOCKAGE_JETON);
    sessionStorage.removeItem(STOCKAGE_JETON);
    if (jeton) (auto ? localStorage : sessionStorage).setItem(STOCKAGE_JETON, jeton);
  } catch {}
}

const ICONE_PLUS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>';
const ICONE_CADENAS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>';
const LOGO_SVG = '<svg viewBox="0 0 32 32" aria-hidden="true"><defs><linearGradient id="lg2" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#58b9ff"/><stop offset="1" stop-color="#1a6dff"/></linearGradient></defs><rect width="32" height="32" rx="8" fill="url(#lg2)"/><path d="M16 7v13m-6-6 6 6 6-6M9 25h14" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';

// Avatar rond : image de la galerie, photo importée, sinon l'initiale.
function avatarEl(avatar, nom = '') {
  const a = element('span', 'avatar');
  const initiale = element('span', 'avatar-initiale', (nom.trim()[0] || '?').toUpperCase());
  if (avatar) {
    const img = new Image();
    img.alt = '';
    img.src = avatar.startsWith('data:') ? avatar : `/avatars/${avatar}.svg`;
    img.addEventListener('error', () => img.replaceWith(initiale));
    a.append(img);
  } else a.append(initiale);
  return a;
}

// ---------- écran plein ----------

let ecran = null;
let listeProfils = [];
let galerie = [];
let gestion = false;

function ouvrirEcran() {
  if (!ecran) {
    ecran = element('div', 'ecran-profils modal-plein');
    ecran.id = 'ecranProfils';
    ecran.setAttribute('role', 'dialog');
    ecran.setAttribute('aria-modal', 'true');
    document.body.append(ecran);
  }
  ecran.hidden = false;
  document.body.classList.add('profils-ouverts');
  return ecran;
}
function fermerEcran() {
  if (ecran) ecran.hidden = true;
  document.body.classList.remove('profils-ouverts');
}
const ecranOuvert = () => !!ecran && !ecran.hidden;

function boite(...enfants) {
  const b = element('div', 'ep-boite');
  const logo = element('div', 'ep-logo');
  logo.innerHTML = LOGO_SVG;
  logo.append(element('span', '', 'Débrideur'));
  b.append(logo, ...enfants);
  ecran.replaceChildren(b);
  return b;
}
function focusPremier(selecteur) {
  requestAnimationFrame(() => ecran.querySelector(selecteur)?.focus({ preventScroll: true }));
}

async function afficherChoix({ focus } = {}) {
  ouvrirEcran();
  let r;
  try {
    r = await api('/api/profils');
  } catch (e) {
    boite(element('h1', 'ep-titre', t('Débrideur injoignable')), element('p', 'ep-sous', e.message));
    return;
  }
  listeProfils = r.profils;
  galerie = r.avatars || [];
  if (!listeProfils.length) return afficherFormulaire({ premier: true });
  const liste = element('div', 'ep-liste');
  for (const p of listeProfils) {
    const b = element('button', `ep-profil${gestion ? ' ep-gerer' : ''}`);
    b.type = 'button';
    b.dataset.id = p.id;
    const nom = element('span', 'ep-nom');
    nom.append(element('span', '', p.nom));
    if (p.protege) nom.insertAdjacentHTML('beforeend', ICONE_CADENAS);
    b.append(avatarEl(p.avatar, p.nom), nom);
    b.addEventListener('click', () => afficherConnexion(p, { pourModifier: gestion }));
    liste.append(b);
  }
  if (!gestion && listeProfils.length < 20) {
    const ajout = element('button', 'ep-profil ep-ajout');
    ajout.type = 'button';
    const rond = element('span', 'avatar');
    rond.innerHTML = ICONE_PLUS;
    ajout.append(rond, element('span', 'ep-nom', t('Ajouter un profil')));
    ajout.addEventListener('click', () => afficherFormulaire());
    liste.append(ajout);
  }
  const actions = element('div', 'ep-actions');
  const gerer = element('button', 'bouton grand', gestion ? t('Terminé') : t('Gérer les profils'));
  gerer.type = 'button';
  gerer.addEventListener('click', () => {
    gestion = !gestion;
    afficherChoix();
  });
  actions.append(gerer);
  if (profilActif && !gestion) {
    const retour = element('button', 'bouton grand', t('Retour'));
    retour.type = 'button';
    retour.addEventListener('click', fermerEcran);
    actions.append(retour);
  }
  boite(element('h1', 'ep-titre', gestion ? t('Gérer les profils') : t('Qui regarde ?')), liste, actions);
  focusPremier(focus ? `[data-id="${focus}"]` : '.ep-profil');
}

// Connexion : mot de passe s'il y en a un, et la case « connexion automatique ».
function afficherConnexion(p, { pourModifier = false } = {}) {
  ouvrirEcran();
  // Profil déjà ouvert sur cet appareil : pas besoin de se reconnecter pour le modifier.
  if (pourModifier && profilActif?.id === p.id && jetonProfil) return afficherFormulaire({ profil: p, jeton: jetonProfil });
  const panneau = element('form', 'ep-panneau');
  const entete = element('div', 'ep-entete');
  const textes = element('div');
  textes.append(element('h2', '', p.nom), element('p', 'aide', pourModifier ? t('Connecte-toi pour modifier ce profil.') : p.protege ? t('Ce profil est protégé par un mot de passe.') : t('Prêt à regarder ?')));
  entete.append(avatarEl(p.avatar, p.nom), textes);
  panneau.append(entete);
  let mdp = null;
  if (p.protege) {
    const champ = element('label', 'ep-champ', t('Mot de passe'));
    mdp = element('input');
    mdp.type = 'password';
    mdp.autocomplete = 'current-password';
    champ.append(mdp);
    panneau.append(champ);
  }
  const auto = element('label', 'ep-case');
  const caseAuto = element('input');
  caseAuto.type = 'checkbox';
  caseAuto.checked = lirePreference('connexionAutoParDefaut', false);
  auto.append(caseAuto, element('span', '', t('Connexion automatique à ce profil sur cet appareil')));
  if (!pourModifier) panneau.append(auto);
  const msg = element('p', 'ep-msg');
  const pied = element('div', 'ep-pied');
  const retour = element('button', 'bouton grand', t('Retour'));
  retour.type = 'button';
  retour.addEventListener('click', () => afficherChoix({ focus: p.id }));
  const ok = element('button', 'bouton principal grand', pourModifier ? t('Continuer') : t('Se connecter'));
  ok.type = 'submit';
  pied.append(retour, element('span', 'espace'), ok);
  panneau.append(msg, pied);
  panneau.addEventListener('submit', async (e) => {
    e.preventDefault();
    ok.disabled = true;
    msg.className = 'ep-msg';
    msg.textContent = '';
    try {
      const r = await api('/api/profils/connexion', { method: 'POST', body: JSON.stringify({ id: p.id, motDePasse: mdp?.value || '' }) });
      if (pourModifier) return afficherFormulaire({ profil: r.profil, jeton: r.jeton });
      ecrirePreference('connexionAutoParDefaut', caseAuto.checked);
      connecte(r.profil, r.jeton, caseAuto.checked);
    } catch (err) {
      msg.className = 'ep-msg ko';
      msg.textContent = err.message;
      mdp?.select();
    } finally {
      ok.disabled = false;
    }
  });
  boite(panneau);
  focusPremier(mdp ? 'input[type="password"]' : '.principal');
}

// Création ou modification : nom, avatar (galerie ou photo), mot de passe facultatif.
function afficherFormulaire({ premier = false, profil = null, jeton = '' } = {}) {
  ouvrirEcran();
  const modif = !!profil;
  let avatarChoisi = profil?.avatar || galerie[Math.floor(Math.random() * Math.max(1, galerie.length))] || '';
  const panneau = element('form', 'ep-panneau');
  const apercu = element('div', 'ep-entete');
  const majApercu = () => {
    const textes = element('div');
    textes.append(
      element('h2', '', modif ? t('Modifier le profil') : premier ? t('Bienvenue ! Crée ton profil') : t('Nouveau profil')),
      element('p', 'aide', t('Chaque profil a son propre historique : les autres ne le voient pas.')),
    );
    apercu.replaceChildren(avatarEl(avatarChoisi, nom.value || '?'), textes);
  };
  const champNom = element('label', 'ep-champ', t('Nom'));
  const nom = element('input');
  nom.type = 'text';
  nom.maxLength = 30;
  nom.value = profil?.nom || '';
  nom.autocomplete = 'off';
  nom.addEventListener('input', majApercu);
  champNom.append(nom);

  const titreGalerie = element('div', 'ep-champ', t('Image du profil'));
  const grille = element('div', 'ep-galerie');
  const majGalerie = () => {
    for (const b of grille.children) b.setAttribute('aria-pressed', String(b.dataset.avatar === avatarChoisi));
  };
  for (const id of galerie) {
    const b = element('button');
    b.type = 'button';
    b.dataset.avatar = id;
    b.setAttribute('aria-label', t('Avatar {n}', { n: id }));
    b.append(avatarEl(id));
    b.addEventListener('click', () => {
      avatarChoisi = id;
      majGalerie();
      majApercu();
    });
    grille.append(b);
  }
  // Photo importée (téléphone, PC) : réduite à 256 px avant l'envoi.
  const photo = element('label', 'bouton', t('Importer une photo'));
  const fichier = element('input');
  fichier.type = 'file';
  fichier.accept = 'image/*';
  fichier.hidden = true;
  photo.append(fichier);
  photo.tabIndex = 0;
  photo.addEventListener('keydown', (e) => e.key === 'Enter' && fichier.click());
  fichier.addEventListener('change', async () => {
    const f = fichier.files[0];
    if (!f) return;
    try {
      avatarChoisi = await reduirePhoto(f);
      majGalerie();
      majApercu();
    } catch {
      msg.className = 'ep-msg ko';
      msg.textContent = t('Image illisible.');
    }
  });
  titreGalerie.append(grille);

  // Mot de passe facultatif.
  const caseMdp = element('label', 'ep-case');
  const coche = element('input');
  coche.type = 'checkbox';
  coche.checked = false;
  caseMdp.append(coche, element('span', '', profil?.protege ? t('Changer le mot de passe') : t('Protéger ce profil par un mot de passe')));
  const champsMdp = element('div', 'ep-champ');
  champsMdp.hidden = true;
  const mdp1 = element('input');
  mdp1.type = 'password';
  mdp1.autocomplete = 'new-password';
  mdp1.placeholder = t('Mot de passe (4 caractères au moins)');
  const mdp2 = element('input');
  mdp2.type = 'password';
  mdp2.autocomplete = 'new-password';
  mdp2.placeholder = t('Confirme le mot de passe');
  champsMdp.append(mdp1, mdp2);
  coche.addEventListener('change', () => (champsMdp.hidden = !coche.checked));
  let retirer = null;
  if (profil?.protege) {
    retirer = element('label', 'ep-case');
    const c = element('input');
    c.type = 'checkbox';
    retirer.append(c, element('span', '', t('Retirer le mot de passe')));
  }

  const msg = element('p', 'ep-msg');
  const pied = element('div', 'ep-pied');
  if (!premier) {
    const retour = element('button', 'bouton grand', t('Retour'));
    retour.type = 'button';
    retour.addEventListener('click', () => afficherChoix({ focus: profil?.id }));
    pied.append(retour);
  }
  if (modif) {
    const suppr = element('button', 'bouton danger', t('Supprimer le profil'));
    suppr.type = 'button';
    let arme = false;
    suppr.addEventListener('click', async () => {
      if (!arme) {
        arme = true;
        suppr.classList.add('confirmer');
        suppr.textContent = t('Confirmer : supprimer {nom} et son historique', { nom: profil.nom });
        return;
      }
      try {
        await api('/api/profils/supprimer', { method: 'POST', body: '{}', headers: { 'X-Profil': jeton } });
        if (profilActif?.id === profil.id) deconnecter({ rouvrir: false });
        gestion = false;
        afficherChoix();
      } catch (err) {
        msg.className = 'ep-msg ko';
        msg.textContent = err.message;
      }
    });
    pied.append(suppr);
  }
  const ok = element('button', 'bouton principal grand', modif ? t('Enregistrer') : t('Créer le profil'));
  ok.type = 'submit';
  pied.append(element('span', 'espace'), ok);
  panneau.append(apercu, champNom, titreGalerie, photo, caseMdp, champsMdp, ...(retirer ? [retirer] : []), msg, pied);
  panneau.addEventListener('submit', async (e) => {
    e.preventDefault();
    msg.className = 'ep-msg';
    msg.textContent = '';
    if (coche.checked && mdp1.value !== mdp2.value) {
      msg.className = 'ep-msg ko';
      msg.textContent = t('Les deux mots de passe ne sont pas identiques.');
      return mdp2.focus();
    }
    ok.disabled = true;
    try {
      const corps = { nom: nom.value, avatar: avatarChoisi };
      if (coche.checked) corps.motDePasse = mdp1.value;
      if (retirer?.querySelector('input').checked) corps.retirerMotDePasse = true;
      if (modif) {
        const r = await api('/api/profils/modifier', { method: 'POST', body: JSON.stringify(corps), headers: { 'X-Profil': jeton } });
        if (profilActif?.id === r.profil.id) {
          profilActif = r.profil;
          majBoutonProfil();
        } else api('/api/profils/deconnexion', { method: 'POST', body: '{}', headers: { 'X-Profil': jeton } }).catch(() => {});
        gestion = false;
        afficherChoix({ focus: r.profil.id });
      } else {
        const r = await api('/api/profils', { method: 'POST', body: JSON.stringify(corps) });
        // Premier profil : on entre directement ; sinon retour à la liste, sur le nouveau profil.
        if (premier) {
          const c = await api('/api/profils/connexion', { method: 'POST', body: JSON.stringify({ id: r.profil.id, motDePasse: corps.motDePasse || '' }) });
          return afficherConnexionApresCreation(c, r.profil);
        }
        afficherChoix({ focus: r.profil.id });
      }
    } catch (err) {
      msg.className = 'ep-msg ko';
      msg.textContent = err.message;
    } finally {
      ok.disabled = false;
    }
  });
  majApercu();
  majGalerie();
  boite(panneau);
  focusPremier('input[type="text"]');
}

// Premier profil créé : on propose tout de suite la connexion automatique.
function afficherConnexionApresCreation(c, profil) {
  api('/api/profils/deconnexion', { method: 'POST', body: '{}', headers: { 'X-Profil': c.jeton } }).catch(() => {});
  afficherConnexion(profil);
}

function reduirePhoto(fichier) {
  return new Promise((ok, ko) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = c.height = 256;
      const cote = Math.min(img.width, img.height);
      c.getContext('2d').drawImage(img, (img.width - cote) / 2, (img.height - cote) / 2, cote, cote, 0, 0, 256, 256);
      URL.revokeObjectURL(img.src);
      ok(c.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = ko;
    img.src = URL.createObjectURL(fichier);
  });
}

// ---------- session ----------

function connecte(profil, jeton, auto) {
  jetonProfil = jeton;
  profilActif = profil;
  sauverJeton(jeton, auto);
  gestion = false;
  fermerEcran();
  majBoutonProfil();
  if (typeof quandProfilChange === 'function') quandProfilChange();
}

function deconnecter({ rouvrir = true } = {}) {
  if (jetonProfil) api('/api/profils/deconnexion', { method: 'POST', body: '{}' }).catch(() => {});
  jetonProfil = '';
  profilActif = null;
  sauverJeton('', false);
  majBoutonProfil();
  if (typeof quandProfilChange === 'function') quandProfilChange();
  if (rouvrir) afficherChoix();
}

// Au lancement : profil gardé sur cet appareil, sinon « Qui regarde ? ».
async function demarrerProfils() {
  const jeton = lireJetonSauve();
  if (jeton) {
    try {
      const r = await api('/api/moi', { headers: { 'X-Profil': jeton } });
      jetonProfil = jeton;
      profilActif = r.profil;
      majBoutonProfil();
      if (typeof quandProfilChange === 'function') quandProfilChange();
      return;
    } catch {
      sauverJeton('', false);
    }
  }
  majBoutonProfil();
  afficherChoix();
}

// ---------- bouton et menu du profil (barre du haut) ----------

let menu = null;
function majBoutonProfil() {
  const b = $('#btnProfil');
  if (!b) return;
  b.replaceChildren(avatarEl(profilActif?.avatar || '', profilActif?.nom || '?'));
  b.title = profilActif ? t('Profil : {nom}', { nom: profilActif.nom }) : t('Choisir un profil');
}
function fermerMenuProfil() {
  if (!menu) return;
  menu.remove();
  menu = null;
  $('#btnProfil')?.setAttribute('aria-expanded', 'false');
}
function ouvrirMenuProfil() {
  if (menu) return fermerMenuProfil();
  if (!profilActif) return afficherChoix();
  menu = element('div', 'menu-profil modal-plein');
  menu.setAttribute('role', 'menu');
  const tete = element('div', 'mp-tete');
  tete.append(avatarEl(profilActif.avatar, profilActif.nom), element('strong', '', profilActif.nom));
  const item = (texte, action) => {
    const b = element('button', '', texte);
    b.type = 'button';
    b.setAttribute('role', 'menuitem');
    b.addEventListener('click', () => {
      fermerMenuProfil();
      action();
    });
    return b;
  };
  menu.append(
    tete,
    item(t('Changer de profil'), () => afficherChoix()),
    item(t('Modifier le profil'), () => afficherFormulaire({ profil: profilActif, jeton: jetonProfil })),
    item(LANGUE === 'en' ? 'Langue : passer en français' : 'Language: switch to English', () => changerLangue(LANGUE === 'en' ? 'fr' : 'en')),
    item(t('Se déconnecter de cet appareil'), () => deconnecter()),
  );
  // Dans l'application télé : choisir un autre serveur (PC, mini-PC…).
  if (window.DebrideurAppli || window.parent !== window) menu.append(item(t('Changer de serveur'), () => versAppli('debrideur-serveur')));
  document.body.append(menu);
  $('#btnProfil').setAttribute('aria-expanded', 'true');
  requestAnimationFrame(() => menu?.querySelector('button')?.focus({ preventScroll: true }));
}
document.addEventListener('pointerdown', (e) => {
  if (menu && !menu.contains(e.target) && !e.target.closest('#btnProfil')) fermerMenuProfil();
});

// Retour (Échap, télécommande) sur ces écrans : true si on l'a traité.
function retourProfils() {
  if (menu) {
    fermerMenuProfil();
    $('#btnProfil')?.focus();
    return true;
  }
  if (!ecranOuvert()) return false;
  if (ecran.querySelector('.ep-panneau')) {
    if (listeProfils.length) afficherChoix();
    return true;
  }
  if (gestion) {
    gestion = false;
    afficherChoix();
    return true;
  }
  if (profilActif) fermerEcran();
  return true;
}
