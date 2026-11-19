# Débrideur for Android TV and Google TV

*Version française plus bas.*

This app shows your Débrideur (library, player, downloads) full screen on a TV running **Android TV or Google TV**: Sony, Philips, TCL, Xiaomi, Hisense (Android models), Nvidia Shield, Chromecast with Google TV, Google TV Streamer, and most Android TV boxes. You use it with the TV remote.

## Before you start

- The **Débrideur server must already be installed and running** on a Windows PC, a Mac or a mini-PC (NUC) at home: https://github.com/Ishine93/Debrideur
- The TV and that computer must be on the **same home network** (same box or router, Wi-Fi or cable).
- The TV app is only a window onto the server: your films and settings stay on the computer.

## What is in the zip

| File | What it is for |
|---|---|
| `Debrideur.apk` | The app itself |
| `installer-sur-la-tele.bat` | Installer for a Windows PC (double-click) |
| `installer-sur-la-tele.command` | Installer for a Mac (or Linux) |
| `outils/` | Used by the Windows installer |
| `PROMPT-IA.md` | A ready-made message to get step-by-step help from an AI assistant |

Unzip everything into a folder first (Windows: right-click the zip, "Extract All").

## Install: pick one way

The app is not in the Play Store, so it is installed by hand. This is safe and normal ("sideloading").

### Way A: from your computer with the installer (recommended)

1. **Turn on Developer options on the TV** (only once):
   - Google TV (recent Sony, TCL, Philips, Hisense, Chromecast with Google TV…): **Settings > System > About**, go down to **Android TV OS build** and press OK **7 times**, until "You are now a developer".
   - Android TV (older models, Nvidia Shield…): **Settings > Device Preferences > About > Build**, press OK **7 times**.
2. Then **Settings > System** (or **Device Preferences**) **> Developer options**: turn on **USB debugging**. If you also see **Network debugging** (Nvidia Shield…), turn it on too.
3. Note the **TV's IP address**: **Settings > Network & Internet >** your network (or **About > Status**). For example `192.168.1.50`.
4. On the computer:
   - **Windows**: double-click `installer-sur-la-tele.bat`. If Windows shows a warning, choose "More info" then "Run anyway".
   - **Mac**: double-click `installer-sur-la-tele.command`. If macOS refuses to open it, open the **Terminal** app, type `bash ` (with a space), drag the file into the window and press Enter.
   - **Linux**: in a terminal, `bash installer-sur-la-tele.command`.
5. The installer downloads Google's official tool (adb) the first time, asks for the TV's IP address and connects to it.
6. **Look at the TV**: it asks "Allow USB debugging?". Tick "Always allow from this computer" and choose **OK**.
7. Wait for "Done!": Débrideur opens on the TV. You can then turn USB debugging off again.

Recent Google TV with **Wireless debugging** instead: in the installer, choose **3) Pair with a code**, then on the TV open **Developer options > Wireless debugging > Pair device with pairing code** and type what it shows.

### Way B: with the "Send Files to TV" app

1. Install **Send Files to TV** (free, Play Store) on the TV and on an Android phone.
2. On the phone, download the app: https://github.com/Ishine93/Debrideur/releases/latest/download/Debrideur.apk
3. Open Send Files to TV on both: **Receive** on the TV, **Send** on the phone, then choose `Debrideur.apk` and your TV.
4. On the TV, open the received `Debrideur.apk` (in Send Files to TV, or with a file manager in the **Download** folder) and choose **Install**.
5. The first time, the TV asks to allow installing unknown apps: allow it for the app that opens the file (or **Settings > Apps > Security & restrictions > Unknown sources**).

### Way C: with a USB stick

1. Copy `Debrideur.apk` onto a USB stick and plug it into the TV.
2. On the TV, install a file manager from the Play Store (for example **File Commander** or **X-plore File Manager**).
3. Open it, go to the USB stick, choose `Debrideur.apk` and **Install**.
4. The first time, allow "Install unknown apps" for the file manager when asked.

Tip: the free **Downloader** app (by AFTVnews, on the TV's Play Store) also works: type the link from Way B, it downloads and installs the app.

## First launch

- Open **Débrideur** from your apps (Google TV: **Apps** tab, or the **Your apps** row).
- It finds the server on your network by itself (a few seconds).
- If it shows **Server not found**: check that the computer is on and Débrideur is running. Then type the address shown **at the bottom of the Débrideur page** on the computer, for example `192.168.1.50:8097`: press **Up** to reach the field (the keyboard opens), type it and confirm. Or choose **Search the network** to try again.
- The address is remembered for next time.

## Remote control

- **Arrows** move, **OK** opens or chooses.
- **Back** closes what is open or goes back. On the home screen, press **Back twice** to quit.
- **Play/Pause, Stop, Fast-forward, Rewind, Next** control the video, if your remote has these keys.
- **Red key** (some remotes): choose another server.

## Updating

- Débrideur's look and features **update by themselves** with the server: nothing to do on the TV.
- The TV app itself rarely changes. When a new one is needed, **Débrideur tells you on the TV**. Install the new `Debrideur.apk` the same way as the first time: it replaces the old one and keeps your settings.
- If the TV says "App not installed" during an update, uninstall Débrideur first (**Settings > Apps > Débrideur > Uninstall**) and install again.

## Troubleshooting

- **Server not found**: the computer is off or asleep, Débrideur is not running, the TV is on another network (guest Wi-Fi), or the computer's firewall blocks port 8097 (on Windows, allow Node.js on private networks).
- **It worked before, now "Server not found"**: the computer's address may have changed. Type the new one shown at the bottom of the Débrideur page. To avoid it, give the computer a fixed address in your box or router settings.
- **The installer cannot connect**: same network? Developer options and USB debugging on? Right IP address? Restart the TV and try again (some TVs turn debugging off when restarting).
- **"App not installed"**: not enough space on the TV, or an older Débrideur app with a different signature: uninstall it first.
- **Débrideur is not in the Play Store**: that is normal, it is installed by hand.
- **Still stuck?** Open `PROMPT-IA.md`, copy the message into ChatGPT, Claude or another AI assistant: it will guide you step by step.

---

# Débrideur pour Android TV et Google TV

Cette application affiche ton Débrideur (bibliothèque, lecteur, téléchargements) en plein écran sur une télé **Android TV ou Google TV** : Sony, Philips, TCL, Xiaomi, Hisense (modèles Android), Nvidia Shield, Chromecast avec Google TV, Google TV Streamer et la plupart des boîtiers Android TV. Elle se pilote avec la télécommande.

## Avant de commencer

- Le **serveur Débrideur doit déjà être installé et allumé** sur un PC Windows, un Mac ou un mini-PC (NUC) de la maison : https://github.com/Ishine93/Debrideur
- La télé et cet ordinateur doivent être sur le **même réseau** (même box ou routeur, en Wi-Fi ou par câble).
- L'application de la télé n'est qu'une fenêtre sur le serveur : tes films et tes réglages restent sur l'ordinateur.

## Contenu du zip

| Fichier | À quoi il sert |
|---|---|
| `Debrideur.apk` | L'application |
| `installer-sur-la-tele.bat` | Installateur pour un PC Windows (double-clic) |
| `installer-sur-la-tele.command` | Installateur pour un Mac (ou Linux) |
| `outils/` | Utilisé par l'installateur Windows |
| `PROMPT-IA.md` | Un message tout prêt pour te faire guider pas à pas par une IA |

Décompresse d'abord tout dans un dossier (Windows : clic droit sur le zip, « Extraire tout »).

## Installer : choisis une méthode

L'application n'est pas sur le Play Store : on l'installe à la main. C'est normal et sans danger (on appelle ça le « sideloading »).

### Méthode A : depuis l'ordinateur avec l'installateur (conseillée)

1. **Active les options pour les développeurs sur la télé** (une seule fois) :
   - Google TV (Sony, TCL, Philips, Hisense récentes, Chromecast avec Google TV…) : **Paramètres > Système > À propos**, descends jusqu'à **Build du système d'exploitation Android TV** et appuie **7 fois** sur OK, jusqu'au message « Vous êtes maintenant développeur ».
   - Android TV (modèles plus anciens, Nvidia Shield…) : **Paramètres > Préférences de l'appareil > À propos > Build**, appuie **7 fois** sur OK.
2. Puis **Paramètres > Système** (ou **Préférences de l'appareil**) **> Options pour les développeurs** : active **Débogage USB**. Si tu vois aussi **Débogage réseau** (Nvidia Shield…), active-le aussi.
3. Note l'**adresse IP de la télé** : **Paramètres > Réseau et Internet >** ton réseau (ou **À propos > État**). Par exemple `192.168.1.50`.
4. Sur l'ordinateur :
   - **Windows** : double-clique sur `installer-sur-la-tele.bat`. Si Windows affiche un avertissement, choisis « Informations complémentaires » puis « Exécuter quand même ».
   - **Mac** : double-clique sur `installer-sur-la-tele.command`. Si macOS refuse de l'ouvrir, ouvre l'application **Terminal**, tape `bash ` (avec une espace), fais glisser le fichier dans la fenêtre et appuie sur Entrée.
   - **Linux** : dans un terminal, `bash installer-sur-la-tele.command`.
5. L'installateur télécharge la première fois l'outil officiel de Google (adb), demande l'adresse IP de la télé et s'y connecte.
6. **Regarde la télé** : elle demande « Autoriser le débogage USB ? ». Coche « Toujours autoriser sur cet ordinateur » et choisis **OK**.
7. Attends « C'est fait ! » : le Débrideur s'ouvre sur la télé. Tu peux ensuite désactiver le débogage USB.

Google TV récente avec **Débogage sans fil** à la place : dans l'installateur, choisis **3) Associer avec un code**, puis sur la télé ouvre **Options pour les développeurs > Débogage sans fil > Associer l'appareil avec un code** et recopie ce qu'elle affiche.

### Méthode B : avec l'application « Send Files to TV »

1. Installe **Send Files to TV** (gratuite, Play Store) sur la télé et sur un téléphone Android.
2. Sur le téléphone, télécharge l'application : https://github.com/Ishine93/Debrideur/releases/latest/download/Debrideur.apk
3. Ouvre Send Files to TV des deux côtés : **Receive** (recevoir) sur la télé, **Send** (envoyer) sur le téléphone, puis choisis `Debrideur.apk` et ta télé.
4. Sur la télé, ouvre le fichier `Debrideur.apk` reçu (dans Send Files to TV, ou avec un gestionnaire de fichiers dans le dossier **Download**) et choisis **Installer**.
5. La première fois, la télé demande d'autoriser l'installation d'applications inconnues : autorise-la pour l'application qui ouvre le fichier (ou **Paramètres > Applications > Sécurité et restrictions > Sources inconnues**).

### Méthode C : avec une clé USB

1. Copie `Debrideur.apk` sur une clé USB et branche-la sur la télé.
2. Sur la télé, installe un gestionnaire de fichiers depuis le Play Store (par exemple **File Commander** ou **X-plore File Manager**).
3. Ouvre-le, va sur la clé USB, choisis `Debrideur.apk` puis **Installer**.
4. La première fois, autorise « Installer des applications inconnues » pour le gestionnaire de fichiers quand la télé le demande.

Astuce : l'application gratuite **Downloader** (d'AFTVnews, sur le Play Store de la télé) marche aussi : tape le lien de la méthode B, elle télécharge et installe l'application.

## Premier lancement

- Ouvre **Débrideur** parmi tes applications (Google TV : onglet **Applications**, ou la rangée **Vos applications**).
- Il trouve tout seul le serveur sur ton réseau (quelques secondes).
- S'il affiche **Serveur introuvable** : vérifie que l'ordinateur est allumé et que le Débrideur tourne. Tape alors l'adresse affichée **en bas de la page du Débrideur** sur l'ordinateur, par exemple `192.168.1.50:8097` : appuie sur **Haut** pour aller sur le champ (le clavier s'ouvre), tape-la et valide. Ou choisis **Chercher sur le réseau** pour réessayer.
- L'adresse est retenue pour la fois suivante.

## Télécommande

- Les **flèches** déplacent, **OK** ouvre ou choisit.
- **Retour** ferme ce qui est ouvert ou revient en arrière. Sur l'accueil, appuie **deux fois sur Retour** pour quitter.
- **Lecture/Pause, Stop, Avance rapide, Retour rapide, Suivant** pilotent la vidéo, si ta télécommande a ces touches.
- **Touche rouge** (certaines télécommandes) : choisir un autre serveur.

## Mises à jour

- L'apparence et les fonctions du Débrideur **se mettent à jour toutes seules** avec le serveur : rien à faire sur la télé.
- L'application de la télé change rarement. Quand il en faut une nouvelle, **le Débrideur te le dit sur la télé**. Installe le nouveau `Debrideur.apk` comme la première fois : il remplace l'ancien et garde tes réglages.
- Si la télé répond « Application non installée » pendant une mise à jour, désinstalle d'abord le Débrideur (**Paramètres > Applications > Débrideur > Désinstaller**) puis réinstalle-le.

## En cas de souci

- **Serveur introuvable** : l'ordinateur est éteint ou en veille, le Débrideur n'est pas lancé, la télé est sur un autre réseau (Wi-Fi invité), ou le pare-feu de l'ordinateur bloque le port 8097 (sous Windows, autorise Node.js sur les réseaux privés).
- **Ça marchait, et maintenant « Serveur introuvable »** : l'adresse de l'ordinateur a peut-être changé. Tape la nouvelle, affichée en bas de la page du Débrideur. Pour l'éviter, donne une adresse fixe à l'ordinateur dans les réglages de ta box ou de ton routeur.
- **L'installateur n'arrive pas à se connecter** : même réseau ? Options pour les développeurs et débogage USB activés ? Bonne adresse IP ? Redémarre la télé et réessaie (certaines télés désactivent le débogage en redémarrant).
- **« Application non installée »** : plus assez de place sur la télé, ou une ancienne application Débrideur avec une autre signature : désinstalle-la d'abord.
- **Le Débrideur n'est pas sur le Play Store** : c'est normal, on l'installe à la main.
- **Toujours bloqué ?** Ouvre `PROMPT-IA.md` et copie le message dans ChatGPT, Claude ou une autre IA : elle te guidera pas à pas.
