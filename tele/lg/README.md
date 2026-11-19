# Débrideur on an LG TV

*Version française plus bas.*

This app puts the Débrideur (your library, the player and the downloads) full screen on an LG TV.
The TV app is only a "window": everything happens on the computer where the Débrideur server runs.

LG only lets you install apps outside its store with the TV in **Developer Mode**. It is free, official and
reversible, but it takes about 20 minutes the first time. Follow the steps in order.

## What you need

- **The Débrideur server**, already installed and switched on, on a Windows PC, a Mac or a mini-PC (NUC)
  on the same network as the TV: https://github.com/Ishine93/Debrideur
- **An LG TV with webOS** (2020 or newer), connected to the same network (Wi-Fi or cable).
- **A Windows PC or a Mac** for the installation (it can be the Débrideur computer), on the same network.
- **The LG zip** of Débrideur, extracted (right-click → "Extract All" on Windows). It contains:
  - `Debrideur.ipk`: the TV app,
  - `installer-sur-la-tele.bat` (+ `.ps1`): the installation helper for Windows,
  - `installer-sur-la-tele.command`: the installation helper for Mac,
  - `README.md` (this guide) and `PROMPT-IA.md` (a text to paste into an AI assistant if you get stuck).

## Step 1 – Put the TV in Developer Mode (once)

1. On a computer or phone, create a free LG developer account at **https://webostv.developer.lge.com**
   ("Sign In" → create an account). Note the e-mail and password.
2. On the TV, open the **LG Content Store** (called "Apps" on recent TVs), search for **Developer Mode**
   and install it.
3. Open **Developer Mode** on the TV and sign in with your LG developer account.
4. Turn **Dev Mode Status** ON. The TV asks to restart: accept.
5. After the restart, open **Developer Mode** again. Write down:
   - the **IP address** of the TV (for example `192.168.1.50`),
   - the **Passphrase** (6 characters, for example `A1B2C3`; capital letters matter).
6. Turn **Key Server** ON. Leave the Developer Mode app open on the screen during the installation.

> **The Developer Mode session expires.** The app shows the time left. Open Developer Mode now and then and
> press **Extend** before the countdown reaches zero. If it runs out, the TV removes the apps installed this
> way (Débrideur included): you would then have to turn Dev Mode on again and reinstall the app.

## Step 2 – Install the app on the TV

Choose **one** of the two ways.

### Way A – The installation helper (recommended)

- **Windows:** double-click `installer-sur-la-tele.bat`.
  If Windows shows a blue warning ("Windows protected your PC"), click **More info** → **Run anyway**.
- **Mac:** open the **Terminal** app, type `bash ` (with a space), drag `installer-sur-la-tele.command` into the
  window, then press Enter. (Double-clicking also works if macOS allows it.)

The helper explains each step in English and in French. It:
1. checks that Node.js 20 or newer is on the computer; if not, it downloads an official copy from nodejs.org
   into an `outils` folder next to it (nothing is installed in the system);
2. installs LG's official tools in that same `outils` folder;
3. asks for the TV's **IP address** and **Passphrase** (shown in the Developer Mode app);
4. installs `Debrideur.ipk` on the TV and starts it.

You can delete the `outils` folder afterwards; it will simply be downloaded again next time.

### Way B – webOS Dev Manager (a free app with windows and buttons)

1. Download **webOS Dev Manager** from https://github.com/webosbrew/dev-manager-desktop/releases
   (Windows: the `x64 … .msi` file; Mac: the `.dmg` file) and install it.
2. Open it and **add a device**: choose an LG webOS TV in Developer Mode, type the TV's **IP address** and,
   when asked, the **Passphrase** shown in the Developer Mode app. Leave the other settings as they are.
3. Go to **Apps**, click the install button and choose `Debrideur.ipk` (or drag the file into the window).

## Step 3 – First launch

- Débrideur now appears in the TV's app list (Home button on the remote, at the end of the list).
  You can move it to the front.
- When it opens, it looks for the Débrideur server on the network by itself (a few seconds, up to a minute).
- If it does not find it, type the server address, shown in Débrideur on the computer under
  **Settings → Phone and TV** (for example `192.168.1.50:8097`), then choose **Connect**.
- The address is remembered for the next times.

## The remote

| Key | What it does |
| --- | --- |
| Arrows and **OK** | move and choose |
| **Back** | go back; **twice** on the home screen of Débrideur: leave the app |
| **Red** key | change server (the address screen) |

## Updates

- The Débrideur screens come from the server: when you update the Débrideur on the computer, the TV shows the
  new version by itself. Nothing to do on the TV.
- Reinstall `Debrideur.ipk` (Step 2 again) **only** when Débrideur tells you the TV app has changed.
  Dev Mode must still be active; there is no need to recreate the LG account.

## Troubleshooting

| Problem | What to do |
| --- | --- |
| "Server not found" on the TV | Check that the Débrideur computer is on and on the same network. Type its address (Débrideur → Settings → Phone and TV), e.g. `192.168.1.50:8097`. |
| The helper cannot get the key ("Failed to get ssh private key") | On the TV, the Developer Mode app must be open with **Key Server** ON. Check the IP address. |
| The installation talks about "passphrase" | Run the helper again and type the Passphrase exactly as shown (capital letters). |
| "Connection refused" or "timeout" | Is **Dev Mode Status** still ON? Are the TV and the computer on the same network? Restart the TV and try again. |
| The Node.js download fails | Check the internet connection, or install Node.js (LTS version) from https://nodejs.org and run the helper again. |
| On Mac, "cannot be opened" | Use the Terminal method from Step 2 (`bash ` + drag the file). |
| The Débrideur app disappeared from the TV | The Developer Mode session expired. Turn Dev Mode on again (Step 1) and reinstall (Step 2). |
| Black screen or the TV seems stuck | Press the **Red** key to come back to the address screen. |

Still stuck? Open `PROMPT-IA.md`, copy the prompt into an AI assistant (ChatGPT, Claude, Gemini…) and let it guide you.

---

# Le Débrideur sur une télé LG

Cette application affiche le Débrideur (ta bibliothèque, le lecteur et les téléchargements) en plein écran sur
une télé LG. L'appli de la télé n'est qu'une « fenêtre » : tout se passe sur l'ordinateur où tourne le serveur
Débrideur.

LG ne laisse installer des applis hors de sa boutique que si la télé est en **mode développeur** (Developer Mode).
C'est gratuit, officiel et réversible, mais il faut compter une vingtaine de minutes la première fois. Suis les
étapes dans l'ordre.

## Ce qu'il faut

- **Le serveur Débrideur**, déjà installé et allumé, sur un PC Windows, un Mac ou un mini-PC (NUC) du même
  réseau que la télé : https://github.com/Ishine93/Debrideur
- **Une télé LG sous webOS** (2020 ou plus récente), branchée sur le même réseau (Wi-Fi ou câble).
- **Un PC Windows ou un Mac** pour l'installation (ça peut être l'ordinateur du Débrideur), sur le même réseau.
- **Le zip LG** du Débrideur, décompressé (clic droit → « Extraire tout » sous Windows). Il contient :
  - `Debrideur.ipk` : l'appli de la télé,
  - `installer-sur-la-tele.bat` (+ `.ps1`) : l'assistant d'installation pour Windows,
  - `installer-sur-la-tele.command` : l'assistant d'installation pour Mac,
  - `README.md` (ce guide) et `PROMPT-IA.md` (un texte à coller dans un assistant IA si tu bloques).

## Étape 1 – Passer la télé en mode développeur (une seule fois)

1. Sur un ordinateur ou un téléphone, crée un compte développeur LG gratuit sur **https://webostv.developer.lge.com**
   (« Sign In » → créer un compte). Note l'e-mail et le mot de passe.
2. Sur la télé, ouvre le **LG Content Store** (« Apps » sur les télés récentes), cherche **Developer Mode** et
   installe-le.
3. Ouvre **Developer Mode** sur la télé et connecte-toi avec ton compte développeur LG.
4. Mets **Dev Mode Status** sur ON. La télé demande à redémarrer : accepte.
5. Après le redémarrage, rouvre **Developer Mode**. Note :
   - l'**adresse IP** de la télé (par exemple `192.168.1.50`),
   - la **Passphrase** (phrase secrète de 6 caractères, par exemple `A1B2C3` ; les majuscules comptent).
6. Mets **Key Server** sur ON. Laisse l'appli Developer Mode ouverte à l'écran pendant l'installation.

> **La session du mode développeur expire.** L'appli affiche le temps restant. Ouvre Developer Mode de temps
> en temps et appuie sur **Extend** avant la fin du compte à rebours. Sinon, la télé supprime les applis
> installées de cette façon (le Débrideur compris) : il faudrait alors réactiver le mode développeur et
> réinstaller l'appli.

## Étape 2 – Installer l'appli sur la télé

Choisis **une** des deux façons.

### Façon A – L'assistant d'installation (conseillé)

- **Windows :** double-clique sur `installer-sur-la-tele.bat`.
  Si Windows affiche un avertissement bleu (« Windows a protégé votre ordinateur »), clique sur
  **Informations complémentaires** → **Exécuter quand même**.
- **Mac :** ouvre l'appli **Terminal**, tape `bash ` (avec un espace), fais glisser `installer-sur-la-tele.command`
  dans la fenêtre, puis appuie sur Entrée. (Le double-clic marche aussi si macOS l'autorise.)

L'assistant explique chaque étape en anglais et en français. Il :
1. vérifie que Node.js 20 ou plus récent est sur l'ordinateur ; sinon il télécharge une copie officielle depuis
   nodejs.org dans un dossier `outils` à côté de lui (rien n'est installé dans le système) ;
2. installe les outils officiels de LG dans ce même dossier `outils` ;
3. demande l'**adresse IP** et la **Passphrase** de la télé (affichées dans l'appli Developer Mode) ;
4. installe `Debrideur.ipk` sur la télé et le lance.

Tu peux supprimer le dossier `outils` ensuite ; il sera simplement retéléchargé la prochaine fois.

### Façon B – webOS Dev Manager (une appli gratuite avec des fenêtres et des boutons)

1. Télécharge **webOS Dev Manager** sur https://github.com/webosbrew/dev-manager-desktop/releases
   (Windows : le fichier `x64 … .msi` ; Mac : le fichier `.dmg`) et installe-le.
2. Ouvre-le et **ajoute un appareil** (« Add device ») : choisis une télé LG webOS en mode développeur, tape
   l'**adresse IP** de la télé et, quand c'est demandé, la **Passphrase** affichée dans l'appli Developer Mode.
   Laisse les autres réglages tels quels.
3. Va dans **Apps**, clique sur le bouton d'installation et choisis `Debrideur.ipk` (ou fais glisser le fichier
   dans la fenêtre).

## Étape 3 – Premier lancement

- Le Débrideur apparaît maintenant dans la liste des applis de la télé (bouton Accueil de la télécommande, en
  fin de liste). Tu peux le déplacer au début.
- À l'ouverture, il cherche tout seul le serveur Débrideur sur le réseau (quelques secondes, jusqu'à une minute).
- S'il ne le trouve pas, tape l'adresse du serveur, affichée dans le Débrideur sur l'ordinateur sous
  **Réglages → Téléphone et télé** (par exemple `192.168.1.50:8097`), puis choisis **Se connecter**.
- L'adresse est retenue pour les fois suivantes.

## La télécommande

| Touche | Ce qu'elle fait |
| --- | --- |
| Flèches et **OK** | se déplacer et choisir |
| **Retour** | revenir en arrière ; **deux fois** sur l'accueil du Débrideur : quitter l'appli |
| Touche **rouge** | changer de serveur (écran de l'adresse) |

## Mises à jour

- Les écrans du Débrideur viennent du serveur : quand tu mets à jour le Débrideur sur l'ordinateur, la télé
  affiche la nouvelle version toute seule. Rien à faire sur la télé.
- Réinstalle `Debrideur.ipk` (refais l'étape 2) **seulement** quand le Débrideur t'indique que l'appli télé a
  changé. Le mode développeur doit toujours être actif ; pas besoin de recréer le compte LG.

## En cas de souci

| Problème | Que faire |
| --- | --- |
| « Serveur introuvable » sur la télé | Vérifie que l'ordinateur du Débrideur est allumé et sur le même réseau. Tape son adresse (Débrideur → Réglages → Téléphone et télé), par ex. `192.168.1.50:8097`. |
| L'assistant n'arrive pas à récupérer la clé (« Failed to get ssh private key ») | Sur la télé, l'appli Developer Mode doit être ouverte avec **Key Server** sur ON. Vérifie l'adresse IP. |
| L'installation parle de « passphrase » | Relance l'assistant et tape la Passphrase exactement comme affichée (majuscules). |
| « Connection refused » ou « timeout » | **Dev Mode Status** est-il toujours sur ON ? La télé et l'ordinateur sont-ils sur le même réseau ? Redémarre la télé et réessaie. |
| Le téléchargement de Node.js échoue | Vérifie la connexion internet, ou installe Node.js (version LTS) depuis https://nodejs.org et relance l'assistant. |
| Sur Mac, « impossible d'ouvrir » | Utilise la méthode Terminal de l'étape 2 (`bash ` + glisser le fichier). |
| L'appli Débrideur a disparu de la télé | La session du mode développeur a expiré. Réactive le mode développeur (étape 1) et réinstalle (étape 2). |
| Écran noir ou télé qui semble bloquée | Appuie sur la touche **rouge** pour revenir à l'écran de l'adresse. |

Toujours bloqué ? Ouvre `PROMPT-IA.md`, copie le texte dans un assistant IA (ChatGPT, Claude, Gemini…) et
laisse-le te guider.
