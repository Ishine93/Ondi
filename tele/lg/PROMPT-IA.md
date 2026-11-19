# Prompt for an AI assistant

*Version française plus bas.*

Stuck while installing Ondi on your LG TV? Copy the whole text in the box below, paste it into an AI
assistant (ChatGPT, Claude, Gemini…) and answer its questions. Never give it your passwords.

```text
I need step-by-step help to install an app on my LG TV. I am not a technical person: please guide me one
step at a time, wait for my answer before going on, and explain where to click or which remote button to press.

The situation:
- "Ondi" is a home media app. Its server runs on a computer at home (a Windows PC, a Mac or a mini-PC)
  and shows a web interface at http://<computer-ip>:8097/ (example: http://192.168.1.50:8097/).
  Project page: https://github.com/Ishine93/Ondi
- The LG TV app is only a thin client: it finds that server on the home network and shows its web
  interface full screen. It is a webOS web app packaged as "Ondi.ipk", app id
  io.github.ishine93.debrideur. It is not in the LG Content Store, so it must be sideloaded with the TV in
  Developer Mode.
- I downloaded a zip containing: Ondi.ipk (the TV app), installer-sur-la-tele.bat and
  installer-sur-la-tele.ps1 (installation helper for Windows), installer-sur-la-tele.command (installation
  helper for Mac, run with "bash installer-sur-la-tele.command" in the Terminal), README.md (the guide)
  and PROMPT-IA.md (this text).

The steps:
1. Developer Mode on the TV: create a free LG developer account on webostv.developer.lge.com; install the
   "Developer Mode" app from the LG Content Store on the TV; sign in; turn "Dev Mode Status" ON; restart the
   TV; reopen the app and note the TV's IP address and the 6-character Passphrase; turn "Key Server" ON.
   The Developer Mode session expires: the app shows the time left and has an "Extend" button; if it runs
   out, the TV removes sideloaded apps.
2. Install Ondi.ipk with ONE of these two methods:
   a) The installation helper from the zip. It uses Node.js 20+ (or downloads a portable official copy
      from nodejs.org into an "outils" folder next to it), installs LG's official CLI @webos-tools/cli in
      that folder, then runs:
        ares-setup-device --add tv -i "host=<TV IP>" -i "port=9922" -i "username=prisoner"
        ares-novacom --device tv --getkey --passphrase <passphrase>
        ares-install --device tv Ondi.ipk
        ares-launch --device tv io.github.ishine93.debrideur
   b) The free graphical tool "webOS Dev Manager" (github.com/webosbrew/dev-manager-desktop): add the TV
      as a device (IP address + passphrase), then install Ondi.ipk from its Apps page.
3. First launch: the app looks for the server on the network by itself; otherwise I type the address shown
   in Ondi under Settings → Phone and TV (for example 192.168.1.50:8097). Red key on the remote = change
   server; Back twice on the Ondi home screen = quit.

Before anything else, ask me:
- the exact model of my TV (written on the label at the back, or in Settings > General > About This TV)
  and its webOS version,
- whether I use a Windows PC or a Mac for the installation,
- at which step I am and the exact error message I see, if any.
Then guide me step by step. If something does not match what I see on my screen, tell me what to check.
```

---

# Prompt pour un assistant IA

Bloqué pendant l'installation d'Ondi sur ta télé LG ? Copie tout le texte du cadre ci-dessous, colle-le
dans un assistant IA (ChatGPT, Claude, Gemini…) et réponds à ses questions. Ne lui donne jamais tes mots de passe.

```text
J'ai besoin d'aide, étape par étape, pour installer une application sur ma télé LG. Je ne suis pas
technicien : guide-moi une étape à la fois, attends ma réponse avant de continuer, et dis-moi où cliquer ou
quelle touche de la télécommande utiliser.

La situation :
- « Ondi » est une application multimédia pour la maison. Son serveur tourne sur un ordinateur de la
  maison (un PC Windows, un Mac ou un mini-PC) et affiche une interface web à l'adresse
  http://<ip-de-l-ordinateur>:8097/ (exemple : http://192.168.1.50:8097/).
  Page du projet : https://github.com/Ishine93/Ondi
- L'appli de la télé LG n'est qu'un client léger : elle trouve ce serveur sur le réseau de la maison et
  affiche son interface en plein écran. C'est une appli web webOS, emballée dans « Ondi.ipk »,
  identifiant io.github.ishine93.debrideur. Elle n'est pas dans le LG Content Store : il faut l'installer
  « à côté » (sideload), avec la télé en mode développeur.
- J'ai téléchargé un zip qui contient : Ondi.ipk (l'appli de la télé), installer-sur-la-tele.bat et
  installer-sur-la-tele.ps1 (assistant d'installation pour Windows), installer-sur-la-tele.command
  (assistant d'installation pour Mac, à lancer avec « bash installer-sur-la-tele.command » dans le
  Terminal), README.md (le guide) et PROMPT-IA.md (ce texte).

Les étapes :
1. Mode développeur sur la télé : créer un compte développeur LG gratuit sur webostv.developer.lge.com ;
   installer l'appli « Developer Mode » depuis le LG Content Store de la télé ; s'y connecter ; mettre
   « Dev Mode Status » sur ON ; redémarrer la télé ; rouvrir l'appli et noter l'adresse IP de la télé et la
   Passphrase de 6 caractères ; mettre « Key Server » sur ON. La session du mode développeur expire :
   l'appli affiche le temps restant et a un bouton « Extend » ; si le temps est écoulé, la télé supprime les
   applis installées de cette façon.
2. Installer Ondi.ipk par UNE de ces deux méthodes :
   a) L'assistant d'installation du zip. Il utilise Node.js 20 ou plus (ou télécharge une copie portable
      officielle depuis nodejs.org dans un dossier « outils » à côté de lui), installe l'outil officiel
      de LG @webos-tools/cli dans ce dossier, puis lance :
        ares-setup-device --add tv -i "host=<IP de la télé>" -i "port=9922" -i "username=prisoner"
        ares-novacom --device tv --getkey --passphrase <passphrase>
        ares-install --device tv Ondi.ipk
        ares-launch --device tv io.github.ishine93.debrideur
   b) L'outil gratuit avec fenêtres « webOS Dev Manager » (github.com/webosbrew/dev-manager-desktop) :
      ajouter la télé comme appareil (adresse IP + passphrase), puis installer Ondi.ipk depuis sa
      page Apps.
3. Premier lancement : l'appli cherche le serveur toute seule sur le réseau ; sinon je tape l'adresse
   affichée dans Ondi sous Réglages → Téléphone et télé (par exemple 192.168.1.50:8097). Touche rouge de la
   télécommande = changer de serveur ; Retour deux fois sur l'accueil d'Ondi = quitter.

Avant toute chose, demande-moi :
- le modèle exact de ma télé (sur l'étiquette au dos, ou dans Paramètres > Général > À propos de ce
  téléviseur) et sa version de webOS,
- si j'utilise un PC Windows ou un Mac pour l'installation,
- à quelle étape j'en suis et le message d'erreur exact que je vois, s'il y en a un.
Ensuite, guide-moi pas à pas. Si quelque chose ne correspond pas à ce que je vois à l'écran, dis-moi quoi
vérifier.
```
