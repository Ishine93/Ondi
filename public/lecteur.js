// Lecteur plein écran, utilisable à la souris, au doigt et à la télécommande :
//   OK = lecture / pause, gauche / droite = reculer / avancer de 10 s, haut / bas = afficher les boutons,
//   Retour = fermer (ou fermer le menu ouvert). Touches multimédia de la télécommande gérées.
// Le serveur choisit le mode (direct, image recopiée + son converti, conversion par la carte graphique) selon
// ce que l'appareil sait lire et la qualité demandée ; pour avancer dans un flux converti, on relance le flux
// à la bonne position (le serveur renvoie où il commence : « debut »).
/* global t, element, api, $, jetonProfil, profilActif, lirePreference, ecrirePreference, horloge, dureeMinutes, estTele, rechargerFiche, majRangeesPerso, modeClavier, heureDans, texteFin */

const ICONES_LC = {
  lecture: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.5-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5Z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4.5" height="16" rx="1.2"/><rect x="13.5" y="4" width="4.5" height="16" rx="1.2"/></svg>',
  recul: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><text x="12" y="15.5" font-size="7.5" text-anchor="middle" fill="currentColor" stroke="none" font-weight="700">10</text></svg>',
  avance: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/><text x="12" y="15.5" font-size="7.5" text-anchor="middle" fill="currentColor" stroke="none" font-weight="700">10</text></svg>',
  suivant: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M5 5.5v13a1 1 0 0 0 1.6.8l8.7-6.5a1 1 0 0 0 0-1.6L6.6 4.7A1 1 0 0 0 5 5.5Z"/><rect x="17" y="4.5" width="2.6" height="15" rx="1"/></svg>',
  audio: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2v6h4l5 4V5Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/></svg>',
  st: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2.5"/><path d="M6 13h4M13 13h5M6 16h8"/></svg>',
  qualite: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/></svg>',
  plein: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
  retour: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>',
};
const QUALITES = [
  ['auto', 'Auto'],
  ['original', 'Original (sans conversion)'],
  ['60', '60 Mbit/s · 4K'],
  ['40', '40 Mbit/s · 4K'],
  ['20', '20 Mbit/s · 1080p'],
  ['10', '10 Mbit/s · 1080p'],
  ['4', '4 Mbit/s · 720p'],
];

// Ce que cet appareil sait lire (testé par le navigateur lui-même).
function capacitesLecture() {
  const v = document.createElement('video');
  const ok = (type) => {
    try {
      return !!window.MediaSource?.isTypeSupported?.(type) || ['probably', 'maybe'].includes(v.canPlayType(type));
    } catch {
      return false;
    }
  };
  const tele = document.body.classList.contains('grand') || (typeof estTele === 'function' && estTele());
  const telephone = !tele && matchMedia('(hover: none) and (max-width: 1000px)').matches;
  return {
    hevc: ok('video/mp4; codecs="hvc1.1.6.L153.B0"') || ok('video/mp4; codecs="hev1.1.6.L153.B0"'),
    hevc10: ok('video/mp4; codecs="hvc1.2.4.L153.B0"') || ok('video/mp4; codecs="hev1.2.4.L153.B0"'),
    av1: ok('video/mp4; codecs="av01.0.12M.08"'),
    vp9: ok('video/webm; codecs="vp9"'),
    ac3: ok('audio/mp4; codecs="ac-3"'),
    eac3: ok('audio/mp4; codecs="ec-3"'),
    opus: ok('audio/mp4; codecs="opus"'),
    flac: ok('audio/mp4; codecs="flac"'),
    dts: false,
    hdr: tele || matchMedia('(dynamic-range: high)').matches,
    maxHauteur: telephone ? 1080 : 2160,
    // Télé en Wi-Fi (64 à 110 Mbit/s mesurés) : au-delà de ~45 Mbit/s, le serveur convertit à 40.
    debitMax: telephone ? 15 : tele ? 40 : 120,
    tele,
  };
}

// Préférences de lecture (par profil, sur cet appareil) : langue audio, sous-titres, qualité.
const clePrefs = () => `prefsLecture:${profilActif?.id || 'aucun'}`;
const lirePrefs = () => lirePreference(clePrefs(), { audio: 'fr', st: 'auto', qualite: 'auto' });
const ecrirePrefs = (p) => ecrirePreference(clePrefs(), { ...lirePrefs(), ...p });
const estFrancais = (l) => /^(fre|fra|fr)$/i.test(l || '');

function choisirAudio(version, prefs) {
  const a = version.audios || [];
  if (!a.length) return null;
  const langue = prefs.audio === 'vo' ? null : prefs.audio || 'fr';
  if (langue) {
    const memes = a.filter((x) => (langue === 'fr' ? estFrancais(x.langue) : x.langue?.startsWith(langue)));
    // Version française de France plutôt que québécoise, et pas l'audiodescription.
    const bonne = memes.find((x) => !/canad|vfq|qu[ée]b|\bAD\b|descri/i.test(x.titre || '')) || memes[0];
    if (bonne) return bonne.ordre;
  }
  return (a.find((x) => x.defaut) || a[0]).ordre;
}
function choisirSousTitres(version, audioOrdre, prefs) {
  const st = (version.sousTitres || []).filter((x) => x.texte && !x.vide);
  if (prefs.st === 'non') return null;
  const audio = (version.audios || []).find((x) => x.ordre === audioOrdre);
  const fr = st.filter((x) => estFrancais(x.langue));
  if (prefs.st === 'fr' || (prefs.st === 'auto' && audio && !estFrancais(audio.langue))) {
    const complets = fr.find((x) => !x.force && !/sdh/i.test(x.nom)) || fr.find((x) => !x.force) || fr[0];
    if (complets) return complets;
  }
  // Audio en français : les sous-titres « forcés » (passages en langue étrangère) s'il y en a.
  if (prefs.st === 'auto' && audio && estFrancais(audio.langue)) return fr.find((x) => x.force) || null;
  return null;
}

// ---------- sous-titres (WebVTT lu et affiché par nous : plus gros à la télé, compatible avec les sauts) ----------

function lireVtt(texte) {
  const cues = [];
  const temps = (s) => {
    const p = s.trim().split(':').map(Number);
    return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + p[1];
  };
  for (const bloc of texte.replace(/\r/g, '').split(/\n\n+/)) {
    const lignes = bloc.split('\n');
    const i = lignes.findIndex((l) => l.includes('-->'));
    if (i < 0) continue;
    const [debut, fin] = lignes[i].split('-->').map((x) => temps(x.trim().split(' ')[0]));
    const contenu = lignes
      .slice(i + 1)
      .join('\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&nbsp;/g, ' ')
      .trim();
    if (contenu && Number.isFinite(debut) && Number.isFinite(fin)) cues.push({ debut, fin, texte: contenu });
  }
  return cues.sort((a, b) => a.debut - b.debut);
}

// ---------- le lecteur ----------

let L = null; // état du lecteur ouvert

function ouvrirLecteur(o) {
  if (L) fermerLecteur({ historique: false, sauver: true });
  const prefs = lirePrefs();
  const version = o.versions.find((v) => v.id === o.versionId) || o.versions[0];
  if (!version) return;
  const audio = choisirAudio(version, prefs);
  L = {
    ...o,
    version,
    audio,
    st: choisirSousTitres(version, audio, prefs),
    qualite: prefs.qualite || 'auto',
    caps: capacitesLecture(),
    session: null,
    debut: 0,
    duree: version.duree || 0,
    cues: [],
    cuesComplet: true,
    attenteSaut: null,
    cible: null,
    derniereSauvegarde: 0,
    essais: 0,
    suivantPropose: false,
    depuis: document.activeElement,
  };
  construireLecteur();
  if (history.state?.debrideur !== 'lecteur') history.pushState({ debrideur: 'lecteur' }, '');
  demarrer(o.position || 0);
}

function construireLecteur() {
  const el = element('div', 'lecteur modal-plein controles-visibles');
  el.id = 'lecteur';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', t('Lecteur vidéo'));
  const video = document.createElement('video');
  video.playsInline = true;
  video.preload = 'auto';
  video.setAttribute('playsinline', '');
  const st = element('div', 'lc-st');
  st.setAttribute('aria-live', 'off');
  const attente = element('div', 'lc-attente');
  const couche = element('div', 'lc-couche');

  const btn = (nom, icone, libelle, action, classe = '') => {
    const b = element('button', `lc-bouton ${classe}`);
    b.type = 'button';
    b.dataset.nom = nom;
    b.innerHTML = icone;
    b.title = libelle;
    b.setAttribute('aria-label', libelle);
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      action(b);
    });
    return b;
  };
  const haut = element('div', 'lc-haut');
  const titre = element('div', 'lc-titre');
  titre.append(element('strong', '', L.titre), element('span', '', L.sousTitre || ''));
  // En haut à droite : l'heure, et celle de la fin de la vidéo à ce rythme.
  const heure = element('div', 'lc-heure');
  const maintenant = element('strong', '', '');
  const fin = element('span', '', '');
  heure.append(maintenant, fin);
  haut.append(btn('fermer', ICONES_LC.retour, t('Retour'), () => fermerLecteur()), titre, heure);

  const milieu = element('div', 'lc-milieu');
  const bas = element('div', 'lc-bas');
  const temps = element('div', 'lc-temps');
  const actuel = element('span', '', '0:00');
  const total = element('span', '', horloge(L.duree));
  const barre = element('div', 'lc-barre');
  barre.tabIndex = 0;
  barre.setAttribute('role', 'slider');
  barre.setAttribute('aria-label', t('Position'));
  const piste = element('div', 'lc-piste');
  const tampon = element('div', 'lc-tampon');
  const fait = element('div', 'lc-fait');
  const curseur = element('div', 'lc-curseur');
  const bulle = element('div', 'lc-bulle');
  piste.append(tampon, fait, curseur);
  barre.append(piste, bulle);
  temps.append(actuel, barre, total);

  const boutons = element('div', 'lc-boutons');
  const lecture = btn('lecture', ICONES_LC.pause, t('Lecture / pause'), () => basculerLecture(), 'grand');
  boutons.append(
    lecture,
    btn('recul', ICONES_LC.recul, t('Reculer de 10 s'), () => sauter(-10)),
    btn('avance', ICONES_LC.avance, t('Avancer de 10 s'), () => sauter(10)),
  );
  const suivant = L.suivant?.();
  if (suivant) boutons.append(btn('suivant', ICONES_LC.suivant, t('Épisode suivant'), () => lireSuivant()));
  boutons.append(element('span', 'espace'));
  const option = (nom, icone, libelle) => {
    const b = btn(nom, icone, libelle, () => ouvrirMenu(nom, b), 'option');
    b.append(element('span', '', libelle));
    return b;
  };
  if (L.version.audios.length > 1) boutons.append(option('audio', ICONES_LC.audio, t('Audio')));
  boutons.append(option('st', ICONES_LC.st, t('Sous-titres')));
  boutons.append(option('qualite', ICONES_LC.qualite, t('Qualité')));
  if (document.fullscreenEnabled && !L.caps.tele) boutons.append(btn('plein', ICONES_LC.plein, t('Plein écran'), () => basculerPleinEcran()));
  bas.append(temps, boutons);
  couche.append(haut, milieu, bas);
  el.append(video, st, attente, couche);
  document.body.append(el);
  document.body.classList.add('lecture-ouverte');
  Object.assign(L, { el, video, stEl: st, attente, barre, fait, tampon, curseur, bulle, actuel, total, lecture, heureMaintenant: maintenant, heureFin: fin });
  // En pause, l'heure de fin recule avec l'horloge : on la remet à jour même sans « timeupdate ».
  L.minuterieHeure = setInterval(majHeure, 5000);

  // Souris et doigt.
  el.addEventListener('pointermove', () => montrerControles());
  el.addEventListener('click', (e) => {
    if (e.target === video || e.target === couche || e.target === milieu) {
      if (matchMedia('(hover: none)').matches && !el.classList.contains('controles-visibles')) return montrerControles();
      basculerLecture();
    }
  });
  video.addEventListener('dblclick', () => basculerPleinEcran());
  let glisse = false;
  const positionDe = (e) => {
    const r = piste.getBoundingClientRect();
    return Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * L.duree;
  };
  barre.addEventListener('pointerdown', (e) => {
    glisse = true;
    barre.setPointerCapture(e.pointerId);
    L.cible = positionDe(e);
    majTemps();
  });
  barre.addEventListener('pointermove', (e) => {
    const p = positionDe(e);
    bulle.textContent = horloge(p);
    bulle.style.left = `${(p / L.duree) * 100}%`;
    if (glisse) {
      L.cible = p;
      majTemps();
    }
  });
  barre.addEventListener('pointerup', (e) => {
    if (!glisse) return;
    glisse = false;
    allerA(positionDe(e));
  });

  // Vidéo.
  video.addEventListener('playing', () => {
    attente.hidden = true;
    L.aJoue = true;
    clearTimeout(L.gardeImage);
    clearTimeout(L.surveillance);
    L.essais = 0;
    if (tempsActuel() - (L.debutCoupures || 0) > 120) L.coupures = 0;
    L.debutCoupures = tempsActuel();
    majBoutonLecture();
    planifierMasquage();
  });
  // Flux bloqué (Wi-Fi qui décroche, PC occupé) : au bout de 15 s on le relance au même endroit.
  video.addEventListener('waiting', () => {
    attente.hidden = false;
    clearTimeout(L.surveillance);
    const etat = L;
    etat.surveillance = setTimeout(() => {
      if (L === etat && etat.video.readyState < 3 && !etat.video.paused && etat.cible == null) reprendreFlux(t('Lecture bloquée : reprise…'));
    }, 15_000);
  });
  video.addEventListener('pause', () => {
    majBoutonLecture();
    montrerControles(true);
    sauverPosition(true);
  });
  video.addEventListener('timeupdate', () => avancer());
  video.addEventListener('ended', () => {
    // Fin des données avant la fin du film : le flux a été coupé (réseau, PC), ce n'est pas la fin.
    if (L.session?.mode !== 'direct' && L.duree - tempsActuel() > 40) {
      signaler('flux terminé avant la fin, reprise');
      return reprendreFlux(t('Connexion interrompue : reprise…'));
    }
    sauverPosition(true, true);
    const s = L.suivant?.();
    if (s) lireSuivant();
    else fermerLecteur();
  });
  video.addEventListener('error', () => erreurVideo());
  L.surveillancePosition = setInterval(echantillonner, 250);
  montrerControles();
}

// Ce qui suit l'heure de la vidéo : barre, sous-titres, sauvegarde de la position, fin proche.
function avancer() {
  if (!L) return;
  majTemps();
  majSousTitres();
  if (Date.now() - L.derniereSauvegarde > 10_000) sauverPosition();
  verifierFin();
}

function tempsActuel() {
  if (!L) return 0;
  if (L.cible != null) return L.cible;
  if (L.session?.mode === 'direct') return L.video.currentTime;
  return L.debut + (L.horlogeLecteur && L.horloge ? L.horloge.pos : L.video.currentTime || 0);
}

// Horloge du lecteur pour les flux convertis ou repaquetés. Certaines télés (Samsung) arrêtent currentTime
// quelques secondes après le début du flux alors que l'image continue (barre figée, reprise fausse, fin du film
// prise pour une coupure). On tient donc notre propre horloge, recalée sur currentTime tant qu'il bouge et qui
// avance toute seule quand la vidéo joue mais que currentTime reste figé. Figé 3 s alors que la vidéo joue :
// c'est elle qui compte jusqu'à la fermeture du lecteur.
function echantillonner() {
  if (!L) return;
  const v = L.video;
  const maintenant = performance.now();
  const ct = v.currentTime || 0;
  const h = L.horloge || (L.horloge = { pos: ct, ct, a: maintenant, fige: 0 });
  const ecoule = maintenant - h.a;
  h.a = maintenant;
  const joue = L.session && L.session.mode !== 'direct' && L.cible == null && L.aJoue && !v.paused && !v.ended && !v.seeking && v.readyState >= 3;
  if (Math.abs(ct - h.ct) > 0.01) {
    h.ct = ct;
    h.pos = ct;
    h.fige = 0;
  } else if (joue) {
    h.pos += (ecoule / 1000) * (v.playbackRate || 1);
    h.fige += ecoule;
    if (!L.horlogeLecteur && h.fige >= 3000) {
      L.horlogeLecteur = true;
      const d = Number.isFinite(v.duration) ? `${Math.round(v.duration * 10) / 10} s` : String(v.duration);
      signaler(`heure de la vidéo figée à ${Math.round(ct * 10) / 10} s du flux (durée vue ${d}), horloge du lecteur utilisée`);
    }
  }
  if (L.horlogeLecteur) avancer();
  // Saut coincé plus de 10 s (lecture directe) : on relance au même endroit.
  if (v.seeking && !v.paused && L.cible == null) {
    L.sautCoince = (L.sautCoince || 0) + ecoule;
    if (L.sautCoince > 10_000) {
      L.sautCoince = 0;
      signaler('saut coincé, flux relancé');
      reprendreFlux(t('Lecture bloquée : reprise…'));
    }
  } else L.sautCoince = 0;
}

// Démarre (ou redémarre) la lecture à « position » : nouvelle session côté serveur sauf en lecture directe.
async function demarrer(position, { forcerConversion = false } = {}) {
  if (!L) return;
  const etat = L;
  etat.attente.hidden = false;
  etat.cible = position;
  etat.aJoue = false;
  etat.horloge = null;
  clearTimeout(etat.gardeImage);
  majTemps();
  try {
    const st = etat.st && !etat.st.texte ? etat.st : null;
    const r = await api('/api/lecture', {
      method: 'POST',
      body: JSON.stringify({
        fichierId: etat.version.id,
        position,
        audio: etat.audio,
        qualite: forcerConversion ? String(Math.min(etat.caps.debitMax, 20)) : etat.qualite,
        caps: forcerConversion ? { ...etat.caps, hevc: false, hevc10: false, ac3: false, eac3: false } : etat.caps,
        sousTitreImage: st ? st.ordre : null,
      }),
    });
    if (L !== etat) return;
    etat.session = r;
    etat.debut = r.debut || 0;
    if (r.duree) etat.duree = r.duree;
    etat.total.textContent = horloge(etat.duree);
    etat.video.src = r.url;
    if (r.mode === 'direct' && position > 0) {
      etat.video.addEventListener('loadedmetadata', () => (etat.video.currentTime = position), { once: true });
    }
    etat.cible = null;
    // Sous-titres image incrustés qui ne démarrent pas (piste illisible ou presque vide : la conversion attend
    // une image qui ne vient pas) : au bout de 25 s, on relance sans eux plutôt que de rester bloqué.
    if (st) {
      etat.gardeImage = setTimeout(() => {
        if (L !== etat || etat.aJoue || !etat.st || etat.st.texte) return;
        const p = tempsActuel();
        etat.st = null;
        message(t('Ces sous-titres image ne démarrent pas sur ce fichier : lecture sans sous-titres. Choisis plutôt une piste texte.'), true);
        demarrer(p);
      }, 25_000);
    }
    await etat.video.play().catch(() => {});
    if (etat.st?.texte) chargerSousTitres();
    else afficherSousTitres('');
  } catch (e) {
    if (L === etat) message(e.message, true);
  }
}

// Reprend le flux là où il s'est arrêté (5 fois de suite au plus).
function reprendreFlux(texte) {
  if (!L) return;
  L.coupures = (L.coupures || 0) + 1;
  if (L.coupures > 5) return message(t('Lecture interrompue : vérifie la connexion du PC.'), true);
  message(texte);
  demarrer(tempsActuel());
}

function erreurVideo() {
  if (!L || !L.session) return;
  const code = L.video.error?.code;
  if (code === 2) return reprendreFlux(t('Connexion interrompue : reprise…')); // erreur réseau
  // Le navigateur ne lit finalement pas ce flux (codec annoncé mais refusé) : on repasse en conversion H.264.
  if (L.essais < 1 && code !== 1) {
    L.essais++;
    message(t('Format non lu par cet appareil : conversion en cours…'));
    return demarrer(tempsActuel(), { forcerConversion: true });
  }
  message(t('Lecture impossible ({code}).', { code: code || '?' }), true);
}

// Avancer / reculer. Plusieurs appuis rapides s'additionnent, le flux n'est relancé qu'une fois.
function sauter(delta) {
  if (!L) return;
  const base = L.cible ?? tempsActuel();
  allerA(Math.min(Math.max(0, base + delta), Math.max(0, L.duree - 2)), { differe: true });
}

// À la télécommande : un appui = 10 s. En restant appuyé (ou en enchaînant les appuis), le pas grandit :
// 30 s au bout de 3 s, 1 min au bout de 6 s, 2 min au bout de 10 s. Une heure se parcourt en une quinzaine de secondes.
const PALIERS_SAUT = [[10_000, 120], [6_000, 60], [3_000, 30]];
let rafale = null; // { sens, debut, dernier, traite }
function sauterEnRafale(sens, base = 10) {
  if (!L) return;
  const maintenant = performance.now();
  if (!rafale || rafale.sens !== sens || maintenant - rafale.dernier > 700) rafale = { sens, debut: maintenant, dernier: 0, traite: 0 };
  rafale.dernier = maintenant;
  // Touche tenue : la télé répète la touche à sa vitesse ; 6 sauts par seconde au plus, pour que l'avance
  // ne dépende pas de l'appareil (et reste lisible).
  if (rafale.traite && maintenant - rafale.traite < 150) return;
  rafale.traite = maintenant;
  const pas = Math.max(base, PALIERS_SAUT.find(([ms]) => maintenant - rafale.debut >= ms)?.[1] || 0);
  L.pasSaut = pas > 10 ? sens * pas : 0;
  sauter(sens * pas);
}
const textePas = (s) => `${s > 0 ? '+' : '−'}${Math.abs(s) >= 60 ? `${Math.abs(s) / 60} min` : `${Math.abs(s)} s`}`;
function allerA(position, { differe = false } = {}) {
  if (!L) return;
  clearTimeout(L.attenteSaut);
  L.cible = position;
  L.el.classList.add('saut');
  majTemps();
  montrerControles();
  const agir = () => {
    if (!L) return;
    L.el.classList.remove('saut');
    L.pasSaut = 0;
    if (L.session?.mode === 'direct') {
      L.video.currentTime = position;
      L.cible = null;
      verifierCouvertureSt();
    } else {
      // Flux converti ou repaqueté : il ne se parcourt pas (pas de « Range »), même un petit saut le relance à
      // la bonne position. Se déplacer dans ce qui était déjà chargé ramenait Chrome au début du flux et figeait
      // l'heure des télés Samsung (barre bloquée, mauvaise reprise, fin du film prise pour une coupure).
      demarrer(position);
    }
  };
  if (differe) L.attenteSaut = setTimeout(agir, 650);
  else agir();
}

// Note dans le journal du PC ce que le lecteur a dû rattraper (10 fois par vidéo au plus).
function signaler(quoi, position = tempsActuel()) {
  if (!L || (L.signalements = (L.signalements || 0) + 1) > 10) return;
  api('/api/lecture/journal', { method: 'POST', body: JSON.stringify({ quoi, position, mode: L.session?.mode, tele: L.caps.tele }) }).catch(() => {});
}

function basculerLecture() {
  if (!L) return;
  if (L.video.paused) L.video.play().catch(() => {});
  else L.video.pause();
}
function majBoutonLecture() {
  if (!L) return;
  L.lecture.innerHTML = L.video.paused ? ICONES_LC.lecture : ICONES_LC.pause;
}
function basculerPleinEcran() {
  if (!document.fullscreenEnabled) return;
  if (document.fullscreenElement) document.exitFullscreen();
  else L?.el.requestFullscreen?.().catch(() => {});
}

function majTemps() {
  if (!L) return;
  const p = tempsActuel();
  const r = L.duree ? Math.min(1, p / L.duree) : 0;
  L.fait.style.width = `${r * 100}%`;
  L.curseur.style.left = `${r * 100}%`;
  L.actuel.textContent = horloge(p);
  L.barre.setAttribute('aria-valuetext', `${horloge(p)} / ${horloge(L.duree)}`);
  if (L.cible != null) {
    L.bulle.textContent = horloge(p);
    if (L.pasSaut) L.bulle.append(element('small', '', textePas(L.pasSaut)));
    L.bulle.style.left = `${r * 100}%`;
  }
  const b = L.video.buffered;
  if (b.length && L.duree) {
    const fin = (L.session?.mode === 'direct' ? 0 : L.debut) + b.end(b.length - 1);
    L.tampon.style.width = `${Math.min(100, (fin / L.duree) * 100)}%`;
  }
  majHeure();
}

// Heure actuelle et heure de fin (texte touché seulement quand la minute change).
function majHeure() {
  if (!L) return;
  const maintenant = heureDans(0);
  const fin = L.duree ? texteFin((L.duree - tempsActuel()) / (L.video.playbackRate || 1)) : '';
  if (L.heureMaintenant.textContent !== maintenant) L.heureMaintenant.textContent = maintenant;
  if (L.heureFin.textContent !== fin) L.heureFin.textContent = fin;
}

let minuterieControles = null;
function montrerControles(garder = false) {
  if (!L) return;
  L.el.classList.add('controles-visibles');
  clearTimeout(minuterieControles);
  if (!garder) planifierMasquage();
}
function planifierMasquage() {
  clearTimeout(minuterieControles);
  minuterieControles = setTimeout(() => {
    if (!L || L.video.paused || L.menu || L.el.querySelector('.lc-suivant')) return;
    L.el.classList.remove('controles-visibles');
    if (L.el.contains(document.activeElement) && document.activeElement !== L.el) document.activeElement.blur();
  }, document.body.classList.contains('grand') ? 6000 : 3500);
}

function message(texte, erreur = false) {
  if (!L) return;
  L.el.querySelector('.lc-message')?.remove();
  const m = element('div', `lc-message${erreur ? ' ko' : ''}`, texte);
  L.el.append(m);
  if (erreur) L.attente.hidden = true;
  setTimeout(() => m.remove(), erreur ? 8000 : 4000);
}

// ---------- menus : audio, sous-titres, qualité ----------

function fermerMenu() {
  if (!L?.menu) return;
  const { bouton } = L.menu;
  L.menu.el.remove();
  L.menu = null;
  bouton?.focus({ preventScroll: true });
  planifierMasquage();
}
function ouvrirMenu(nom, bouton) {
  if (!L) return;
  if (L.menu?.nom === nom) return fermerMenu();
  fermerMenu();
  const m = element('div', 'lc-menu');
  m.setAttribute('role', 'menu');
  const choix = (texte, coche, action, detail = '') => {
    const b = element('button', '', texte);
    b.type = 'button';
    b.setAttribute('role', 'menuitemradio');
    b.setAttribute('aria-checked', String(!!coche));
    if (detail) b.append(element('small', '', detail));
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      action();
      fermerMenu();
    });
    return b;
  };
  const position = () => tempsActuel();
  if (nom === 'audio') {
    m.append(element('h3', '', t('Audio')));
    for (const a of L.version.audios)
      m.append(
        choix(a.nom, a.ordre === L.audio, () => {
          if (a.ordre === L.audio) return;
          L.audio = a.ordre;
          ecrirePrefs({ audio: estFrancais(a.langue) ? 'fr' : a.langue ? a.langue.slice(0, 2) : 'vo' });
          demarrer(position());
        }, a.titre && !a.nom.includes(a.titre) ? a.titre : ''),
      );
  } else if (nom === 'st') {
    m.append(element('h3', '', t('Sous-titres')));
    m.append(
      choix(t('Aucun'), !L.st, () => {
        const avait = L.st;
        L.st = null;
        ecrirePrefs({ st: 'non' });
        afficherSousTitres('');
        if (avait && !avait.texte) demarrer(position());
      }),
    );
    // Pistes texte d'abord (affichées tout de suite), puis les pistes image (la vidéo est convertie pour les incruster).
    const pistes = L.version.sousTitres.filter((s) => !s.vide);
    for (const s of [...pistes.filter((x) => x.texte), ...pistes.filter((x) => !x.texte)])
      m.append(
        // « image » est dit à droite (« incrustés (conversion) ») : pas deux fois.
        choix(s.texte ? s.nom : s.nom.replace(/ · image(?= · \d+$|$)/, ''), L.st &&(s.index ?? `ext${s.externe}`) === (L.st.index ?? `ext${L.st.externe}`), () => {
          const avant = L.st;
          L.st = s;
          L.cues = [];
          L.cuesComplet = true;
          afficherSousTitres('');
          if (estFrancais(s.langue)) ecrirePrefs({ st: s.force ? 'auto' : 'fr' });
          if (!s.texte || (avant && !avant.texte)) demarrer(position());
          else chargerSousTitres();
        }, s.texte ? '' : t('incrustés (conversion)')),
      );
  } else if (nom === 'qualite') {
    m.append(element('h3', '', t('Qualité')));
    for (const [v, texte] of QUALITES)
      m.append(
        choix(t(texte), v === L.qualite, () => {
          L.qualite = v;
          ecrirePrefs({ qualite: v });
          demarrer(position());
        }, v === 'auto' ? t('selon l\'appareil et le réseau') : ''),
      );
    if (L.versions.length > 1) {
      m.append(element('div', 'sep'), element('h3', '', t('Fichier')));
      for (const v of L.versions)
        m.append(
          choix([v.resume, v.langue].filter(Boolean).join(' · '), v.id === L.version.id, () => {
            const p = position();
            L.version = v;
            L.audio = choisirAudio(v, lirePrefs());
            L.st = choisirSousTitres(v, L.audio, lirePrefs());
            L.duree = v.duree || L.duree;
            demarrer(p);
          }, `${(v.taille / 1e9).toFixed(1)} ${t('Go')}`),
        );
    }
    if (L.session) {
      const infos = element('div', 'lc-infos');
      infos.textContent = [L.session.details, ...(L.session.raisons || [])].filter(Boolean).join(' · ');
      m.append(element('div', 'sep'), infos);
    }
  }
  L.el.append(m);
  L.menu = { nom, el: m, bouton };
  montrerControles(true);
  requestAnimationFrame(() => (m.querySelector('[aria-checked="true"]') || m.querySelector('button'))?.focus({ preventScroll: true }));
}

// ---------- sous-titres ----------

// Piste pas encore préparée sur le PC : il l'extrait à partir de la position regardée (« depuis ») et renvoie
// ce qu'il a déjà lu (à partir de X-Debut) ; on redemande la suite toutes les quelques secondes, et tout de
// suite après un saut hors de ce qui est couvert.
async function chargerSousTitres() {
  if (!L?.st?.texte) return;
  const etat = L;
  const piste = L.st.index != null ? L.st.index : `ext${L.st.externe}`;
  clearTimeout(etat.minuterieSt);
  const depuis = Math.floor(tempsActuel());
  try {
    const r = await fetch(`/api/soustitres/${etat.version.id}/${piste}.vtt?depuis=${depuis}`, { cache: 'no-store' });
    if (!r.ok) throw new Error(String(r.status));
    const texte = await r.text();
    if (L !== etat || (etat.st?.index ?? `ext${etat.st?.externe}`) !== piste) return;
    etat.cues = lireVtt(texte);
    etat.cuesComplet = r.headers.get('X-Complet') !== '0';
    etat.cuesDebut = etat.cuesComplet ? 0 : Number(r.headers.get('X-Debut')) || 0;
    const auBout = r.headers.get('X-Fin') === '1';
    etat.cuesFin = etat.cuesComplet || auBout ? Infinity : etat.cues.length ? etat.cues[etat.cues.length - 1].fin : etat.cuesDebut;
    etat.essaisSt = 0;
    // Extraction en cours sur le PC : on redemande la suite régulièrement.
    if (!etat.cuesComplet) etat.minuterieSt = setTimeout(chargerSousTitres, auBout ? 15000 : etat.cues.length ? 5000 : 2000);
    majSousTitres();
  } catch {
    // PC injoignable un instant : on réessaie (de plus en plus espacé), sans effacer ce qui est déjà affiché.
    if (L !== etat) return;
    etat.essaisSt = (etat.essaisSt || 0) + 1;
    etat.minuterieSt = setTimeout(chargerSousTitres, Math.min(30000, 2000 * etat.essaisSt));
  }
}
// Après un saut : si la nouvelle position n'est pas couverte par ce qui a été reçu, on redemande tout de suite.
function verifierCouvertureSt() {
  if (!L?.st?.texte || L.cuesComplet) return;
  const p = tempsActuel();
  if (p < (L.cuesDebut || 0) || p > (L.cuesFin ?? 0) + 30) chargerSousTitres();
}
function majSousTitres() {
  if (!L) return;
  if (!L.st?.texte || !L.cues.length) return afficherSousTitres('');
  const p = tempsActuel();
  let bas = 0;
  let haut = L.cues.length - 1;
  while (bas <= haut) {
    const m = (bas + haut) >> 1;
    if (L.cues[m].debut <= p) bas = m + 1;
    else haut = m - 1;
  }
  const actifs = [];
  for (let i = haut; i >= 0 && i > haut - 6; i--) if (L.cues[i].debut <= p && L.cues[i].fin > p) actifs.unshift(L.cues[i].texte);
  afficherSousTitres(actifs.join('\n'));
}
function afficherSousTitres(texte) {
  if (!L) return;
  if (L.stEl.dataset.texte === texte) return;
  L.stEl.dataset.texte = texte;
  L.stEl.replaceChildren();
  if (texte) L.stEl.append(element('span', '', texte));
}

// ---------- fin, épisode suivant, historique ----------

function verifierFin() {
  if (!L || L.suivantPropose || !L.duree) return;
  const reste = L.duree - tempsActuel();
  const s = L.suivant?.();
  if (!s || reste > 25 || reste < 0) return;
  L.suivantPropose = true;
  const carte = element('div', 'lc-suivant');
  if (s.image) {
    const img = new Image();
    img.alt = '';
    img.src = s.image;
    carte.append(img);
  }
  carte.append(element('strong', '', `${t('Épisode suivant')} · ${t('S{s} É{e}', { s: s.saison, e: s.numero })}`), element('span', 'aide', s.titre));
  const pied = element('div', 'ep-pied');
  const go = element('button', 'bouton principal', t('Lire maintenant'));
  go.type = 'button';
  go.addEventListener('click', () => lireSuivant());
  const non = element('button', 'bouton', t('Masquer'));
  non.type = 'button';
  non.addEventListener('click', () => {
    carte.remove();
    planifierMasquage();
  });
  pied.append(non, go);
  carte.append(pied);
  L.el.append(carte);
  montrerControles(true);
  requestAnimationFrame(() => go.focus({ preventScroll: true }));
}

function lireSuivant() {
  if (!L) return;
  const s = L.suivant?.();
  if (!s) return;
  sauverPosition(true, true);
  const lancer = L.lireSuivant;
  fermerLecteur({ historique: false, sauver: false, garderEtat: true });
  lancer(s);
}

async function sauverPosition(force = false, fini = false) {
  if (!L || !jetonProfil || !L.duree) return;
  const p = fini ? L.duree : tempsActuel();
  if (!force && p < 5) return;
  L.derniereSauvegarde = Date.now();
  try {
    await api('/api/historique/position', { method: 'POST', body: JSON.stringify({ cle: L.cleLecture, position: p, duree: L.duree, fichier: L.version.id }) });
  } catch {}
}

function fermerLecteur({ historique = true, sauver = true, garderEtat = false } = {}) {
  if (!L) return;
  if (sauver) sauverPosition(true);
  const { el, video, depuis } = L;
  clearTimeout(L.minuterieSt);
  clearTimeout(L.attenteSaut);
  clearTimeout(L.surveillance);
  clearTimeout(L.gardeImage);
  clearInterval(L.surveillancePosition);
  clearInterval(L.minuterieHeure);
  clearTimeout(minuterieControles);
  video.pause();
  video.removeAttribute('src');
  video.load(); // coupe le flux : le serveur arrête ffmpeg
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  el.remove();
  L = null;
  document.body.classList.remove('lecture-ouverte');
  if (historique && history.state?.debrideur === 'lecteur') {
    ignorerRetourLecteur = true;
    history.back();
  }
  if (garderEtat) return;
  if (depuis?.isConnected) depuis.focus({ preventScroll: true });
  setTimeout(() => {
    if (typeof rechargerFiche === 'function') rechargerFiche();
    if (typeof majRangeesPerso === 'function') majRangeesPerso();
  }, 400);
}

// ---------- clavier et télécommande ----------

let ignorerRetourLecteur = false;
const TOUCHES_MEDIA = { 10252: 'pp', 415: 'lecture', 19: 'pause', 413: 'stop', 417: 'avance', 412: 'recul', 10233: 'suivant', 10232: 'precedent' };
document.addEventListener(
  'keydown',
  (e) => {
    if (!L) return;
    const actif = document.activeElement;
    const media = TOUCHES_MEDIA[e.keyCode] || { MediaPlayPause: 'pp', MediaPlay: 'lecture', MediaPause: 'pause', MediaStop: 'stop', MediaFastForward: 'avance', MediaRewind: 'recul', MediaTrackNext: 'suivant' }[e.key];
    const stop = () => {
      e.preventDefault();
      e.stopPropagation();
    };
    if (media) {
      stop();
      montrerControles();
      if (media === 'pp') basculerLecture();
      else if (media === 'lecture') L.video.play().catch(() => {});
      else if (media === 'pause') L.video.pause();
      else if (media === 'stop') fermerLecteur();
      else if (media === 'avance') sauterEnRafale(1, 30);
      else if (media === 'recul') sauterEnRafale(-1, 30);
      else if (media === 'suivant') lireSuivant();
      return;
    }
    const retour = e.key === 'Escape' || e.key === 'GoBack' || e.key === 'BrowserBack' || e.keyCode === 461 || e.keyCode === 10009 || e.key === 'Backspace';
    if (retour) {
      stop();
      if (L.menu) return fermerMenu();
      if (document.fullscreenElement && e.key === 'Escape') return;
      return fermerLecteur();
    }
    if (e.key === ' ' || e.key === 'k') {
      stop();
      montrerControles();
      return basculerLecture();
    }
    if (e.key === 'f') {
      stop();
      return basculerPleinEcran();
    }
    const visibles = L.el.classList.contains('controles-visibles');
    const dansMenu = L.menu && L.menu.el.contains(actif);
    if (dansMenu) {
      // Haut / bas dans la liste du menu.
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        stop();
        const items = [...L.menu.el.querySelectorAll('button')];
        const i = items.indexOf(actif);
        items[Math.min(items.length - 1, Math.max(0, i + (e.key === 'ArrowDown' ? 1 : -1)))]?.focus();
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') stop();
      return;
    }
    const surBarre = actif === L.barre;
    const rienDeChoisi = !L.el.contains(actif) || actif === L.el || !visibles;
    if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && (surBarre || rienDeChoisi)) {
      stop();
      sauterEnRafale(e.key === 'ArrowRight' ? 1 : -1);
      if (rienDeChoisi && !surBarre) L.barre.focus({ preventScroll: true });
      return;
    }
    // Boutons affichés : haut / bas passe par la barre de lecture (elle n'est pas un bouton, la navigation
    // générale de la page ne la voit pas) : boutons du bas ↔ barre ↔ Retour en haut.
    if (visibles && !rienDeChoisi && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      const enBas = L.el.querySelector('.lc-boutons')?.contains(actif);
      const enHaut = L.el.querySelector('.lc-haut')?.contains(actif);
      let vers = null;
      if (enBas && e.key === 'ArrowUp') vers = L.barre;
      else if (enHaut && e.key === 'ArrowDown') vers = L.barre;
      else if (surBarre) vers = e.key === 'ArrowUp' ? L.el.querySelector('.lc-haut .lc-bouton') : L.dernierBouton?.isConnected ? L.dernierBouton : L.lecture;
      if (vers) {
        stop();
        if (enBas) L.dernierBouton = actif;
        montrerControles();
        vers.focus({ preventScroll: true });
        return;
      }
    }
    if (e.key === 'Enter' && rienDeChoisi) {
      stop();
      montrerControles();
      basculerLecture();
      L.lecture.focus({ preventScroll: true });
      return;
    }
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      if (!visibles || rienDeChoisi) {
        stop();
        montrerControles();
        (e.key === 'ArrowDown' ? L.lecture : L.barre).focus({ preventScroll: true });
        return;
      }
    }
    montrerControles();
    // Le reste (flèches entre les boutons, OK sur un bouton) : navigation normale de la page, limitée au lecteur.
  },
  true,
);

// Retour du navigateur / du téléphone : true si le lecteur était ouvert.
function retourLecteur({ depuisHistorique = false } = {}) {
  if (depuisHistorique && ignorerRetourLecteur) {
    ignorerRetourLecteur = false;
    return true;
  }
  if (!L) return false;
  fermerLecteur({ historique: !depuisHistorique });
  return true;
}
