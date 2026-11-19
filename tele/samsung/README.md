# Débrideur for Samsung TVs (Tizen)

This package installs the **Débrideur app** on a Samsung Smart TV (Tizen, 2017 and newer, including 2024–2026 models).
The app is only a *window* onto your Débrideur server: it finds it on your home network and shows its library, player and downloads full screen.

**Files in this package**

| File | What it is |
|---|---|
| `Debrideur.wgt` | The TV app (unsigned: Apps2Samsung signs it with your own Samsung certificate) |
| `installer-apps2samsung.bat` / `.command` | Installs or opens Apps2Samsung, the free tool that sends the app to the TV |
| `PROMPT-IA.md` | A ready-to-paste prompt if you want an AI assistant to guide you |

## Before you start

1. **The Débrideur server must already run** on a Windows PC, a Mac or a mini-PC (NUC) on the same network as the TV — see https://github.com/Ishine93/Debrideur. A TV alone is not enough.
2. The TV and that computer must be on the **same network** (same Wi-Fi box, Wi-Fi or cable).
3. Note the computer's address: it is shown in Débrideur → **Settings → Phone and TV** (for example `192.168.1.50`).

## Step 1 — Turn on Developer Mode on the TV

1. Press **Home**, open **Apps** (on 2025–2026 models: Apps → scroll down to **App Settings**).
2. Type **1 2 3 4 5** with the remote's number keys (no number keys? use the on-screen number pad of the remote, the **SmartThings** app on your phone, or a USB keyboard).
3. Switch **Developer mode** to **On**, enter the computer's address from above, confirm.
4. **Restart the TV**: hold the power button until the Samsung logo appears again.

## Step 2 — Install with Apps2Samsung

1. Run `installer-apps2samsung.bat` (Windows) or `installer-apps2samsung.command` (Mac). It installs Apps2Samsung with winget, or opens its download page.
2. Open **Apps2Samsung**, pick your TV in the list (or add it by its IP address).
3. Choose your own file: **Install a file…** (newer versions) or **Custom WGT** / **Select WGT** (older versions), and select `Debrideur.wgt`.
4. The first time, Apps2Samsung asks you to **sign in to your Samsung account** to create your signing certificate. It is reused afterwards.
5. When it says *installed*, the **Débrideur** app is in the TV's app list.

## Step 3 — First launch

- Open **Débrideur** on the TV: it searches the network and connects by itself.
- If it cannot find the server, type the address shown in the Débrideur Settings (e.g. `192.168.1.50:8097`) and choose **Connect**.
- Remote: arrows to move, **OK** to select, **Back** to go back (twice on the home screen to quit), **red key** to change server.

## Updates

The app's screens come from your server, so they update **automatically** when the server updates. If the TV app itself ever changes, Débrideur shows a message on the TV: reinstall the new `Debrideur.wgt` the same way (your profiles and history are kept).

## Troubleshooting

- **"Author certificate not match"**: uninstall Débrideur from the TV first, then install again.
- **The TV is not listed in Apps2Samsung**: check Developer mode is On with the right computer address, restart the TV, or add it by IP.
- **Server not found**: the computer must be on and Débrideur running; on Windows, allow Node.js on private networks when asked.
- **The picture stutters**: in the player, choose **Quality → 40 Mbit/s** (or lower) — Wi-Fi is often the limit for big 4K files.

---

# Débrideur pour télé Samsung (Tizen)

Ce paquet installe l'**appli Débrideur** sur une télé Samsung (Tizen, 2017 et plus récentes, y compris 2024–2026).
L'appli n'est qu'une *fenêtre* sur ton serveur Débrideur : elle le trouve sur ton réseau et affiche sa bibliothèque, son lecteur et ses téléchargements en plein écran.

**Fichiers du paquet**

| Fichier | Rôle |
|---|---|
| `Debrideur.wgt` | L'appli télé (non signée : Apps2Samsung la signe avec ton propre certificat Samsung) |
| `installer-apps2samsung.bat` / `.command` | Installe ou ouvre Apps2Samsung, l'outil gratuit qui envoie l'appli sur la télé |
| `PROMPT-IA.md` | Un texte prêt à coller pour qu'une IA te guide |

## Avant de commencer

1. **Le serveur Débrideur doit déjà tourner** sur un PC Windows, un Mac ou un mini-PC (NUC) du même réseau que la télé — voir https://github.com/Ishine93/Debrideur. La télé seule ne suffit pas.
2. La télé et cet ordinateur doivent être sur le **même réseau** (même box, Wi-Fi ou câble).
3. Note l'adresse de l'ordinateur : elle s'affiche dans le Débrideur → **Réglages → Téléphone et télé** (par exemple `192.168.1.50`).

## Étape 1 — Activer le mode développeur sur la télé

1. Appuie sur **Accueil**, ouvre **Applications** (modèles 2025–2026 : Applications → descends jusqu'à **Paramètres des applications**).
2. Tape **1 2 3 4 5** avec les chiffres de la télécommande (pas de chiffres ? le pavé numérique à l'écran, l'appli **SmartThings** du téléphone, ou un clavier USB).
3. Passe **Mode développeur** sur **On**, entre l'adresse de l'ordinateur, valide.
4. **Redémarre la télé** : garde le bouton marche appuyé jusqu'à revoir le logo Samsung.

## Étape 2 — Installer avec Apps2Samsung

1. Lance `installer-apps2samsung.bat` (Windows) ou `installer-apps2samsung.command` (Mac) : il installe Apps2Samsung avec winget, ou ouvre sa page de téléchargement.
2. Ouvre **Apps2Samsung**, choisis ta télé dans la liste (ou ajoute-la par son adresse IP).
3. Choisis ton propre fichier : **Install a file…** (versions récentes) ou **Custom WGT** / **Select WGT** (anciennes versions), puis `Debrideur.wgt`.
4. La première fois, Apps2Samsung demande de **te connecter à ton compte Samsung** pour créer ton certificat de signature. Il est réutilisé ensuite.
5. Quand il indique *installé*, l'appli **Débrideur** est dans la liste des applis de la télé.

## Étape 3 — Premier lancement

- Ouvre **Débrideur** sur la télé : elle cherche le serveur sur le réseau et s'y connecte toute seule.
- Si elle ne le trouve pas, tape l'adresse affichée dans les Réglages du Débrideur (ex. `192.168.1.50:8097`) puis **Se connecter**.
- Télécommande : flèches pour se déplacer, **OK** pour choisir, **Retour** pour revenir (deux fois sur l'accueil pour quitter), **touche rouge** pour changer de serveur.

## Mises à jour

Les écrans de l'appli viennent de ton serveur : ils se mettent à jour **tout seuls** avec lui. Si l'appli télé elle-même change un jour, le Débrideur l'annonce sur la télé : réinstalle le nouveau `Debrideur.wgt` de la même façon (profils et historique gardés).

## En cas de souci

- **« Author certificate not match »** : désinstalle d'abord Débrideur de la télé, puis réinstalle.
- **La télé n'apparaît pas dans Apps2Samsung** : vérifie que le mode développeur est sur On avec la bonne adresse d'ordinateur, redémarre la télé, ou ajoute-la par son IP.
- **Serveur introuvable** : l'ordinateur doit être allumé et le Débrideur lancé ; sous Windows, autorise Node.js sur les réseaux privés quand c'est demandé.
- **L'image saccade** : dans le lecteur, choisis **Qualité → 40 Mbit/s** (ou moins) — le Wi-Fi est souvent la limite pour les gros fichiers 4K.
