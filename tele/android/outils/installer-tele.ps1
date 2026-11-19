# Installe l'application Débrideur sur une télé Android TV / Google TV / Fire TV, par le réseau (ADB).
# Lancé par installer-sur-la-tele.bat (double-clic). Télécharge les outils officiels de Google (platform-tools)
# dans le dossier « platform-tools » à côté, puis : adb connect <ip>:5555, adb install -r Debrideur.apk.
# (Fichier enregistré en UTF-8 avec BOM : sinon Windows PowerShell 5.1 abîme les accents.)
$ErrorActionPreference = 'Continue'
$ProgressPreference = 'SilentlyContinue'
$racine = Split-Path -Parent $PSScriptRoot
$apk = Join-Path $racine 'Debrideur.apk'
$adb = Join-Path $racine 'platform-tools\adb.exe'
$paquet = 'io.github.ishine93.debrideur'

function Dire([string]$en, [string]$fr, [string]$couleur = 'Gray') {
  Write-Host $en -ForegroundColor $couleur
  Write-Host $fr -ForegroundColor $couleur
}
function Terminer([int]$code) {
  if (Test-Path $adb) { & $adb kill-server 2>&1 | Out-Null }
  Write-Host ''
  Read-Host 'Press Enter to close / Appuie sur Entrée pour fermer' | Out-Null
  exit $code
}
# adb écrit aussi sur la sortie d'erreur : tout est ramené en simple texte.
function Invoke-Adb {
  $lignes = & $adb @args 2>&1 | ForEach-Object { "$_" }
  return ($lignes -join "`n").Trim()
}
function Read-Adresse([string]$question) {
  while ($true) {
    $r = (Read-Host $question) -replace '\s', ''
    if ($r -match '^\d{1,3}(\.\d{1,3}){3}(:\d{1,5})?$') {
      if ($r -notmatch ':') { $r = "${r}:5555" }
      return $r
    }
    Dire 'That is not an IP address (example: 192.168.1.50). Try again.' "Ce n'est pas une adresse IP (exemple : 192.168.1.50). Réessaie." 'Red'
  }
}
# Connexion + attente de l'autorisation sur la télé. Renvoie $true quand la télé accepte.
function Connect-Tele([string]$cible) {
  Dire "Connecting to the TV ($cible)..." "Connexion à la télé ($cible)..."
  $r = Invoke-Adb connect $cible
  Write-Host $r -ForegroundColor DarkGray
  if ($r -notmatch 'connected to|authenticate') { return $false }
  Dire 'Look at the TV: if it asks "Allow USB debugging?", tick "Always allow from this computer" and choose OK.' "Regarde la télé : si elle demande « Autoriser le débogage USB ? », coche « Toujours autoriser sur cet ordinateur » puis choisis OK." 'Yellow'
  for ($i = 1; $i -le 30; $i++) {
    if ((Invoke-Adb -s $cible get-state) -eq 'device') { return $true }
    if ($i % 5 -eq 0) { Invoke-Adb connect $cible | Out-Null }
    Start-Sleep -Seconds 2
  }
  return $false
}

Write-Host ''
Dire 'Débrideur - install the app on an Android TV, Google TV or Fire TV' "Débrideur - installer l'application sur une télé Android TV, Google TV ou Fire TV" 'Cyan'
Write-Host ''
if (-not (Test-Path $apk)) {
  Dire "Debrideur.apk was not found next to this script ($racine). Unzip the whole folder first." "Debrideur.apk est introuvable à côté de ce script ($racine). Décompresse d'abord tout le dossier." 'Red'
  Terminer 1
}

# 1. Outils officiels de Google (une seule fois).
if (-not (Test-Path $adb)) {
  Dire "Downloading Google's official Android tools (platform-tools, a few MB)..." 'Téléchargement des outils Android officiels de Google (platform-tools, quelques Mo)...'
  Dire 'They are covered by the Android SDK terms: https://developer.android.com/studio/terms' 'Ils relèvent des conditions du SDK Android : https://developer.android.com/studio/terms' 'DarkGray'
  $zip = Join-Path $env:TEMP 'platform-tools-latest-windows.zip'
  try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -UseBasicParsing -Uri 'https://dl.google.com/android/repository/platform-tools-latest-windows.zip' -OutFile $zip -ErrorAction Stop
    Expand-Archive -Path $zip -DestinationPath $racine -Force -ErrorAction Stop
    Remove-Item $zip -Force -ErrorAction SilentlyContinue
  } catch {
    Dire "Download failed: $($_.Exception.Message)" "Échec du téléchargement : $($_.Exception.Message)" 'Red'
    Dire 'Check the Internet connection of this PC, then try again.' 'Vérifie la connexion Internet de ce PC, puis réessaie.'
    Terminer 1
  }
}

# 2. La télé.
Dire 'On the TV, turn on debugging first (only once):' "Sur la télé, active d'abord le débogage (une seule fois) :" 'Yellow'
Dire '  Android TV / Google TV: Settings > System (or Device Preferences) > About > press "Build" 7 times,' '  Android TV / Google TV : Paramètres > Système (ou Préférences de l''appareil) > À propos > appuie 7 fois sur « Build »,'
Dire '    then Developer options > turn on "USB debugging" (and "Network debugging" if it exists).' '    puis Options pour les développeurs > active « Débogage USB » (et « Débogage réseau » s''il existe).'
Dire '  Fire TV: Settings > My Fire TV > About > press the device name 7 times,' "  Fire TV : Paramètres > Ma Fire TV > À propos > appuie 7 fois sur le nom de l'appareil,"
Dire '    then Settings > My Fire TV > Developer options > turn on "ADB debugging".' '    puis Paramètres > Ma Fire TV > Options pour les développeurs > active « Débogage ADB ».'
Dire 'The TV address: Settings > Network & Internet (Android TV) or Settings > My Fire TV > About > Network (Fire TV).' "L'adresse de la télé : Paramètres > Réseau et Internet (Android TV) ou Paramètres > Ma Fire TV > À propos > Réseau (Fire TV)."
Write-Host ''
$cible = Read-Adresse 'TV IP address, e.g. 192.168.1.50 / Adresse IP de la télé, ex. 192.168.1.50'
Invoke-Adb start-server | Out-Null

while (-not (Connect-Tele $cible)) {
  Write-Host ''
  Dire 'Could not connect to the TV.' 'Impossible de se connecter à la télé.' 'Red'
  Dire 'Check: TV switched on, same network as this PC, debugging turned on, right address.' 'Vérifie : télé allumée, même réseau que ce PC, débogage activé, bonne adresse.'
  Write-Host '  1) Try again / Réessayer'
  Write-Host '  2) Another address / Une autre adresse'
  Write-Host '  3) Pair with a code ("Wireless debugging", recent Google TV) / Associer avec un code (« Débogage sans fil », Google TV récentes)'
  Write-Host '  4) Quit / Quitter'
  $choix = Read-Host '>'
  if ($choix -eq '2') { $cible = Read-Adresse 'TV IP address / Adresse IP de la télé' }
  elseif ($choix -eq '3') {
    Dire 'On the TV: Developer options > Wireless debugging > Pair device with pairing code.' "Sur la télé : Options pour les développeurs > Débogage sans fil > Associer l'appareil avec un code." 'Yellow'
    $adresseCode = Read-Adresse 'Pairing IP:port shown on the TV / IP:port d''association affiché sur la télé'
    $code = (Read-Host 'Pairing code / Code d''association') -replace '\s', ''
    Write-Host (Invoke-Adb pair $adresseCode $code) -ForegroundColor DarkGray
    Dire 'Now the IP:port shown at the top of "Wireless debugging" (not the pairing one).' "Maintenant l'IP:port affiché en haut de « Débogage sans fil » (pas celui de l'association)."
    $cible = Read-Adresse 'IP:port'
  }
  elseif ($choix -eq '4') { Terminer 1 }
}

# 3. Installation.
Write-Host ''
Dire 'Installing Débrideur on the TV (this can take a minute)...' 'Installation du Débrideur sur la télé (cela peut prendre une minute)...'
$r = Invoke-Adb -s $cible install -r $apk
Write-Host $r -ForegroundColor DarkGray
if ($r -match 'INSTALL_FAILED_UPDATE_INCOMPATIBLE|signatures do not match') {
  Dire 'An older Débrideur app with a different signature is on the TV: it must be removed first (it will forget the server address, the new one finds it again).' "Une ancienne application Débrideur avec une autre signature est sur la télé : il faut d'abord la retirer (elle oubliera l'adresse du serveur, la nouvelle la retrouvera)." 'Yellow'
  $rep = Read-Host 'Uninstall it and install again? (y/n) / La désinstaller et réinstaller ? (o/n)'
  if ($rep -match '^[yYoO]') {
    Invoke-Adb -s $cible uninstall $paquet | Out-Null
    $r = Invoke-Adb -s $cible install $apk
    Write-Host $r -ForegroundColor DarkGray
  }
}
if ($r -match 'Success') {
  Invoke-Adb -s $cible shell am start -n "$paquet/.Principale" | Out-Null
  Write-Host ''
  Dire 'Done! Débrideur is installed and opening on the TV. You will find it with your other apps.' "C'est fait ! Le Débrideur est installé et s'ouvre sur la télé. Tu le retrouveras avec tes autres applications." 'Green'
  Dire 'You can now turn debugging off again on the TV if you wish.' 'Tu peux maintenant désactiver le débogage sur la télé si tu le souhaites.'
  Invoke-Adb disconnect $cible | Out-Null
  Terminer 0
}
Dire 'The installation failed (see the message above). The README file explains other ways to install.' "L'installation a échoué (voir le message ci-dessus). Le fichier README explique d'autres façons d'installer." 'Red'
Terminer 1
