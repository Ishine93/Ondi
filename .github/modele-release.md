**Your home media hub:** search a site you choose, download through AllDebrid at full speed, and watch everything in a Prime-Video-style library on your **PC, phone and TV**.

*English first · Version française plus bas*

## English
{{NOUVEAUTES_EN}}

## English · Download and install

### What Ondi does

- **Search & download**: searches the site you set, groups every version (language, quality, season), checks which links are alive and downloads through your AllDebrid account, several files at once.
- **Library**: movies, TV shows and anime sorted automatically, with posters, summaries, cast and episode titles (TMDB), in English or French.
- **Player for every screen**: audio tracks, subtitles, quality, resume where you stopped, next episode. When a device cannot read a file (4K HDR, DTS, Dolby…), the server converts it on the fly with your graphics card (NVIDIA, Intel, AMD, Apple).
- **Profiles**: "Who's watching?" screen, avatars, optional password, separate history for everyone.
- **TV apps**: Samsung, LG, Android TV / Google TV and Fire TV, all made for the remote.
- **Automatic updates**: Ondi tells you when a new version is out and installs it in one click.

**How it works:** Ondi runs on **one computer at home** (Windows PC, Mac or mini-PC/NUC): that's the *server*. Phones, tablets and TVs simply open it over your home network. They install nothing heavy and keep no copy of your files.

### Which file do I need?

Install the **server first** (Windows or Mac), then the apps for your screens.

| Your device | Download | In short (details below) |
|---|---|---|
| 🪟 **Windows 10/11 PC** (server) | [`Ondi-Windows-{{VERSION}}.zip`]({{URL}}/Ondi-Windows-{{VERSION}}.zip) | Unzip, double-click `installer.bat` |
| 🍎 **Mac**, macOS 12+, Apple Silicon or Intel (server) | [`Ondi-Mac-{{VERSION}}.zip`]({{URL}}/Ondi-Mac-{{VERSION}}.zip) | Unzip, right-click `installer.command` → Open |
| 📱 **Phone / tablet** | nothing to download | Open the server address in the browser |
| 📺 **Samsung TV** (Tizen, 2017+) | [`Ondi.wgt`]({{URL}}/Ondi.wgt) or the guided package [`Ondi-TV-Samsung-{{VERSION}}.zip`]({{URL}}/Ondi-TV-Samsung-{{VERSION}}.zip) | Developer mode + Apps2Samsung |
| 📺 **LG TV** (webOS, 2020+) | [`Ondi.ipk`]({{URL}}/Ondi.ipk) or the guided package [`Ondi-TV-LG-{{VERSION}}.zip`]({{URL}}/Ondi-TV-LG-{{VERSION}}.zip) | Developer Mode + install script or webOS Dev Manager |
| 📺 **Android TV / Google TV**: Sony, Philips, TCL, Xiaomi, Hisense, Nvidia Shield, Chromecast with Google TV, Google TV Streamer… | [`Ondi.apk`]({{URL}}/Ondi.apk) or the guided package [`Ondi-TV-AndroidTV-{{VERSION}}.zip`]({{URL}}/Ondi-TV-AndroidTV-{{VERSION}}.zip) | Downloader app, Send Files to TV, USB stick or install script |
| 🔥 **Amazon Fire TV**: Stick, Stick 4K / 4K Max, Cube, TVs with Fire TV | [`Ondi.apk`]({{URL}}/Ondi.apk) or the guided package [`Ondi-TV-FireTV-{{VERSION}}.zip`]({{URL}}/Ondi-TV-FireTV-{{VERSION}}.zip) | Downloader app + the link below |
| 🖥️ **Other TVs, Xbox, Apple TV, old Chromecast** | [`Ondi-TV-Autres-{{VERSION}}.zip`]({{URL}}/Ondi-TV-Autres-{{VERSION}}.zip) | Browser, AirPlay or Cast tab |

- **`.apk`, `.wgt`, `.ipk`** are the TV apps themselves, ready to install directly (handy with the *Downloader* app or if you already know how).
- **`Ondi-TV-….zip`** packages contain the same app **plus** a step-by-step guide (`README.md`), an install script for Windows and Mac, and `PROMPT-IA.md`, a ready-made message to paste into an AI assistant (Claude, ChatGPT…) to be guided step by step.
- **`.sha256`** files are fingerprints used by the automatic update: you can ignore them.
- **`Debrideur-….zip`** and **`Debrideur.apk`** are the same files under Ondi's former name (Débrideur), so that older installations keep updating on their own: you can ignore them too.
- TV app version: **{{TELE}}**. The TV screens come from your server, so they already include everything in Ondi {{VERSION}}.

### 🪟 Windows

1. Download **`Ondi-Windows-{{VERSION}}.zip`**.
2. Right-click it → **Extract All…** into a simple folder, for example `C:\Ondi` (do not run it from inside the zip).
3. Double-click **`installer.bat`**. If Windows shows *"Windows protected your PC"*: **More info → Run anyway**.
4. The installer then:
   - downloads **Node.js** and **ffmpeg** into the Ondi folder, checked against their official fingerprints (nothing is installed in Windows itself, about 400 MB);
   - creates the **Ondi** shortcuts on the Desktop and in the Start menu, and can start Ondi with Windows;
   - asks to **open the firewall** on private networks so your phone and TV can connect (accept the admin prompt).
5. Ondi opens in your browser (`http://localhost:8097`) and the setup wizard starts.

### 🍎 Mac

1. Download **`Ondi-Mac-{{VERSION}}.zip`** and double-click it to unzip (for example into your home folder).
2. **Right-click `installer.command` → Open → Open.** macOS asks the first time because the app does not come from the App Store. If it still refuses: **System Settings → Privacy & Security → Open Anyway**.
3. The installer downloads **Node.js** and **ffmpeg** for your Mac (Apple Silicon or Intel) into the Ondi folder (checked against their fingerprints), adds a **Ondi** shortcut on the Desktop and can start Ondi when you log in.
4. If macOS asks whether *node* may accept incoming connections, choose **Allow** (needed for the phone and TV).

### 🧙 First launch

A setup wizard guides you; every step can be skipped and changed later in **Settings**:

1. **Language**: English or French.
2. **AllDebrid key**: create it at [alldebrid.fr/apikeys](https://alldebrid.fr/apikeys/) (a premium account is needed to download). It stays on your computer.
3. **Folders** for Movies, TV shows and Anime, with a built-in folder picker (you can create folders from it).
4. **Search site**: the address of the site Ondi searches.
5. **TMDB key** (free, optional): posters, summaries and cast, from [themoviedb.org/settings/api](https://www.themoviedb.org/settings/api).
6. **Phone and TV**: the address to type on your other screens (for example `http://192.168.1.50:8097`).
7. Create your **profile** and you're done.

### 📱 Phone and tablet

1. Phone and computer on the **same Wi-Fi**.
2. Open the address shown in **Settings → Phone and TV** (for example `http://192.168.1.50:8097`) in the browser.
3. Add it to the home screen to get an app icon: **Android / Chrome**: menu ⋮ → *Add to Home screen*; **iPhone / Safari**: Share button → *Add to Home Screen*.

### 📺 TV apps

The TV app is only a *window* onto your server. **It finds the server on the network by itself**. If it doesn't, type the address shown in **Settings → Phone and TV** (for example `192.168.1.50:8097`). Remote: arrows, **OK**, **Back** (twice on the home screen to quit), **red key** to change server.

#### Samsung

1. On the TV: **Apps** → type **1 2 3 4 5** with the remote → **Developer mode: On** → enter your computer's IP address → **restart the TV** (hold the power button).
2. On the computer: install **Apps2Samsung** (`installer-apps2samsung.bat` in the Samsung package does it for you), choose your TV, then **Install a file / Custom WGT** → `Ondi.wgt`. The first time, sign in to your Samsung account (it creates your signing certificate).

#### LG

1. Create a free account on [webostv.developer.lge.com](https://webostv.developer.lge.com), install the **Developer Mode** app from the LG store on the TV, sign in, turn **Dev Mode Status** on (the TV restarts), then turn **Key Server** on and note the IP address and passphrase.
2. On the computer, run `installer-sur-la-tele.bat` (Windows) or `installer-sur-la-tele.command` (Mac) from the LG package, or use [webOS Dev Manager](https://github.com/webosbrew/dev-manager-desktop/releases) → *Install* → `Ondi.ipk`.
3. ⚠️ LG's Developer Mode session expires: open the Developer Mode app now and then and press **Extend**, otherwise the TV removes the app.

#### Android TV / Google TV

- **Easiest:** install **Downloader** (by AFTVnews) from the TV's Play Store, type `https://github.com/{{DEPOT}}/releases/latest/download/Ondi.apk`, then **Install** (allow "unknown apps" for Downloader when asked).
- **Other ways:** *Send Files to TV* from an Android phone, a USB stick with a file manager, or the install script in the Android TV package (it uses USB/network debugging). All explained in the package's `README.md`.

#### Fire TV

1. **Settings → My Fire TV → About** → click the device name **7 times** to unlock **Developer Options**.
2. Install **Downloader** (orange icon), then **Developer Options → Install unknown apps → Downloader: On**.
3. In Downloader, type `https://github.com/{{DEPOT}}/releases/latest/download/Ondi.apk` → **Go** → **Install**.
4. Note: the newest **Vega OS** models (e.g. Fire TV Stick 4K Select, 2025) cannot install Android apps.

#### Other devices

TVs with a web browser, **Xbox** (Microsoft Edge), **Apple TV** (AirPlay from an iPhone, iPad or Mac), **old Chromecast** (Chrome → *Cast tab*) or any TV with HDMI: see the table in `Ondi-TV-Autres-{{VERSION}}.zip`. The **Chromecast with Google TV** and **Google TV Streamer** install the Android TV app.

### 🔄 Updates

- Each time Ondi opens, it checks for a new version and **offers to install it in one click**. You can also use **Settings → Check for updates**. Settings, profiles, history and downloads are kept.
- Phones and TVs show the new version **as soon as the server is updated**: nothing to reinstall.
- The TV app itself rarely changes. When a new one is needed, Ondi shows a message on the TV: install the new file the same way as the first time.

### ✅ Requirements

- Windows 10/11 (64-bit) or macOS 12+ for the server. It must stay on while you watch.
- An **AllDebrid** premium account to download. Optional: a free **TMDB** account, and a graphics card for faster conversions.
- About 400 MB for the tools, plus space for your videos. Phones and TVs on the same home network as the server.

### 🔒 Privacy

The packages contain no keys and no personal data. Your settings and keys stay in Ondi's `donnees` folder on your computer; profiles and history in `%APPDATA%\Debrideur` (Windows) or `~/Library/Application Support/Debrideur` (Mac). Ondi only accepts connections from your home network.

### 🆘 Need help?

Read the [README](https://github.com/{{DEPOT}}#readme), or paste the `PROMPT-IA.md` from your TV package into an AI assistant: it knows the steps and will guide you.

---

## Français
{{NOUVEAUTES_FR}}

## Français · Téléchargement et installation

### Ce que fait Ondi

- **Recherche et téléchargement** : cherche sur le site de ton choix, regroupe toutes les versions (langue, qualité, saison), vérifie quels liens sont en ligne et télécharge avec ton compte AllDebrid, plusieurs fichiers à la fois.
- **Bibliothèque** : films, séries et mangas rangés tout seuls, avec affiches, résumés, casting et titres d'épisodes (TMDB), en français ou en anglais.
- **Lecteur pour tous les écrans** : pistes audio, sous-titres, qualité, reprise là où tu t'es arrêté, épisode suivant. Quand un appareil ne sait pas lire un fichier (4K HDR, DTS, Dolby…), le serveur le convertit à la volée avec ta carte graphique (NVIDIA, Intel, AMD, Apple).
- **Profils** : écran « Qui regarde ? », avatars, mot de passe facultatif, historique séparé pour chacun.
- **Applis télé** : Samsung, LG, Android TV / Google TV et Fire TV, toutes pensées pour la télécommande.
- **Mises à jour automatiques** : Ondi te prévient quand une nouvelle version sort et l'installe en un clic.

**Comment ça marche :** Ondi tourne sur **un seul ordinateur de la maison** (PC Windows, Mac ou mini-PC/NUC) : c'est le *serveur*. Les téléphones, tablettes et télés l'ouvrent simplement par le réseau de la maison. Ils n'installent rien de lourd et ne gardent aucune copie de tes fichiers.

### Quel fichier prendre ?

Installe **d'abord le serveur** (Windows ou Mac), puis les applis de tes écrans.

| Ton appareil | À télécharger | En bref (détails plus bas) |
|---|---|---|
| 🪟 **PC Windows 10/11** (serveur) | [`Ondi-Windows-{{VERSION}}.zip`]({{URL}}/Ondi-Windows-{{VERSION}}.zip) | Décompresser, double-clic sur `installer.bat` |
| 🍎 **Mac**, macOS 12+, Apple Silicon ou Intel (serveur) | [`Ondi-Mac-{{VERSION}}.zip`]({{URL}}/Ondi-Mac-{{VERSION}}.zip) | Décompresser, clic droit sur `installer.command` → Ouvrir |
| 📱 **Téléphone / tablette** | rien à télécharger | Ouvrir l'adresse du serveur dans le navigateur |
| 📺 **Télé Samsung** (Tizen, 2017+) | [`Ondi.wgt`]({{URL}}/Ondi.wgt) ou le paquet guidé [`Ondi-TV-Samsung-{{VERSION}}.zip`]({{URL}}/Ondi-TV-Samsung-{{VERSION}}.zip) | Mode développeur + Apps2Samsung |
| 📺 **Télé LG** (webOS, 2020+) | [`Ondi.ipk`]({{URL}}/Ondi.ipk) ou le paquet guidé [`Ondi-TV-LG-{{VERSION}}.zip`]({{URL}}/Ondi-TV-LG-{{VERSION}}.zip) | Developer Mode + script d'installation ou webOS Dev Manager |
| 📺 **Android TV / Google TV** : Sony, Philips, TCL, Xiaomi, Hisense, Nvidia Shield, Chromecast avec Google TV, Google TV Streamer… | [`Ondi.apk`]({{URL}}/Ondi.apk) ou le paquet guidé [`Ondi-TV-AndroidTV-{{VERSION}}.zip`]({{URL}}/Ondi-TV-AndroidTV-{{VERSION}}.zip) | Appli Downloader, Send Files to TV, clé USB ou script d'installation |
| 🔥 **Amazon Fire TV** : Stick, Stick 4K / 4K Max, Cube, télés Fire TV | [`Ondi.apk`]({{URL}}/Ondi.apk) ou le paquet guidé [`Ondi-TV-FireTV-{{VERSION}}.zip`]({{URL}}/Ondi-TV-FireTV-{{VERSION}}.zip) | Appli Downloader + le lien plus bas |
| 🖥️ **Autres télés, Xbox, Apple TV, ancienne Chromecast** | [`Ondi-TV-Autres-{{VERSION}}.zip`]({{URL}}/Ondi-TV-Autres-{{VERSION}}.zip) | Navigateur, AirPlay ou « Caster l'onglet » |

- **`.apk`, `.wgt`, `.ipk`** : les applis télé elles-mêmes, à installer directement (pratique avec l'appli *Downloader* ou si tu sais déjà faire).
- **Les paquets `Ondi-TV-….zip`** contiennent la même appli **plus** un guide pas à pas (`README.md`), un script d'installation pour Windows et Mac, et `PROMPT-IA.md`, un message tout prêt à coller dans un assistant IA (Claude, ChatGPT…) pour être guidé étape par étape.
- **Les fichiers `.sha256`** sont des empreintes utilisées par la mise à jour automatique : tu peux les ignorer.
- **`Debrideur-….zip`** et **`Debrideur.apk`** sont les mêmes fichiers sous l'ancien nom d'Ondi (Débrideur), pour que les anciennes installations continuent de se mettre à jour toutes seules : tu peux les ignorer aussi.
- Version de l'appli télé : **{{TELE}}**. Les écrans de la télé viennent de ton serveur : ils ont déjà tout ce qu'apporte Ondi {{VERSION}}.

### 🪟 Windows

1. Télécharge **`Ondi-Windows-{{VERSION}}.zip`**.
2. Clic droit → **Extraire tout…** dans un dossier simple, par exemple `C:\Ondi` (ne le lance pas depuis l'intérieur du zip).
3. Double-clique sur **`installer.bat`**. Si Windows affiche *« Windows a protégé votre ordinateur »* : **Informations complémentaires → Exécuter quand même**.
4. L'installeur :
   - télécharge **Node.js** et **ffmpeg** dans le dossier d'Ondi, vérifiés avec leurs empreintes officielles (rien n'est installé dans Windows lui-même, environ 400 Mo) ;
   - crée les raccourcis **Ondi** sur le Bureau et dans le menu Démarrer, et peut lancer Ondi au démarrage de Windows ;
   - propose d'**ouvrir le pare-feu** sur les réseaux privés pour que ton téléphone et ta télé puissent se connecter (accepte la demande administrateur).
5. Ondi s'ouvre dans ton navigateur (`http://localhost:8097`) et l'assistant de configuration démarre.

### 🍎 Mac

1. Télécharge **`Ondi-Mac-{{VERSION}}.zip`** et double-clique dessus pour le décompresser (par exemple dans ton dossier personnel).
2. **Clic droit sur `installer.command` → Ouvrir → Ouvrir.** macOS demande la première fois, car l'appli ne vient pas de l'App Store. S'il refuse encore : **Réglages Système → Confidentialité et sécurité → Ouvrir quand même**.
3. L'installeur télécharge **Node.js** et **ffmpeg** pour ton Mac (Apple Silicon ou Intel) dans le dossier d'Ondi (vérifiés avec leurs empreintes), ajoute un raccourci **Ondi** sur le Bureau et peut lancer Ondi à l'ouverture de session.
4. Si macOS demande si *node* peut accepter les connexions entrantes, choisis **Autoriser** (nécessaire pour le téléphone et la télé).

### 🧙 Premier lancement

Un assistant te guide ; chaque étape peut être passée et changée plus tard dans les **Réglages** :

1. **Langue** : français ou anglais.
2. **Clé AllDebrid** : à créer sur [alldebrid.fr/apikeys](https://alldebrid.fr/apikeys/) (un compte premium est nécessaire pour télécharger). Elle reste sur ton ordinateur.
3. **Dossiers** Films, Séries et Mangas, avec un sélecteur de dossier intégré (tu peux y créer des dossiers).
4. **Site de recherche** : l'adresse du site sur lequel Ondi cherche.
5. **Clé TMDB** (gratuite, facultative) : affiches, résumés et casting, sur [themoviedb.org/settings/api](https://www.themoviedb.org/settings/api).
6. **Téléphone et télé** : l'adresse à taper sur tes autres écrans (par exemple `http://192.168.1.50:8097`).
7. Crée ton **profil**, c'est prêt.

### 📱 Téléphone et tablette

1. Téléphone et ordinateur sur le **même Wi-Fi**.
2. Ouvre dans le navigateur l'adresse affichée dans **Réglages → Téléphone et télé** (par exemple `http://192.168.1.50:8097`).
3. Ajoute-la à l'écran d'accueil pour avoir une icône comme une appli : **Android / Chrome** : menu ⋮ → *Ajouter à l'écran d'accueil* ; **iPhone / Safari** : bouton Partager → *Sur l'écran d'accueil*.

### 📺 Applis télé

L'appli télé n'est qu'une *fenêtre* sur ton serveur. **Elle trouve le serveur toute seule sur le réseau**. Sinon, tape l'adresse affichée dans **Réglages → Téléphone et télé** (par exemple `192.168.1.50:8097`). Télécommande : flèches, **OK**, **Retour** (deux fois sur l'accueil pour quitter), **touche rouge** pour changer de serveur.

#### Samsung

1. Sur la télé : **Applications** → tape **1 2 3 4 5** avec la télécommande → **Mode développeur : Activé** → entre l'adresse IP de ton ordinateur → **redémarre la télé** (appui long sur le bouton marche).
2. Sur l'ordinateur : installe **Apps2Samsung** (`installer-apps2samsung.bat` du paquet Samsung le fait pour toi), choisis ta télé, puis **Installer un fichier / Custom WGT** → `Ondi.wgt`. La première fois, connecte-toi à ton compte Samsung (il crée ton certificat de signature).

#### LG

1. Crée un compte gratuit sur [webostv.developer.lge.com](https://webostv.developer.lge.com), installe l'appli **Developer Mode** depuis le store LG sur la télé, connecte-toi, active **Dev Mode Status** (la télé redémarre), puis active **Key Server** et note l'adresse IP et la passphrase.
2. Sur l'ordinateur, lance `installer-sur-la-tele.bat` (Windows) ou `installer-sur-la-tele.command` (Mac) du paquet LG, ou utilise [webOS Dev Manager](https://github.com/webosbrew/dev-manager-desktop/releases) → *Install* → `Ondi.ipk`.
3. ⚠️ La session du mode développeur LG expire : ouvre l'appli Developer Mode de temps en temps et appuie sur **Extend**, sinon la télé supprime l'appli.

#### Android TV / Google TV

- **Le plus simple :** installe **Downloader** (de AFTVnews) depuis le Play Store de la télé, tape `https://github.com/{{DEPOT}}/releases/latest/download/Ondi.apk`, puis **Installer** (autorise les « applis inconnues » pour Downloader quand c'est demandé).
- **Autres façons :** *Send Files to TV* depuis un téléphone Android, une clé USB avec un gestionnaire de fichiers, ou le script d'installation du paquet Android TV (il passe par le débogage USB/réseau). Tout est expliqué dans le `README.md` du paquet.

#### Fire TV

1. **Paramètres → Ma Fire TV → À propos** → clique **7 fois** sur le nom de l'appareil pour débloquer les **Options pour les développeurs**.
2. Installe **Downloader** (icône orange), puis **Options pour les développeurs → Installer des applications inconnues → Downloader : Activé**.
3. Dans Downloader, tape `https://github.com/{{DEPOT}}/releases/latest/download/Ondi.apk` → **Go** → **Installer**.
4. Attention : les modèles récents sous **Vega OS** (par exemple Fire TV Stick 4K Select, 2025) ne peuvent pas installer d'applis Android.

#### Autres appareils

Télés avec navigateur, **Xbox** (Microsoft Edge), **Apple TV** (AirPlay depuis un iPhone, un iPad ou un Mac), **ancienne Chromecast** (Chrome → *Caster l'onglet*) ou toute télé avec HDMI : voir le tableau de `Ondi-TV-Autres-{{VERSION}}.zip`. La **Chromecast avec Google TV** et le **Google TV Streamer** installent l'appli Android TV.

### 🔄 Mises à jour

- À chaque ouverture, Ondi vérifie s'il existe une nouvelle version et **propose de l'installer en un clic**. Tu peux aussi passer par **Réglages → Vérifier les mises à jour**. Réglages, profils, historique et téléchargements sont gardés.
- Les téléphones et les télés affichent la nouvelle version **dès que le serveur est à jour** : rien à réinstaller.
- L'appli télé elle-même change rarement. Quand il en faut une nouvelle, Ondi affiche un message sur la télé : installe le nouveau fichier comme la première fois.

### ✅ Configuration requise

- Windows 10/11 (64 bits) ou macOS 12+ pour le serveur. Il doit rester allumé pendant que tu regardes.
- Un compte premium **AllDebrid** pour télécharger. Facultatif : un compte **TMDB** gratuit, et une carte graphique pour des conversions plus rapides.
- Environ 400 Mo pour les outils, plus la place pour tes vidéos. Téléphones et télés sur le même réseau que le serveur.

### 🔒 Confidentialité

Les paquets ne contiennent aucune clé ni donnée personnelle. Tes réglages et tes clés restent dans le dossier `donnees` d'Ondi, sur ton ordinateur ; les profils et l'historique dans `%APPDATA%\Debrideur` (Windows) ou `~/Library/Application Support/Debrideur` (Mac). Ondi n'accepte que les connexions de ton réseau local.

### 🆘 Besoin d'aide ?

Lis le [README](https://github.com/{{DEPOT}}#readme), ou colle le `PROMPT-IA.md` de ton paquet télé dans un assistant IA : il connaît les étapes et te guidera.
