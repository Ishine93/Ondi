# Débrideur

**Your home media hub.** Search a site you choose, download through AllDebrid at full speed, and watch everything in a Prime-Video-style library on your **PC, phone and TV** — with profiles, resume playback and a player that adapts to each device.

[Français plus bas ↓](#français)

## What it does

- **Search & download** — searches the site you set, groups every version (language, quality, season), checks which links are alive, and downloads through your AllDebrid account, many files at once.
- **Library** — your movies and shows sorted automatically, with posters, summaries, cast and episode titles (TMDB), in English or French.
- **Player** — plays everything on any screen: the server converts on the fly when a device cannot read a file (4K HDR, DTS, Dolby…) using your graphics card (NVIDIA, Intel, AMD, Apple) when there is one. Audio tracks, subtitles, quality, resume, next episode.
- **Profiles** — "Who's watching?" screen, avatars, optional password, separate history for everyone.
- **TV apps** — Samsung, LG, Android TV / Google TV, Fire TV; remote-control friendly everywhere.
- **Automatic updates** — Débrideur tells you when a new version is out and installs it in one click.

## How it works

Débrideur runs on **one computer at home** (Windows PC, Mac or a mini-PC/NUC) — that's the *server*. Your phone, tablet and TVs just open it over your home network; they install nothing heavy and keep no copy of your files.

## Requirements

- Windows 10/11 (64-bit) or macOS 12+ (Apple Silicon or Intel).
- An **AllDebrid** premium account (for downloads).
- Optional: a free **TMDB** account (posters and summaries), a graphics card (faster conversions).
- About 400 MB for the tools, plus space for your videos.

## Install

**Windows**
1. Download `Debrideur-Windows-<version>.zip` from the [latest release](https://github.com/Ishine93/Debrideur/releases/latest).
2. Unzip it somewhere simple, for example `C:\Debrideur`.
3. Double-click **`installer.bat`**. It downloads Node.js and ffmpeg into the Débrideur folder (checked with their fingerprints), creates the shortcuts, and can open the firewall for your phone and TV.

**Mac**
1. Download `Debrideur-Mac-<version>.zip` from the [latest release](https://github.com/Ishine93/Debrideur/releases/latest) and unzip it (for example in your home folder).
2. **Right-click `installer.command` → Open** (the first time macOS asks for confirmation), then follow the window.

**First launch:** a setup wizard asks for the language, your AllDebrid key, the folders for movies, TV shows and anime (a folder picker is included), your search site, and your TMDB key — every step can be done later in **Settings**.

## Phone and TV

- **Phone / tablet:** open the address shown in **Settings → Phone and TV** (e.g. `http://192.168.1.50:8097`) in the browser, then *Add to Home Screen*.
- **TV:** download the package for your TV from the [latest release](https://github.com/Ishine93/Debrideur/releases/latest); each one contains the app, a step-by-step README, install scripts and a ready-made prompt to get help from an AI assistant.

| TV | Package |
|---|---|
| Samsung (Tizen) | `Debrideur-TV-Samsung-<version>.zip` |
| LG (webOS) | `Debrideur-TV-LG-<version>.zip` |
| Android TV / Google TV (Sony, Philips, TCL, Xiaomi, Shield, Chromecast with Google TV…) | `Debrideur-TV-AndroidTV-<version>.zip` |
| Amazon Fire TV | `Debrideur-TV-FireTV-<version>.zip` |
| Other TVs, Xbox, Apple TV (AirPlay), old Chromecast… | `Debrideur-TV-Autres-<version>.zip` |

The TV apps find the server on the network by themselves.

## Updates

Each time Débrideur opens, it checks GitHub for a new version and offers to install it; you can also use **Settings → Check for updates**. Your settings, profiles, history and downloads are kept. TV and phone screens update with the server.

## Your data and privacy

- Settings and API keys stay in the `donnees` folder of your Débrideur; profiles and watch history in `%APPDATA%\Debrideur` (Windows) or `~/Library/Application Support/Debrideur` (Mac). Nothing is sent anywhere except: AllDebrid (downloads), your search site, TMDB (movie info), Apple's public charts (home page), GitHub (update check) and DiceBear (avatars, downloaded once).
- Débrideur only accepts connections from your local network.

## Uninstall

Close Débrideur (**Settings → Stop Débrideur**), delete its folder and its shortcuts, and optionally the profiles folder above. On Windows you can remove the firewall rule "Débrideur"; on Mac the login item `~/Library/LaunchAgents/io.github.ishine93.debrideur.plist`.

## Troubleshooting

- **The page does not open:** start Débrideur from its shortcut; its log is `donnees/debrideur.log`.
- **Phone or TV cannot connect:** same network? On Windows allow Node.js on *private* networks (or rerun `installer.bat`).
- **Video stutters on the TV:** in the player choose *Quality → 40 Mbit/s* or lower (Wi-Fi is often the limit for big 4K files).

## For developers

Node.js 22+ and no dependencies. `node lancer.mjs` starts the server (port 8097), `node --test tests/` runs the tests, `node outils/construire-paquets.mjs` builds the packages. Pushing a tag `vX.Y.Z` makes GitHub Actions build the TV apps and publish the release.

*Débrideur does not host or provide any content. Only download what you have the right to.*

---

## Français

# Débrideur

**Ton centre multimédia à la maison.** Cherche sur le site de ton choix, télécharge à pleine vitesse avec AllDebrid, et regarde tout dans une bibliothèque façon Prime Video sur ton **PC, ton téléphone et ta télé** — avec des profils, la reprise de lecture et un lecteur qui s'adapte à chaque appareil.

### Ce qu'il fait

- **Recherche et téléchargement** — cherche sur le site que tu as choisi, regroupe toutes les versions (langue, qualité, saison), vérifie les liens encore en ligne et télécharge avec ton compte AllDebrid, plusieurs fichiers à la fois.
- **Bibliothèque** — tes films et séries rangés tout seuls, avec affiches, résumés, casting et titres d'épisodes (TMDB), en français ou en anglais.
- **Lecteur** — lit tout sur n'importe quel écran : le serveur convertit à la volée quand un appareil ne sait pas lire un fichier (4K HDR, DTS, Dolby…), avec ta carte graphique (NVIDIA, Intel, AMD, Apple) s'il y en a une. Pistes audio, sous-titres, qualité, reprise, épisode suivant.
- **Profils** — écran « Qui regarde ? », avatars, mot de passe facultatif, historique séparé pour chacun.
- **Applis télé** — Samsung, LG, Android TV / Google TV, Fire TV ; tout se pilote à la télécommande.
- **Mises à jour automatiques** — le Débrideur te prévient quand une nouvelle version sort et l'installe en un clic.

### Comment ça marche

Le Débrideur tourne sur **un ordinateur de la maison** (PC Windows, Mac ou mini-PC/NUC) : c'est le *serveur*. Le téléphone, la tablette et les télés l'ouvrent simplement par le réseau de la maison ; ils n'installent rien de lourd et ne gardent aucune copie de tes fichiers.

### Ce qu'il faut

- Windows 10/11 (64 bits) ou macOS 12+ (Apple Silicon ou Intel).
- Un compte **AllDebrid** premium (pour les téléchargements).
- Facultatif : un compte **TMDB** gratuit (affiches et résumés), une carte graphique (conversions plus rapides).
- Environ 400 Mo pour les outils, plus la place pour tes vidéos.

### Installer

**Windows**
1. Télécharge `Debrideur-Windows-<version>.zip` depuis la [dernière version](https://github.com/Ishine93/Debrideur/releases/latest).
2. Décompresse-le dans un dossier simple, par exemple `C:\Debrideur`.
3. Double-clique sur **`installer.bat`**. Il télécharge Node.js et ffmpeg dans le dossier du Débrideur (vérifiés par leur empreinte), crée les raccourcis et peut ouvrir le pare-feu pour le téléphone et la télé.

**Mac**
1. Télécharge `Debrideur-Mac-<version>.zip` depuis la [dernière version](https://github.com/Ishine93/Debrideur/releases/latest) et décompresse-le (par exemple dans ton dossier personnel).
2. **Clic droit sur `installer.command` → Ouvrir** (la première fois, macOS demande confirmation), puis suis la fenêtre.

**Premier lancement :** un assistant demande la langue, ta clé AllDebrid, les dossiers des films, séries et mangas (avec un sélecteur de dossiers), ton site de recherche et ta clé TMDB — chaque étape peut se faire plus tard dans les **Réglages**.

### Téléphone et télé

- **Téléphone / tablette :** ouvre l'adresse affichée dans **Réglages → Téléphone et télé** (ex. `http://192.168.1.50:8097`) dans le navigateur, puis *Ajouter à l'écran d'accueil*.
- **Télé :** télécharge le paquet de ta télé depuis la [dernière version](https://github.com/Ishine93/Debrideur/releases/latest) ; chacun contient l'appli, un mode d'emploi pas à pas, des scripts d'installation et un texte prêt à coller pour se faire aider par une IA.

| Télé | Paquet |
|---|---|
| Samsung (Tizen) | `Debrideur-TV-Samsung-<version>.zip` |
| LG (webOS) | `Debrideur-TV-LG-<version>.zip` |
| Android TV / Google TV (Sony, Philips, TCL, Xiaomi, Shield, Chromecast avec Google TV…) | `Debrideur-TV-AndroidTV-<version>.zip` |
| Amazon Fire TV | `Debrideur-TV-FireTV-<version>.zip` |
| Autres télés, Xbox, Apple TV (AirPlay), ancienne Chromecast… | `Debrideur-TV-Autres-<version>.zip` |

Les applis télé trouvent le serveur toutes seules sur le réseau.

### Mises à jour

À chaque ouverture, le Débrideur regarde sur GitHub s'il existe une nouvelle version et propose de l'installer ; tu peux aussi passer par **Réglages → Vérifier les mises à jour**. Réglages, profils, historique et téléchargements sont gardés. Les écrans de la télé et du téléphone se mettent à jour avec le serveur.

### Tes données

- Les réglages et clés restent dans le dossier `donnees` du Débrideur ; les profils et l'historique dans `%APPDATA%\Debrideur` (Windows) ou `~/Library/Application Support/Debrideur` (Mac). Rien n'est envoyé ailleurs, sauf : AllDebrid (téléchargements), ton site de recherche, TMDB (infos des films), les classements publics d'Apple (accueil), GitHub (vérification des mises à jour) et DiceBear (avatars, téléchargés une fois).
- Le Débrideur n'accepte que les connexions de ton réseau local.

### Désinstaller

Ferme le Débrideur (**Réglages → Arrêter le Débrideur**), supprime son dossier et ses raccourcis, et si tu veux le dossier des profils ci-dessus. Sous Windows tu peux retirer la règle de pare-feu « Débrideur » ; sur Mac le lancement à l'ouverture de session `~/Library/LaunchAgents/io.github.ishine93.debrideur.plist`.

### En cas de souci

- **La page ne s'ouvre pas :** lance le Débrideur depuis son raccourci ; son journal est `donnees/debrideur.log`.
- **Le téléphone ou la télé ne se connecte pas :** même réseau ? Sous Windows, autorise Node.js sur les réseaux *privés* (ou relance `installer.bat`).
- **La vidéo saccade sur la télé :** dans le lecteur, choisis *Qualité → 40 Mbit/s* ou moins (le Wi-Fi est souvent la limite pour les gros fichiers 4K).

### Pour les développeurs

Node.js 22+ et aucune dépendance. `node lancer.mjs` démarre le serveur (port 8097), `node --test tests/` lance les tests, `node outils/construire-paquets.mjs` fabrique les paquets. Pousser une étiquette `vX.Y.Z` fait construire les applis télé et publier la version par GitHub Actions.

*Le Débrideur n'héberge ni ne fournit aucun contenu. Ne télécharge que ce que tu as le droit de télécharger.*
