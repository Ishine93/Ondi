#!/bin/bash
# Installe l'application Ondi sur une télé LG (webOS) en mode développeur, depuis un Mac (marche aussi sous Linux).
# Double-clic, ou dans le Terminal : bash installer-sur-la-tele.command
# Rien n'est installé dans le système : Node.js (si celui de l'ordinateur manque ou est trop ancien) et l'outil
# officiel de LG (@webos-tools/cli) vont dans le dossier « outils » à côté de ce script.
set -uo pipefail

NODE_VERSION="24.22.1"
CLI_VERSION="3.2.6"
APP_ID="io.github.ishine93.debrideur"
ICI="$(cd "$(dirname "$0")" && pwd)"
OUTILS="$ICI/outils"
CLI="$OUTILS/webos-cli"
ARES="$CLI/node_modules/.bin"
IPK="$ICI/Ondi.ipk"

bleu=$'\033[36m'; rouge=$'\033[31m'; jaune=$'\033[33m'; normal=$'\033[0m'
dire() { printf '%s\n%s\n' "$1" "$2"; }
titre() { printf '\n%s%s\n%s%s\n' "$bleu" "$1" "$2" "$normal"; }
erreur() { printf '\n%s%s\n%s%s\n' "$rouge" "$1" "$2" "$normal"; }
demander() { # la réponse va dans REPONSE, sans espaces
  printf '\n%s%s\n%s%s\n' "$jaune" "$1" "$2" "$normal"
  REPONSE=""
  if ! read -r -p '> ' REPONSE; then echo; exit 1; fi   # plus rien à lire (fenêtre fermée) : on s'arrête
  REPONSE="$(printf '%s' "$REPONSE" | tr -d '[:space:]')"
}
finir() { echo; read -r -p "Press Enter to close / Appuie sur Entrée pour fermer " _ || true; exit "$1"; }

titre "Ondi - install the app on an LG TV" "Ondi - installer l'appli sur une télé LG"
dire 'Before you start, on the TV: the "Developer Mode" app is open, "Dev Mode Status" is ON and "Key Server" is ON.' \
     "Avant de commencer, sur la télé : l'appli « Developer Mode » est ouverte, « Dev Mode Status » est sur ON et « Key Server » est sur ON."
dire "The TV and this computer must be on the same network." "La télé et cet ordinateur doivent être sur le même réseau."
if [ ! -f "$IPK" ]; then
  erreur "Ondi.ipk was not found next to this script ($ICI). Extract the whole zip, then run the script again." \
         "Ondi.ipk est introuvable à côté de ce script ($ICI). Décompresse tout le zip, puis relance le script."
  finir 1
fi

# --- 1. Node.js : celui de l'ordinateur s'il est assez récent (>= 20, exigé par l'outil LG), sinon une copie portable vérifiée.
titre "Step 1/4 - Node.js" "Étape 1/4 - Node.js"
majeure=0
if command -v node >/dev/null 2>&1; then majeure="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"; fi
if [ "$majeure" -ge 20 ] 2>/dev/null; then
  dire "Node.js $(node -v) is already on this computer." "Node.js $(node -v) est déjà sur cet ordinateur."
else
  case "$(uname -s)" in Darwin) os=darwin ;; Linux) os=linux ;; *) os="" ;; esac
  case "$(uname -m)" in arm64|aarch64) arch=arm64 ;; x86_64|amd64) arch=x64 ;; *) arch="" ;; esac
  if [ -z "$os" ] || [ -z "$arch" ]; then
    erreur "Unsupported computer. Install Node.js 20 or newer from nodejs.org, then run the script again." \
           "Ordinateur non pris en charge. Installe Node.js 20 ou plus récent depuis nodejs.org, puis relance le script."
    finir 1
  fi
  nom="node-v$NODE_VERSION-$os-$arch"
  if [ ! -x "$OUTILS/$nom/bin/node" ]; then
    dire "Downloading Node.js $NODE_VERSION from nodejs.org (about 50 MB)..." "Téléchargement de Node.js $NODE_VERSION depuis nodejs.org (environ 50 Mo)..."
    mkdir -p "$OUTILS"
    base="https://nodejs.org/dist/v$NODE_VERSION"
    if ! curl -fL --progress-bar -o "$OUTILS/$nom.tar.gz" "$base/$nom.tar.gz" || ! curl -fsSL -o "$OUTILS/SHASUMS256.txt" "$base/SHASUMS256.txt"; then
      erreur "Download failed. Check the internet connection and run the script again." \
             "Le téléchargement a échoué. Vérifie la connexion internet et relance le script."
      finir 1
    fi
    # Vérification : l'empreinte SHA-256 doit être celle publiée par nodejs.org.
    attendu="$(awk -v f="$nom.tar.gz" '$2 == f { print $1 }' "$OUTILS/SHASUMS256.txt")"
    if command -v shasum >/dev/null 2>&1; then obtenu="$(shasum -a 256 "$OUTILS/$nom.tar.gz" | awk '{ print $1 }')"
    else obtenu="$(sha256sum "$OUTILS/$nom.tar.gz" | awk '{ print $1 }')"; fi
    rm -f "$OUTILS/SHASUMS256.txt"
    if [ -z "$attendu" ] || [ "$obtenu" != "$attendu" ]; then
      rm -f "$OUTILS/$nom.tar.gz"
      erreur "The Node.js download is damaged (wrong checksum). Run the script again." \
             "Le Node.js téléchargé est abîmé (mauvaise somme de contrôle). Relance le script."
      finir 1
    fi
    dire "Checksum OK, unpacking..." "Somme de contrôle correcte, décompression..."
    tar -xzf "$OUTILS/$nom.tar.gz" -C "$OUTILS" || { erreur "Unpacking failed." "La décompression a échoué."; finir 1; }
    rm -f "$OUTILS/$nom.tar.gz"
  fi
  export PATH="$OUTILS/$nom/bin:$PATH"
  dire "Using Node.js $NODE_VERSION from the outils folder." "Utilisation de Node.js $NODE_VERSION du dossier outils."
fi

# --- 2. L'outil officiel de LG, dans outils/webos-cli (déjà là ? on le garde).
titre "Step 2/4 - LG developer tools" "Étape 2/4 - Outils de développement LG"
version="$(node -p 'try { require(process.argv[1]).version } catch (e) { "" }' "$CLI/node_modules/@webos-tools/cli/package.json" 2>/dev/null || true)"
if [ "$version" != "$CLI_VERSION" ]; then
  dire "Installing the official LG tools into the outils folder (1 to 2 minutes)..." \
       "Installation des outils officiels LG dans le dossier outils (1 à 2 minutes)..."
  if ! npm install --prefix "$CLI" --cache "$OUTILS/npm-cache" --no-audit --no-fund --no-update-notifier --loglevel=error "@webos-tools/cli@$CLI_VERSION" </dev/null \
     || [ ! -x "$ARES/ares-install" ]; then
    erreur "Installing the LG tools failed. Check the internet connection and run the script again." \
           "L'installation des outils LG a échoué. Vérifie la connexion internet et relance le script."
    finir 1
  fi
fi
dire "LG tools ready." "Outils LG prêts."

# --- 3. La télé : adresse IP, puis la clé (phrase secrète affichée dans Developer Mode).
# Les outils LG lisent l'entrée du terminal pendant qu'ils tournent : on la leur ferme (</dev/null).
titre "Step 3/4 - Connect to the TV" "Étape 3/4 - Connexion à la télé"
liste="$("$ARES/ares-setup-device" --list </dev/null 2>/dev/null || true)"
existe=non; printf '%s\n' "$liste" | grep -q '^tv ' && existe=oui
ancienne="$(printf '%s\n' "$liste" | sed -n 's/^tv  *[^ ]*@\([0-9.]*\):.*/\1/p' | head -n 1)"
while :; do
  if [ -n "$ancienne" ]; then
    demander "TV IP address, shown in the Developer Mode app (press Enter to keep $ancienne):" \
             "Adresse IP de la télé, affichée dans l'appli Developer Mode (Entrée pour garder $ancienne) :"
    REPONSE="${REPONSE:-$ancienne}"
  else
    demander "TV IP address, shown in the Developer Mode app (for example 192.168.1.50):" \
             "Adresse IP de la télé, affichée dans l'appli Developer Mode (par exemple 192.168.1.50) :"
  fi
  if [[ "$REPONSE" =~ ^[0-9]{1,3}(\.[0-9]{1,3}){3}$ ]]; then ip="$REPONSE"; break; fi
  erreur "That is not an IP address. Type it like 192.168.1.50" "Ce n'est pas une adresse IP. Tape-la comme 192.168.1.50"
done
mode=--add; [ "$existe" = oui ] && mode=--modify
if ! "$ARES/ares-setup-device" "$mode" tv -i "host=$ip" -i "port=9922" -i "username=prisoner" </dev/null >/dev/null; then
  erreur "Could not save the TV settings." "Impossible d'enregistrer les réglages de la télé."
  finir 1
fi

while :; do
  REPONSE=""
  while [ -z "$REPONSE" ]; do
    demander "Passphrase shown in the Developer Mode app (6 characters, exactly as shown):" \
             "Phrase secrète (Passphrase) affichée dans l'appli Developer Mode (6 caractères, exactement comme affichés) :"
  done
  dire "Getting the key from the TV..." "Récupération de la clé sur la télé..."
  if "$ARES/ares-novacom" --device tv --getkey --passphrase "$REPONSE" </dev/null; then break; fi
  erreur 'Could not get the key. On the TV: is the Developer Mode app open, with "Key Server" ON? Is the IP address right?' \
         "Impossible de récupérer la clé. Sur la télé : l'appli Developer Mode est-elle ouverte, avec « Key Server » sur ON ? L'adresse IP est-elle juste ?"
  demander "Press Enter to try again, or type Q to quit." "Appuie sur Entrée pour réessayer, ou tape Q pour quitter."
  case "$REPONSE" in q*|Q*) finir 1 ;; esac
done

# --- 4. Installation de Ondi.ipk, puis lancement.
titre "Step 4/4 - Install Ondi on the TV" "Étape 4/4 - Installation d'Ondi sur la télé"
if ! "$ARES/ares-install" --device tv "$IPK" </dev/null; then
  erreur 'Installation failed. If the message says "passphrase", run the script again and type the passphrase exactly as shown. Otherwise check that Dev Mode Status is still ON.' \
         "L'installation a échoué. Si le message parle de « passphrase », relance le script et tape la phrase secrète exactement comme affichée. Sinon vérifie que Dev Mode Status est toujours sur ON."
  finir 1
fi
"$ARES/ares-launch" --device tv "$APP_ID" </dev/null >/dev/null || true
titre "Done! Ondi is installed and opening on the TV. You will find it in the TV's app list." \
      "Terminé ! Ondi est installé et s'ouvre sur la télé. Tu le retrouveras dans la liste des applis de la télé."
dire 'Remember: open the Developer Mode app now and then and press "Extend" before the time runs out, or the TV removes the app.' \
     "Pense à ouvrir l'appli Developer Mode de temps en temps et à appuyer sur « Extend » avant la fin du compte à rebours, sinon la télé supprime l'appli."
finir 0
