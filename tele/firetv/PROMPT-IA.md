# Get help from an AI assistant / Se faire aider par une IA

Copy the whole message below (the grey box) and paste it into ChatGPT, Claude, Gemini or another AI assistant. It will guide you step by step.

*Version française plus bas.*

```text
Hello! I am not very technical and I need you to guide me, one step at a time, to install an app on my Amazon Fire TV.

The situation:
- At home, I run "Débrideur" (https://github.com/Ishine93/Debrideur): a server installed on a Windows PC, a Mac or a mini-PC on my home network. It shows a web page (library, player, downloads) at http://<the computer's address>:8097/. It already works on my computer.
- I want the Débrideur TV app on my Fire TV. It is not in the Amazon Appstore: it is an Android APK file to install by hand (sideloading). The app is only a window onto the server; it finds the server on the network by itself.
- Direct link to the app: https://github.com/Ishine93/Debrideur/releases/latest/download/Debrideur.apk
- I may also have downloaded the zip "Debrideur-FireTV.zip". It contains: Debrideur.apk (the app), installer-sur-la-tele.bat (installer for Windows, double-click), installer-sur-la-tele.command (installer for Mac/Linux), an "outils" folder used by the Windows installer, and a README.md guide.

The possible ways to install, according to the guide:
First, turn on Developer Options (only once): Settings > My Fire TV > About > press the middle button 7 times on the device name.
A) Easiest, without a computer: install the free "Downloader" app (by AFTVnews) from the Fire TV search, allow it in Settings > My Fire TV > Developer Options > Install unknown apps, open it, type the direct link above, Go, then Install.
B) From the computer with the installer (uses Google's official adb tool, downloaded automatically): turn on "ADB debugging" in Developer Options, find the Fire TV's IP address (Settings > My Fire TV > About > Network), run the installer, give it the IP address, then accept "Allow USB debugging?" on the TV.
Note: some recent models running Amazon's Vega OS (for example the Fire TV Stick 4K Select) cannot install Android apps at all.

After installing: open Débrideur from "Your Apps & Games". It finds the server by itself; otherwise it shows "Server not found" and I type the address shown at the bottom of the Débrideur page on my computer (like 192.168.1.50:8097). The computer must be on and on the same network as the Fire TV.

What I would like:
1. First, ask me the exact Fire TV model I have (Fire TV Stick, 4K, 4K Max, Cube, a TV with Fire TV built in…; it is shown in Settings > My Fire TV > About), and whether I have a computer nearby.
2. Then choose the simplest way for my case and explain it one step at a time, with the exact menu names for my model. Wait for my answer after each step before going on.
3. If something does not work, ask me what I see on the screen and help me fix it.
Please do not suggest jailbreaking, unofficial app stores, or anything unrelated to these instructions. Answer in English.
```

---

# Se faire aider par une IA

Copie tout le message ci-dessous (le cadre gris) et colle-le dans ChatGPT, Claude, Gemini ou une autre IA. Elle te guidera pas à pas.

```text
Bonjour ! Je ne suis pas très à l'aise avec l'informatique et j'ai besoin que tu me guides, une étape à la fois, pour installer une application sur mon Amazon Fire TV.

La situation :
- Chez moi, j'utilise « Débrideur » (https://github.com/Ishine93/Debrideur) : un serveur installé sur un PC Windows, un Mac ou un mini-PC de mon réseau. Il affiche une page web (bibliothèque, lecteur, téléchargements) à l'adresse http://<adresse de l'ordinateur>:8097/. Ça marche déjà sur mon ordinateur.
- Je veux l'application télé du Débrideur sur ma Fire TV. Elle n'est pas sur l'Appstore d'Amazon : c'est un fichier APK Android à installer à la main (sideloading). L'application n'est qu'une fenêtre sur le serveur ; elle le trouve toute seule sur le réseau.
- Lien direct vers l'application : https://github.com/Ishine93/Debrideur/releases/latest/download/Debrideur.apk
- J'ai peut-être aussi téléchargé le zip « Debrideur-FireTV.zip ». Il contient : Debrideur.apk (l'application), installer-sur-la-tele.bat (installateur pour Windows, double-clic), installer-sur-la-tele.command (installateur pour Mac/Linux), un dossier « outils » utilisé par l'installateur Windows, et un guide README.md.

Les façons d'installer, d'après le guide :
D'abord, activer les options pour les développeurs (une seule fois) : Paramètres > Ma Fire TV > À propos > appuyer 7 fois sur le bouton central sur le nom de l'appareil.
A) Le plus simple, sans ordinateur : installer l'application gratuite « Downloader » (d'AFTVnews) depuis la recherche de la Fire TV, l'autoriser dans Paramètres > Ma Fire TV > Options pour les développeurs > Installer des applications inconnues, l'ouvrir, taper le lien direct ci-dessus, Go, puis Installer.
B) Depuis l'ordinateur avec l'installateur (il utilise l'outil officiel adb de Google, téléchargé automatiquement) : activer « Débogage ADB » dans les options pour les développeurs, trouver l'adresse IP de la Fire TV (Paramètres > Ma Fire TV > À propos > Réseau), lancer l'installateur, lui donner l'adresse IP, puis accepter « Autoriser le débogage USB ? » sur la télé.
À noter : certains modèles récents sous Vega OS d'Amazon (par exemple le Fire TV Stick 4K Select) ne peuvent pas du tout installer d'applications Android.

Après l'installation : ouvrir Débrideur depuis « Vos applis et jeux ». Il trouve le serveur tout seul ; sinon il affiche « Serveur introuvable » et je tape l'adresse affichée en bas de la page du Débrideur sur mon ordinateur (du genre 192.168.1.50:8097). L'ordinateur doit être allumé et sur le même réseau que la Fire TV.

Ce que je voudrais :
1. D'abord, demande-moi le modèle exact de ma Fire TV (Fire TV Stick, 4K, 4K Max, Cube, une télé avec Fire TV intégré… ; il est indiqué dans Paramètres > Ma Fire TV > À propos) et si j'ai un ordinateur à côté.
2. Ensuite, choisis la méthode la plus simple pour mon cas et explique-la une étape à la fois, avec les noms de menus exacts de mon modèle. Attends ma réponse après chaque étape avant de continuer.
3. Si quelque chose ne marche pas, demande-moi ce que je vois à l'écran et aide-moi à corriger.
Ne me propose pas de « jailbreak », de magasins d'applications non officiels, ni rien qui sorte de ces instructions. Réponds en français.
```
