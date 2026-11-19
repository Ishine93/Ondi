# Ondi for Amazon Fire TV

*Version française plus bas.*

This app shows your Ondi (library, player, downloads) full screen on an **Amazon Fire TV**: Fire TV Stick, Fire TV Stick 4K / 4K Max, Fire TV Cube, and TVs with Fire TV built in. You use it with the Fire TV remote.

## Before you start

- The **Ondi server must already be installed and running** on a Windows PC, a Mac or a mini-PC (NUC) at home: https://github.com/Ishine93/Ondi
- The Fire TV and that computer must be on the **same home network** (same box or router).
- The Fire TV app is only a window onto the server: your films and settings stay on the computer.
- Some recent models (for example the Fire TV Stick 4K Select, 2025) run Amazon's new **Vega OS**, which cannot install Android apps: Ondi cannot be installed on them.

## What is in the zip

| File | What it is for |
|---|---|
| `Ondi.apk` | The app itself |
| `installer-sur-la-tele.bat` | Installer for a Windows PC (double-click), see Way B |
| `installer-sur-la-tele.command` | Installer for a Mac (or Linux), see Way B |
| `outils/` | Used by the Windows installer |
| `PROMPT-IA.md` | A ready-made message to get step-by-step help from an AI assistant |

## Step 1: turn on Developer Options (only once)

1. On the Fire TV: **Settings > My Fire TV > About**.
2. Select the **device name** (for example "Fire TV Stick 4K") and press the middle button **7 times**, until "You are now a developer".
3. Go back to **Settings > My Fire TV**: **Developer Options** is now there.

(On older Fire TV, Developer Options is already there and you can skip this.)

## Step 2: install, pick one way

The app is not in the Amazon Appstore, so it is installed by hand. This is safe and normal ("sideloading").

### Way A: with the free "Downloader" app (easiest, no computer needed)

1. On the Fire TV, search for **Downloader** (orange icon, by AFTVnews) with the search bar or the microphone, and install it.
2. **Settings > My Fire TV > Developer Options > Install unknown apps**: turn it **On** for **Downloader**. (Older Fire TV: **Apps from Unknown Sources > On**.)
3. Open Downloader (allow access to files if it asks). In the address field, type:
   `https://github.com/Ishine93/Ondi/releases/latest/download/Ondi.apk`
   and choose **Go**.
4. When the download ends, choose **Install**, then **Open** (or **Done**).
5. Downloader then offers to **Delete** the file: you can, the app stays installed.

### Way B: from your computer with the installer

1. **Settings > My Fire TV > Developer Options**: turn on **ADB debugging**.
2. Note the Fire TV's **IP address**: **Settings > My Fire TV > About > Network**. For example `192.168.1.50`.
3. Unzip the zip into a folder, then on the computer:
   - **Windows**: double-click `installer-sur-la-tele.bat`. If Windows shows a warning, choose "More info" then "Run anyway".
   - **Mac**: double-click `installer-sur-la-tele.command`. If macOS refuses to open it, open the **Terminal** app, type `bash ` (with a space), drag the file into the window and press Enter.
   - **Linux**: in a terminal, `bash installer-sur-la-tele.command`.
4. The installer downloads Google's official tool (adb) the first time, asks for the Fire TV's IP address and connects to it.
5. **Look at the TV**: it asks "Allow USB debugging?". Tick "Always allow from this computer" and choose **OK**.
6. Wait for "Done!": Ondi opens on the TV. You can then turn ADB debugging off again.

## First launch

- Open **Ondi** from **Your Apps & Games** (the square icon with three dots on the home screen). To keep it handy, select it, press the **Menu** button (three lines) and choose **Move to front**.
- It finds the server on your network by itself (a few seconds).
- If it shows **Server not found**: check that the computer is on and Ondi is running. Then type the address shown **at the bottom of the Ondi page** on the computer, for example `192.168.1.50:8097`: press **Up** to reach the field (the keyboard opens), type it and confirm. Or choose **Search the network** to try again.
- The address is remembered for next time.

## Remote control

- **Arrows** move, the **middle button** opens or chooses.
- **Back** closes what is open or goes back. On the home screen, press **Back twice** to quit.
- **Play/Pause, Fast-forward, Rewind** control the video.

## Updating

- Ondi's look and features **update by themselves** with the server: nothing to do on the Fire TV.
- The Fire TV app itself rarely changes. When a new one is needed, **Ondi tells you on the TV**. Install it the same way as the first time (in Downloader, the same link always gives the newest version): it replaces the old one and keeps your settings.
- If the Fire TV says "App not installed" during an update, uninstall Ondi first (**Settings > Applications > Manage Installed Applications > Ondi > Uninstall**) and install again.

## Troubleshooting

- **Server not found**: the computer is off or asleep, Ondi is not running, the Fire TV is on another network (guest Wi-Fi), or the computer's firewall blocks port 8097 (on Windows, allow Node.js on private networks).
- **It worked before, now "Server not found"**: the computer's address may have changed. Type the new one shown at the bottom of the Ondi page. To avoid it, give the computer a fixed address in your box or router settings.
- **Downloader says the download failed**: check the link letter by letter (capital D in `Ondi.apk`), and that the Fire TV is connected to the Internet.
- **"Install" is greyed out or nothing happens**: turn on **Install unknown apps** for Downloader (Step 2, Way A, point 2).
- **The installer cannot connect**: same network? ADB debugging on? Right IP address? Restart the Fire TV and try again.
- **Still stuck?** Open `PROMPT-IA.md`, copy the message into ChatGPT, Claude or another AI assistant: it will guide you step by step.

---

# Ondi pour Amazon Fire TV

Cette application affiche ton Ondi (bibliothèque, lecteur, téléchargements) en plein écran sur une **Amazon Fire TV** : Fire TV Stick, Fire TV Stick 4K / 4K Max, Fire TV Cube et les télés avec Fire TV intégré. Elle se pilote avec la télécommande Fire TV.

## Avant de commencer

- Le **serveur Ondi doit déjà être installé et allumé** sur un PC Windows, un Mac ou un mini-PC (NUC) de la maison : https://github.com/Ishine93/Ondi
- La Fire TV et cet ordinateur doivent être sur le **même réseau** (même box ou routeur).
- L'application de la Fire TV n'est qu'une fenêtre sur le serveur : tes films et tes réglages restent sur l'ordinateur.
- Certains modèles récents (par exemple le Fire TV Stick 4K Select, 2025) utilisent le nouveau système **Vega OS** d'Amazon, qui ne peut pas installer d'applications Android : Ondi ne peut pas s'y installer.

## Contenu du zip

| Fichier | À quoi il sert |
|---|---|
| `Ondi.apk` | L'application |
| `installer-sur-la-tele.bat` | Installateur pour un PC Windows (double-clic), voir méthode B |
| `installer-sur-la-tele.command` | Installateur pour un Mac (ou Linux), voir méthode B |
| `outils/` | Utilisé par l'installateur Windows |
| `PROMPT-IA.md` | Un message tout prêt pour te faire guider pas à pas par une IA |

## Étape 1 : activer les options pour les développeurs (une seule fois)

1. Sur la Fire TV : **Paramètres > Ma Fire TV > À propos**.
2. Sélectionne le **nom de l'appareil** (par exemple « Fire TV Stick 4K ») et appuie **7 fois** sur le bouton central, jusqu'au message « Vous êtes maintenant développeur ».
3. Reviens dans **Paramètres > Ma Fire TV** : **Options pour les développeurs** est apparu.

(Sur les Fire TV plus anciennes, ce menu est déjà là : passe cette étape.)

## Étape 2 : installer, choisis une méthode

L'application n'est pas sur l'Appstore d'Amazon : on l'installe à la main. C'est normal et sans danger (on appelle ça le « sideloading »).

### Méthode A : avec l'application gratuite « Downloader » (la plus simple, sans ordinateur)

1. Sur la Fire TV, cherche **Downloader** (icône orange, d'AFTVnews) avec la recherche ou le micro, et installe-la.
2. **Paramètres > Ma Fire TV > Options pour les développeurs > Installer des applications inconnues** : mets **Downloader** sur **Activé**. (Anciennes Fire TV : **Applications de sources inconnues > Activé**.)
3. Ouvre Downloader (autorise l'accès aux fichiers s'il le demande). Dans le champ d'adresse, tape :
   `https://github.com/Ishine93/Ondi/releases/latest/download/Ondi.apk`
   puis choisis **Go**.
4. À la fin du téléchargement, choisis **Installer**, puis **Ouvrir** (ou **OK**).
5. Downloader propose ensuite de **supprimer** (Delete) le fichier : tu peux, l'application reste installée.

### Méthode B : depuis l'ordinateur avec l'installateur

1. **Paramètres > Ma Fire TV > Options pour les développeurs** : active **Débogage ADB**.
2. Note l'**adresse IP** de la Fire TV : **Paramètres > Ma Fire TV > À propos > Réseau**. Par exemple `192.168.1.50`.
3. Décompresse le zip dans un dossier, puis sur l'ordinateur :
   - **Windows** : double-clique sur `installer-sur-la-tele.bat`. Si Windows affiche un avertissement, choisis « Informations complémentaires » puis « Exécuter quand même ».
   - **Mac** : double-clique sur `installer-sur-la-tele.command`. Si macOS refuse de l'ouvrir, ouvre l'application **Terminal**, tape `bash ` (avec une espace), fais glisser le fichier dans la fenêtre et appuie sur Entrée.
   - **Linux** : dans un terminal, `bash installer-sur-la-tele.command`.
4. L'installateur télécharge la première fois l'outil officiel de Google (adb), demande l'adresse IP de la Fire TV et s'y connecte.
5. **Regarde la télé** : elle demande « Autoriser le débogage USB ? ». Coche « Toujours autoriser sur cet ordinateur » et choisis **OK**.
6. Attends « C'est fait ! » : Ondi s'ouvre sur la télé. Tu peux ensuite désactiver le débogage ADB.

## Premier lancement

- Ouvre **Ondi** depuis **Vos applis et jeux** (l'icône carrée à trois points sur l'accueil). Pour l'avoir sous la main, sélectionne-le, appuie sur la touche **Menu** (trois traits) et choisis **Déplacer en tête**.
- Il trouve tout seul le serveur sur ton réseau (quelques secondes).
- S'il affiche **Serveur introuvable** : vérifie que l'ordinateur est allumé et qu'Ondi tourne. Tape alors l'adresse affichée **en bas de la page d'Ondi** sur l'ordinateur, par exemple `192.168.1.50:8097` : appuie sur **Haut** pour aller sur le champ (le clavier s'ouvre), tape-la et valide. Ou choisis **Chercher sur le réseau** pour réessayer.
- L'adresse est retenue pour la fois suivante.

## Télécommande

- Les **flèches** déplacent, le **bouton central** ouvre ou choisit.
- **Retour** ferme ce qui est ouvert ou revient en arrière. Sur l'accueil, appuie **deux fois sur Retour** pour quitter.
- **Lecture/Pause, Avance rapide, Retour rapide** pilotent la vidéo.

## Mises à jour

- L'apparence et les fonctions d'Ondi **se mettent à jour toutes seules** avec le serveur : rien à faire sur la Fire TV.
- L'application de la Fire TV change rarement. Quand il en faut une nouvelle, **Ondi te le dit sur la télé**. Installe-la comme la première fois (dans Downloader, le même lien donne toujours la dernière version) : elle remplace l'ancienne et garde tes réglages.
- Si la Fire TV répond « Application non installée » pendant une mise à jour, désinstalle d'abord Ondi (**Paramètres > Applications > Gérer les applications installées > Ondi > Désinstaller**) puis réinstalle-le.

## En cas de souci

- **Serveur introuvable** : l'ordinateur est éteint ou en veille, Ondi n'est pas lancé, la Fire TV est sur un autre réseau (Wi-Fi invité), ou le pare-feu de l'ordinateur bloque le port 8097 (sous Windows, autorise Node.js sur les réseaux privés).
- **Ça marchait, et maintenant « Serveur introuvable »** : l'adresse de l'ordinateur a peut-être changé. Tape la nouvelle, affichée en bas de la page d'Ondi. Pour l'éviter, donne une adresse fixe à l'ordinateur dans les réglages de ta box ou de ton routeur.
- **Downloader dit que le téléchargement a échoué** : vérifie le lien lettre par lettre (D majuscule à `Ondi.apk`), et que la Fire TV est bien connectée à Internet.
- **« Installer » est grisé ou rien ne se passe** : active **Installer des applications inconnues** pour Downloader (étape 2, méthode A, point 2).
- **L'installateur n'arrive pas à se connecter** : même réseau ? Débogage ADB activé ? Bonne adresse IP ? Redémarre la Fire TV et réessaie.
- **Toujours bloqué ?** Ouvre `PROMPT-IA.md` et copie le message dans ChatGPT, Claude ou une autre IA : elle te guidera pas à pas.
