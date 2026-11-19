#!/bin/bash
# Installe l'application Débrideur sur une télé Android TV / Google TV / Fire TV, par le réseau (ADB).
# Mac : double-clic (ou, dans le Terminal : bash installer-sur-la-tele.command). Linux : bash installer-sur-la-tele.command
# Télécharge les outils officiels de Google (platform-tools) dans le dossier « platform-tools » à côté,
# puis : adb connect <ip>:5555, adb install -r Debrideur.apk. (Compatible avec le bash 3.2 des Mac.)
cd "$(dirname "$0")" || exit 1
ICI="$(pwd)"
APK="$ICI/Debrideur.apk"
ADB="$ICI/platform-tools/adb"
PAQUET="io.github.ishine93.debrideur"
RE_ADRESSE='^[0-9]{1,3}(\.[0-9]{1,3}){3}(:[0-9]{1,5})?$'

dire() { printf '%s\n%s\n' "$1" "$2"; }
titre() { printf '\033[1m%s\n%s\033[0m\n' "$1" "$2"; }
terminer() {
  [ -x "$ADB" ] && "$ADB" kill-server >/dev/null 2>&1
  echo
  read -r -p "Press Enter to close / Appuie sur Entrée pour fermer " _
  exit "${1:-0}"
}
# Demande une adresse IP (avec ou sans :port) ; le résultat est dans $ADRESSE (port 5555 par défaut).
demander_adresse() {
  while true; do
    read -r -p "$1: " ADRESSE
    ADRESSE="$(printf '%s' "$ADRESSE" | tr -d '[:space:]')"
    if [[ $ADRESSE =~ $RE_ADRESSE ]]; then
      case "$ADRESSE" in *:*) ;; *) ADRESSE="$ADRESSE:5555" ;; esac
      return 0
    fi
    dire "That is not an IP address (example: 192.168.1.50). Try again." "Ce n'est pas une adresse IP (exemple : 192.168.1.50). Réessaie."
  done
}
# Connexion + attente de l'autorisation sur la télé. Réussit quand la télé accepte.
connecter() {
  local r i
  dire "Connecting to the TV ($1)..." "Connexion à la télé ($1)..."
  r="$("$ADB" connect "$1" 2>&1)"
  echo "$r"
  case "$r" in *"connected to"*|*authenticate*) ;; *) return 1 ;; esac
  titre 'Look at the TV: if it asks "Allow USB debugging?", tick "Always allow from this computer" and choose OK.' \
        "Regarde la télé : si elle demande « Autoriser le débogage USB ? », coche « Toujours autoriser sur cet ordinateur » puis choisis OK."
  for ((i = 1; i <= 30; i++)); do
    [ "$("$ADB" -s "$1" get-state 2>/dev/null)" = "device" ] && return 0
    [ $((i % 5)) -eq 0 ] && "$ADB" connect "$1" >/dev/null 2>&1
    sleep 2
  done
  return 1
}

echo
titre "Débrideur - install the app on an Android TV, Google TV or Fire TV" "Débrideur - installer l'application sur une télé Android TV, Google TV ou Fire TV"
echo
if [ ! -f "$APK" ]; then
  dire "Debrideur.apk was not found next to this script ($ICI). Unzip the whole folder first." "Debrideur.apk est introuvable à côté de ce script ($ICI). Décompresse d'abord tout le dossier."
  terminer 1
fi

# 1. Outils officiels de Google (une seule fois).
if [ ! -x "$ADB" ]; then
  case "$(uname -s)" in
    Darwin) systeme=darwin ;;
    Linux) systeme=linux ;;
    *) dire "This system is not supported." "Ce système n'est pas pris en charge."; terminer 1 ;;
  esac
  url="https://dl.google.com/android/repository/platform-tools-latest-$systeme.zip"
  dire "Downloading Google's official Android tools (platform-tools, a few MB)..." "Téléchargement des outils Android officiels de Google (platform-tools, quelques Mo)..."
  dire "They are covered by the Android SDK terms: https://developer.android.com/studio/terms" "Ils relèvent des conditions du SDK Android : https://developer.android.com/studio/terms"
  if command -v curl >/dev/null 2>&1; then curl -fL --progress-bar -o "$ICI/platform-tools.zip" "$url"
  else wget -O "$ICI/platform-tools.zip" "$url"; fi
  if [ $? -ne 0 ] || ! unzip -q -o "$ICI/platform-tools.zip" -d "$ICI"; then
    dire "Download failed: check the Internet connection of this computer, then try again." "Échec du téléchargement : vérifie la connexion Internet de cet ordinateur, puis réessaie."
    rm -f "$ICI/platform-tools.zip"
    terminer 1
  fi
  rm -f "$ICI/platform-tools.zip"
  chmod +x "$ADB"
fi

# 2. La télé.
titre "On the TV, turn on debugging first (only once):" "Sur la télé, active d'abord le débogage (une seule fois) :"
dire '  Android TV / Google TV: Settings > System (or Device Preferences) > About > press "Build" 7 times,' \
     "  Android TV / Google TV : Paramètres > Système (ou Préférences de l'appareil) > À propos > appuie 7 fois sur « Build »,"
dire '    then Developer options > turn on "USB debugging" (and "Network debugging" if it exists).' \
     "    puis Options pour les développeurs > active « Débogage USB » (et « Débogage réseau » s'il existe)."
dire "  Fire TV: Settings > My Fire TV > About > press the device name 7 times," \
     "  Fire TV : Paramètres > Ma Fire TV > À propos > appuie 7 fois sur le nom de l'appareil,"
dire '    then Settings > My Fire TV > Developer options > turn on "ADB debugging".' \
     "    puis Paramètres > Ma Fire TV > Options pour les développeurs > active « Débogage ADB »."
dire "The TV address: Settings > Network & Internet (Android TV) or Settings > My Fire TV > About > Network (Fire TV)." \
     "L'adresse de la télé : Paramètres > Réseau et Internet (Android TV) ou Paramètres > Ma Fire TV > À propos > Réseau (Fire TV)."
echo
demander_adresse "TV IP address, e.g. 192.168.1.50 / Adresse IP de la télé, ex. 192.168.1.50"
CIBLE="$ADRESSE"
"$ADB" start-server >/dev/null 2>&1

until connecter "$CIBLE"; do
  echo
  dire "Could not connect to the TV." "Impossible de se connecter à la télé."
  dire "Check: TV switched on, same network as this computer, debugging turned on, right address." \
       "Vérifie : télé allumée, même réseau que cet ordinateur, débogage activé, bonne adresse."
  echo "  1) Try again / Réessayer"
  echo "  2) Another address / Une autre adresse"
  echo "  3) Pair with a code (\"Wireless debugging\", recent Google TV) / Associer avec un code (« Débogage sans fil », Google TV récentes)"
  echo "  4) Quit / Quitter"
  read -r -p "> " choix
  case "$choix" in
    2) demander_adresse "TV IP address / Adresse IP de la télé"; CIBLE="$ADRESSE" ;;
    3)
      dire "On the TV: Developer options > Wireless debugging > Pair device with pairing code." \
           "Sur la télé : Options pour les développeurs > Débogage sans fil > Associer l'appareil avec un code."
      demander_adresse "Pairing IP:port shown on the TV / IP:port d'association affiché sur la télé"
      read -r -p "Pairing code / Code d'association: " code
      "$ADB" pair "$ADRESSE" "$(printf '%s' "$code" | tr -d '[:space:]')"
      dire 'Now the IP:port shown at the top of "Wireless debugging" (not the pairing one).' \
           "Maintenant l'IP:port affiché en haut de « Débogage sans fil » (pas celui de l'association)."
      demander_adresse "IP:port"
      CIBLE="$ADRESSE"
      ;;
    4) terminer 1 ;;
  esac
done

# 3. Installation.
echo
dire "Installing Débrideur on the TV (this can take a minute)..." "Installation du Débrideur sur la télé (cela peut prendre une minute)..."
r="$("$ADB" -s "$CIBLE" install -r "$APK" 2>&1)"
echo "$r"
case "$r" in
  *INSTALL_FAILED_UPDATE_INCOMPATIBLE*|*"signatures do not match"*)
    dire "An older Débrideur app with a different signature is on the TV: it must be removed first (it will forget the server address, the new one finds it again)." \
         "Une ancienne application Débrideur avec une autre signature est sur la télé : il faut d'abord la retirer (elle oubliera l'adresse du serveur, la nouvelle la retrouvera)."
    read -r -p "Uninstall it and install again? (y/n) / La désinstaller et réinstaller ? (o/n) " rep
    case "$rep" in
      [yYoO]*)
        "$ADB" -s "$CIBLE" uninstall "$PAQUET" >/dev/null 2>&1
        r="$("$ADB" -s "$CIBLE" install "$APK" 2>&1)"
        echo "$r"
        ;;
    esac
    ;;
esac
case "$r" in
  *Success*)
    "$ADB" -s "$CIBLE" shell am start -n "$PAQUET/.Principale" >/dev/null 2>&1
    echo
    titre "Done! Débrideur is installed and opening on the TV. You will find it with your other apps." \
          "C'est fait ! Le Débrideur est installé et s'ouvre sur la télé. Tu le retrouveras avec tes autres applications."
    dire "You can now turn debugging off again on the TV if you wish." "Tu peux maintenant désactiver le débogage sur la télé si tu le souhaites."
    "$ADB" disconnect "$CIBLE" >/dev/null 2>&1
    terminer 0
    ;;
esac
dire "The installation failed (see the message above). The README file explains other ways to install." \
     "L'installation a échoué (voir le message ci-dessus). Le fichier README explique d'autres façons d'installer."
terminer 1
