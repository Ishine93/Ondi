// Premier lancement : assistant de configuration (langue, clé AllDebrid, dossiers, site, TMDB, téléphone et télé),
// choix d'un dossier du serveur (souris, doigt ou télécommande) et mises à jour (fenêtre « Nouvelle version »).
/* global t, element, api, $, LANGUE, changerLangue, dernier, demarrerProfils, lirePreference */

const LOGO_ASSISTANT = '<svg viewBox="0 0 100 100" aria-hidden="true"><defs><linearGradient id="lg3" x1="16.1" y1="16.1" x2="83.9" y2="83.9" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#00d8ff"/><stop offset=".2" stop-color="#1965fb"/><stop offset=".44" stop-color="#6f19fb"/><stop offset=".56" stop-color="#8f12fc"/><stop offset=".68" stop-color="#b50bf3"/><stop offset=".92" stop-color="#fd0fd1"/><stop offset="1" stop-color="#ff10cc"/></linearGradient></defs><path fill="url(#lg3)" d="M8.1 73.42L91.57 26A48 48 0 0 0 8.1 73.42Z"/><path fill="url(#lg3)" d="M10.21 76.85L93.44 29.57A48 48 0 0 1 10.21 76.85Z"/></svg>';

function boutonAssistant(texte, classe, action) {
  const b = element('button', `bouton grand ${classe}`, texte);
  b.type = 'button';
  b.addEventListener('click', action);
  return b;
}
function lienExterne(texte, url) {
  const a = element('a', '', texte);
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener';
  return a;
}

// ---------- choix d'un dossier sur le serveur ----------

function choisirDossier({ titre, depart }) {
  return new Promise((resoudre) => {
    const fond = element('div', 'choix-dossier modal-plein');
    fond.setAttribute('role', 'dialog');
    fond.setAttribute('aria-modal', 'true');
    const boite = element('div', 'cd-boite');
    fond.append(boite);
    document.body.append(fond);
    let courant = null;
    const fermer = (valeur) => {
      fond.remove();
      document.removeEventListener('keydown', surTouche, true);
      resoudre(valeur);
    };
    const surTouche = (e) => {
      if (e.key === 'Escape' || e.key === 'GoBack' || e.keyCode === 10009 || e.keyCode === 461) {
        e.preventDefault();
        e.stopPropagation();
        fermer(null);
      }
    };
    document.addEventListener('keydown', surTouche, true);
    const afficher = async (chemin, focus = true) => {
      let r;
      try {
        r = await api(`/api/dossiers${chemin ? `?chemin=${encodeURIComponent(chemin)}` : ''}`);
      } catch (e) {
        if (chemin) return afficher('', focus);
        boite.replaceChildren(element('p', 'ep-msg ko', e.message));
        return;
      }
      courant = r.chemin;
      const tete = element('div', 'cd-tete');
      tete.append(element('h2', '', titre), element('p', 'cd-chemin', r.chemin));
      const raccourcis = element('div', 'cd-raccourcis');
      for (const x of r.racines) {
        const b = element('button', 'bouton petit', t(x.nom));
        b.type = 'button';
        b.title = x.chemin;
        b.addEventListener('click', () => afficher(x.chemin));
        raccourcis.append(b);
      }
      const liste = element('div', 'cd-liste');
      if (r.parent) {
        const haut = element('button', 'cd-dossier cd-parent', `↑  ${t('Dossier parent')}`);
        haut.type = 'button';
        haut.addEventListener('click', () => afficher(r.parent));
        liste.append(haut);
      }
      for (const d of r.dossiers) {
        const b = element('button', 'cd-dossier');
        b.type = 'button';
        b.append(element('span', 'cd-icone', '📁'), element('span', '', d.nom));
        b.addEventListener('click', () => afficher(d.chemin));
        liste.append(b);
      }
      if (!r.dossiers.length) liste.append(element('p', 'aide', t('Aucun sous-dossier ici.')));
      const nouveau = element('div', 'cd-nouveau');
      const champ = element('input');
      champ.type = 'text';
      champ.placeholder = t('Nom du nouveau dossier');
      const creer = element('button', 'bouton', t('Créer ici'));
      creer.type = 'button';
      const msg = element('p', 'ep-msg');
      creer.addEventListener('click', async () => {
        if (!champ.value.trim()) return champ.focus();
        try {
          const x = await api('/api/dossiers/creer', { method: 'POST', body: JSON.stringify({ parent: courant, nom: champ.value.trim() }) });
          afficher(x.chemin);
        } catch (err) {
          msg.className = 'ep-msg ko';
          msg.textContent = err.message;
        }
      });
      nouveau.append(champ, creer);
      const pied = element('div', 'ep-pied');
      pied.append(boutonAssistant(t('Annuler'), '', () => fermer(null)), element('span', 'espace'), boutonAssistant(t('Choisir ce dossier'), 'principal', () => fermer(courant)));
      boite.replaceChildren(tete, raccourcis, liste, nouveau, msg, pied);
      if (focus) requestAnimationFrame(() => (liste.querySelector('.cd-dossier:not(.cd-parent)') || pied.querySelector('.principal'))?.focus({ preventScroll: true }));
    };
    afficher(depart);
  });
}

// ---------- assistant de premier lancement ----------

let assistant = null;
const ETAPES_ASSISTANT = ['langue', 'bienvenue', 'alldebrid', 'dossiers', 'site', 'tmdb', 'appareils', 'fin'];
const lireEtape = () => {
  try {
    return Math.max(0, ETAPES_ASSISTANT.indexOf(sessionStorage.getItem('etapeAssistant') || 'langue'));
  } catch {
    return 0;
  }
};
const ecrireEtape = (i) => {
  try {
    sessionStorage.setItem('etapeAssistant', ETAPES_ASSISTANT[i]);
  } catch {}
};

// true si l'assistant s'est ouvert (le choix du profil viendra après).
async function demarrerAssistant({ forcer = false } = {}) {
  let etat;
  try {
    etat = await api('/api/etat');
  } catch {
    return false;
  }
  dernier.config = etat.config;
  if (etat.config.assistantFini && !forcer) return false;
  assistant = { etat, i: forcer ? 1 : lireEtape() };
  assistant.el = element('div', 'assistant modal-plein');
  assistant.el.setAttribute('role', 'dialog');
  assistant.el.setAttribute('aria-modal', 'true');
  document.body.append(assistant.el);
  rendreAssistant();
  return true;
}

function allerEtape(i) {
  assistant.i = Math.max(0, Math.min(ETAPES_ASSISTANT.length - 1, i));
  ecrireEtape(assistant.i);
  rendreAssistant();
}

async function enregistrer(corps) {
  const r = await api('/api/config', { method: 'POST', body: JSON.stringify(corps) });
  dernier.config = r.config;
  return r.config;
}

function rendreAssistant() {
  const { el, i } = assistant;
  const c = dernier.config || {};
  const etape = ETAPES_ASSISTANT[i];
  const boite = element('div', 'as-boite');
  const logo = element('div', 'ep-logo');
  logo.innerHTML = LOGO_ASSISTANT;
  logo.append(element('span', '', 'Ondi'));
  const points = element('div', 'as-points');
  ETAPES_ASSISTANT.forEach((_, k) => points.append(element('span', k === i ? 'actif' : k < i ? 'fait' : '')));
  const panneau = element('div', 'ep-panneau as-panneau');
  const msg = element('p', 'ep-msg');
  const pied = element('div', 'ep-pied');
  const precedent = () => boutonAssistant(t('Retour'), '', () => allerEtape(i - 1));
  const suivant = (texte = t('Continuer')) => boutonAssistant(texte, 'principal', () => allerEtape(i + 1));
  const erreur = (e) => {
    msg.className = 'ep-msg ko';
    msg.textContent = e.message;
  };
  const champ = (libelle, valeur, { type = 'text', aide = '', placeholder = '' } = {}) => {
    const l = element('label', 'ep-champ', libelle);
    const input = element('input');
    input.type = type;
    input.value = valeur || '';
    input.placeholder = placeholder;
    input.autocomplete = 'off';
    input.spellcheck = false;
    l.append(input);
    if (aide) l.append(aide);
    return [l, input];
  };

  if (etape === 'langue') {
    panneau.append(element('h2', '', 'Welcome · Bienvenue'), element('p', 'aide', 'Choose the language of the app. · Choisis la langue de l\'application.'));
    const choix = element('div', 'as-langues');
    for (const [code, nom] of [['en', 'English'], ['fr', 'Français']]) {
      choix.append(
        boutonAssistant(nom, code === LANGUE ? 'principal' : '', () => {
          ecrireEtape(1);
          if (code !== LANGUE) return changerLangue(code);
          allerEtape(1);
        }),
      );
    }
    panneau.append(choix);
  } else if (etape === 'bienvenue') {
    panneau.append(
      element('h2', '', t('Bienvenue dans Ondi')),
      element('p', '', t('Cet ordinateur devient ton serveur : il cherche, télécharge et range tes films et séries, puis les lit sur ton PC, ton téléphone et ta télé.')),
    );
    const liste = element('ul', 'as-liste');
    for (const x of [
      t('Recherche sur le site de ton choix et téléchargement rapide avec AllDebrid.'),
      t('Une bibliothèque façon Prime Video : affiches, résumés, reprise de lecture.'),
      t('Un lecteur qui s\'adapte à chaque appareil (4K, HDR, son, sous-titres).'),
      t('Des profils pour chaque personne de la maison.'),
    ])
      liste.append(element('li', '', x));
    panneau.append(liste, element('p', 'aide', t('Quelques réglages et c\'est parti : tout se modifie plus tard dans les Réglages.')));
    pied.append(precedent(), element('span', 'espace'), suivant(t('Commencer')));
  } else if (etape === 'alldebrid') {
    const aide = element('p', 'aide');
    aide.append(t('AllDebrid (service payant) télécharge pour toi depuis les hébergeurs, à pleine vitesse. Crée ta clé sur '), lienExterne('alldebrid.fr/apikeys', 'https://alldebrid.fr/apikeys/'), t(' puis colle-la ici.'));
    const [l, input] = champ(t('Clé API AllDebrid'), '', { type: 'password', placeholder: c.cle ? t('Clé déjà enregistrée : laisse vide pour la garder') : t('Colle ta clé ici') });
    panneau.append(element('h2', '', t('Ton compte AllDebrid')), aide, l);
    const ok = boutonAssistant(t('Vérifier et continuer'), 'principal', async () => {
      if (!input.value.trim()) return c.cle ? allerEtape(i + 1) : input.focus();
      ok.disabled = true;
      msg.className = 'ep-msg';
      msg.textContent = t('Vérification de la clé…');
      try {
        await enregistrer({ cleApi: input.value.trim() });
        allerEtape(i + 1);
      } catch (e) {
        erreur(e);
      } finally {
        ok.disabled = false;
      }
    });
    pied.append(precedent(), element('span', 'espace'), boutonAssistant(t('Plus tard'), '', () => allerEtape(i + 1)), ok);
  } else if (etape === 'dossiers') {
    panneau.append(element('h2', '', t('Où ranger tes vidéos ?')), element('p', 'aide', t('Les téléchargements y sont rangés tout seuls, et la bibliothèque les lit. Choisis un disque avec de la place (un film 4K pèse de 10 à 80 Go).')));
    const valeurs = { films: c.dossiers?.films || '', series: c.dossiers?.series || '', mangas: c.dossiers?.mangas || '' };
    for (const [k, nom, facultatif] of [['films', t('Films'), false], ['series', t('Séries'), false], ['mangas', t('Mangas (facultatif)'), true]]) {
      const ligne = element('div', 'as-dossier');
      const texte = element('div', 'as-dossier-texte');
      const chemin = element('span', 'cd-chemin', valeurs[k] || t('Avec les séries'));
      texte.append(element('strong', '', nom), chemin);
      const choisir = boutonAssistant(t('Choisir…'), '', async () => {
        const x = await choisirDossier({ titre: nom, depart: valeurs[k] || valeurs.series });
        if (x) {
          valeurs[k] = x;
          chemin.textContent = x;
        }
        choisir.focus();
      });
      ligne.append(texte, choisir);
      if (facultatif)
        ligne.append(
          boutonAssistant(t('Avec les séries'), '', () => {
            valeurs[k] = '';
            chemin.textContent = t('Avec les séries');
          }),
        );
      panneau.append(ligne);
    }
    const ok = boutonAssistant(t('Continuer'), 'principal', async () => {
      ok.disabled = true;
      try {
        await enregistrer({ films: valeurs.films, series: valeurs.series, mangas: valeurs.mangas });
        allerEtape(i + 1);
      } catch (e) {
        erreur(e);
      } finally {
        ok.disabled = false;
      }
    });
    pied.append(precedent(), element('span', 'espace'), ok);
  } else if (etape === 'site') {
    const [l, input] = champ(t('Adresse du site'), c.siteRecherche, { placeholder: 'https://…' });
    panneau.append(
      element('h2', '', t('Ton site de recherche')),
      element('p', 'aide', t('L\'adresse du site où tu cherches tes films et séries : Ondi trouve tout seul sa barre de recherche et regroupe les résultats. Tu peux le changer quand tu veux.')),
      l,
    );
    const ok = boutonAssistant(t('Continuer'), 'principal', async () => {
      if (!input.value.trim()) return allerEtape(i + 1);
      ok.disabled = true;
      try {
        await enregistrer({ siteRecherche: input.value.trim() });
        allerEtape(i + 1);
      } catch (e) {
        erreur(e);
      } finally {
        ok.disabled = false;
      }
    });
    pied.append(precedent(), element('span', 'espace'), boutonAssistant(t('Plus tard'), '', () => allerEtape(i + 1)), ok);
  } else if (etape === 'tmdb') {
    const aide = element('p', 'aide');
    aide.append(t('Gratuit et facultatif : les affiches, résumés, casting et titres d\'épisodes de ta bibliothèque. Crée un compte sur '), lienExterne('themoviedb.org', 'https://www.themoviedb.org/signup'), t(', puis dans '), lienExterne(t('Paramètres → API'), 'https://www.themoviedb.org/settings/api'), t(' copie le « jeton d\'accès en lecture » (il commence par eyJ).'));
    const [l, input] = champ(t('Jeton TMDB'), '', { type: 'password', placeholder: c.tmdb ? t('Clé déjà enregistrée : laisse vide pour la garder') : 'eyJ…' });
    panneau.append(element('h2', '', t('Les infos des films (TMDB)')), aide, l);
    const ok = boutonAssistant(t('Vérifier et continuer'), 'principal', async () => {
      if (!input.value.trim()) return allerEtape(i + 1);
      ok.disabled = true;
      msg.className = 'ep-msg';
      msg.textContent = t('Vérification de la clé…');
      try {
        await enregistrer({ tmdb: input.value.trim() });
        allerEtape(i + 1);
      } catch (e) {
        erreur(e);
      } finally {
        ok.disabled = false;
      }
    });
    pied.append(precedent(), element('span', 'espace'), boutonAssistant(t('Plus tard'), '', () => allerEtape(i + 1)), ok);
  } else if (etape === 'appareils') {
    panneau.append(element('h2', '', t('Ton téléphone et ta télé')), element('p', 'aide', t('Ils doivent être sur le même réseau (Wi-Fi ou câble) que cet ordinateur, qui doit rester allumé.')));
    panneau.append(blocAdresses(assistant.etat));
    const tele = element('p', 'aide');
    tele.append(t('Sur la télé : installe l\'appli Ondi (Samsung, LG, Android TV, Google TV, Fire TV). Chaque paquet a son mode d\'emploi, sur '), lienExterne(t('la page des versions'), 'https://github.com/Ishine93/Ondi/releases/latest'), t('. L\'appli trouve ce serveur toute seule.'));
    const pc = element('p', 'aide', c.systeme === 'win32' ? t('Si Windows demande d\'autoriser Node.js sur le réseau, accepte pour les réseaux privés : sinon le téléphone et la télé ne voient pas le serveur.') : '');
    panneau.append(tele, pc);
    pied.append(precedent(), element('span', 'espace'), suivant());
  } else {
    panneau.append(
      element('h2', '', t('C\'est prêt !')),
      element('p', '', t('Dernière étape : crée ton profil. Chaque personne peut avoir le sien, avec son historique et, si elle veut, un mot de passe.')),
    );
    const ok = boutonAssistant(t('Créer mon profil'), 'principal', async () => {
      ok.disabled = true;
      try {
        await enregistrer({ assistantFini: true });
        try {
          sessionStorage.removeItem('etapeAssistant');
        } catch {}
        assistant.el.remove();
        assistant = null;
        demarrerProfils();
      } catch (e) {
        erreur(e);
        ok.disabled = false;
      }
    });
    pied.append(precedent(), element('span', 'espace'), ok);
  }
  if (pied.children.length) panneau.append(msg, pied);
  boite.append(logo, points, panneau);
  el.replaceChildren(boite);
  requestAnimationFrame(() => (panneau.querySelector('input') || panneau.querySelector('.principal') || panneau.querySelector('button'))?.focus({ preventScroll: true }));
}

// Adresses à ouvrir depuis le téléphone ou la télé (ce serveur, sur le réseau local).
function blocAdresses(etat) {
  const bloc = element('div', 'as-adresses');
  const port = etat?.port || location.port || 8097;
  const adresses = (etat?.adresses || []).map((a) => `http://${a}:${port}`);
  if (!adresses.length) bloc.append(element('p', 'aide', t('Aucune adresse réseau trouvée : cet ordinateur est-il connecté au réseau ?')));
  for (const a of adresses) {
    const ligne = element('div', 'as-adresse');
    const code = element('code', '', a);
    code.dataset.pasTraduire = '';
    const copier = element('button', 'bouton petit', t('Copier'));
    copier.type = 'button';
    copier.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(a);
        copier.textContent = t('Copiée ✓');
      } catch {
        copier.textContent = a;
      }
    });
    ligne.append(code, copier);
    bloc.append(ligne);
  }
  bloc.append(element('p', 'aide', t('Sur le téléphone : ouvre cette adresse dans le navigateur, puis « Ajouter à l\'écran d\'accueil » pour l\'avoir comme une appli.')));
  return bloc;
}

// ---------- mises à jour ----------

let majAffichee = false;
// Version de l'appli télé qui affiche cette page (« samsung-1.0.0 »…), pour proposer de la réinstaller.
const appliTele = (() => {
  const x = new URLSearchParams(location.search).get('appli') || '';
  const m = x.match(/^([a-z]+)-(.+)$/);
  return m ? { plateforme: m[1], version: m[2] } : null;
})();
const versionPlusRecente = (a, b) => {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  return false;
};

async function verifierMisesAJour({ forcer = false, silencieux = true } = {}) {
  let etat;
  try {
    etat = await api(`/api/version${forcer ? '?frais' : ''}`);
  } catch (e) {
    return { erreur: e.message };
  }
  const applisTele = appliTele && etat.applisTele?.[appliTele.plateforme];
  const teleAncienne = applisTele && versionPlusRecente(applisTele, appliTele.version);
  let ignoree = null;
  try {
    ignoree = sessionStorage.getItem('majPlusTard');
  } catch {}
  if (silencieux && etat.disponible && ignoree !== etat.derniere && !majAffichee) fenetreMiseAJour(etat);
  else if (silencieux && teleAncienne && ignoree !== `tele-${applisTele}` && !majAffichee) fenetreMiseAJour(etat, { tele: applisTele });
  return etat;
}

function fenetreMiseAJour(etat, { tele = null } = {}) {
  majAffichee = true;
  const fond = element('div', 'maj-fond modal-plein');
  fond.setAttribute('role', 'dialog');
  fond.setAttribute('aria-modal', 'true');
  const panneau = element('div', 'ep-panneau maj-panneau');
  const msg = element('p', 'ep-msg');
  const pied = element('div', 'ep-pied');
  const fermer = () => {
    fond.remove();
    majAffichee = false;
  };
  const plusTard = boutonAssistant(t('Plus tard'), '', () => {
    try {
      sessionStorage.setItem('majPlusTard', tele ? `tele-${tele}` : etat.derniere);
    } catch {}
    fermer();
  });
  if (tele) {
    panneau.append(
      element('h2', '', t('Nouvelle version de l\'appli télé')),
      element('p', '', t('L\'appli installée sur cette télé peut être mise à jour (version {v}). Réinstalle-la depuis l\'ordinateur avec le paquet de ta télé, comme la première fois : tes profils et ton historique sont gardés.', { v: tele })),
    );
    pied.append(element('span', 'espace'), boutonAssistant(t('OK'), 'principal', fermer));
  } else {
    panneau.append(element('h2', '', t('Nouvelle version disponible : {v}', { v: etat.derniere })), element('p', 'aide', t('Version installée : {v}', { v: etat.actuelle })));
    // Notes de version : partie « ## Français » ou « ## English » selon la langue de l'appli.
    const parties = String(etat.notes || '').split(/^##\s*(?=English|Français|French)/im);
    const partie = parties.find((x) => (LANGUE === 'en' ? /^English/i : /^(Français|French)/i).test(x)) || etat.notes || '';
    const notes = String(partie)
      .replace(/^(English|Français|French)\s*\n/i, '')
      .split('\n')
      .map((l) => l.replace(/^[#*\-\s]+/, '').replace(/\*\*|__|`/g, '').trim())
      .filter(Boolean)
      .slice(0, 8);
    if (notes.length) {
      const ul = element('ul', 'as-liste');
      for (const n of notes) ul.append(element('li', '', n));
      panneau.append(ul);
    }
    panneau.append(element('p', 'aide', t('Ondi redémarre tout seul (une minute environ). Tes réglages, profils et téléchargements sont gardés.')));
    const go = boutonAssistant(t('Mettre à jour maintenant'), 'principal', async () => {
      go.disabled = true;
      plusTard.disabled = true;
      msg.className = 'ep-msg';
      msg.textContent = t('Téléchargement et installation…');
      try {
        await api('/api/mise-a-jour', { method: 'POST', body: '{}' });
        msg.textContent = t('Installé : Ondi redémarre…');
        attendreRedemarrage(etat.derniere, msg);
      } catch (e) {
        msg.className = 'ep-msg ko';
        msg.textContent = e.message;
        go.disabled = false;
        plusTard.disabled = false;
      }
    });
    pied.append(plusTard, element('span', 'espace'), go);
  }
  panneau.append(msg, pied);
  fond.append(panneau);
  document.body.append(fond);
  requestAnimationFrame(() => pied.querySelector('.principal')?.focus({ preventScroll: true }));
}

// Après la mise à jour : on attend que le serveur revienne avec la nouvelle version, puis on recharge.
async function attendreRedemarrage(version, msg) {
  for (let i = 0; i < 90; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    try {
      const e = await api('/api/version');
      if (e.actuelle === version) {
        msg.textContent = t('Mise à jour terminée ✓');
        return setTimeout(() => location.reload(), 800);
      }
    } catch {}
  }
  msg.className = 'ep-msg ko';
  msg.textContent = t('Ondi ne répond pas : relance-le depuis son raccourci.');
}

// Retour (télécommande, Échap) sur la fenêtre de mise à jour : « Plus tard ».
function retourAssistant() {
  const maj = document.querySelector('.maj-fond');
  if (maj) {
    maj.querySelector('.ep-pied .bouton:not(.principal)')?.click() || maj.remove();
    majAffichee = false;
    return true;
  }
  if (assistant && assistant.i > 0) {
    allerEtape(assistant.i - 1);
    return true;
  }
  return !!assistant;
}
