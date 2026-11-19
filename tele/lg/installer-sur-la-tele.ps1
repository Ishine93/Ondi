# Installe l'application Débrideur sur une télé LG (webOS) en mode développeur. Lancé par installer-sur-la-tele.bat.
# Rien n'est installé dans Windows : Node.js (si celui du PC manque ou est trop ancien) et l'outil officiel
# de LG (@webos-tools/cli) vont dans le dossier « outils » à côté de ce script. Fichier enregistré en UTF-8 avec BOM
# (sinon Windows PowerShell 5.1 abîme les accents).

$ProgressPreference = 'SilentlyContinue'   # sinon Invoke-WebRequest est très lent
$NODE_VERSION = '24.22.1'
$CLI_VERSION = '3.2.6'
$APP_ID = 'io.github.ishine93.debrideur'
$ici = $PSScriptRoot
$outils = Join-Path $ici 'outils'
$ipk = Join-Path $ici 'Debrideur.ipk'

function Dire($en, $fr, $couleur = 'Gray') { Write-Host $en -ForegroundColor $couleur; Write-Host $fr -ForegroundColor $couleur }
function Titre($en, $fr) { Write-Host ''; Dire $en $fr 'Cyan' }
function Erreur($en, $fr) { Write-Host ''; Dire $en $fr 'Red' }
function Demander($en, $fr) { Write-Host ''; Dire $en $fr 'Yellow'; return ((Read-Host '>') -replace '\s', '') }
function Finir($code) { Write-Host ''; exit $code }
function Ares($outil) { return (Join-Path $ici "outils\webos-cli\node_modules\.bin\$outil.cmd") }

Titre 'Débrideur - install the app on an LG TV' 'Débrideur - installer l''appli sur une télé LG'
Dire 'Before you start, on the TV: the "Developer Mode" app is open, "Dev Mode Status" is ON and "Key Server" is ON.' `
     'Avant de commencer, sur la télé : l''appli « Developer Mode » est ouverte, « Dev Mode Status » est sur ON et « Key Server » est sur ON.'
Dire 'The TV and this computer must be on the same network.' 'La télé et cet ordinateur doivent être sur le même réseau.'
if (-not (Test-Path $ipk)) {
  Erreur "Debrideur.ipk was not found next to this script ($ici). Extract the whole zip, then run the script again." `
         "Debrideur.ipk est introuvable à côté de ce script ($ici). Décompresse tout le zip, puis relance le script."
  Finir 1
}

# --- 1. Node.js : celui du PC s'il est assez récent (>= 20, exigé par l'outil LG), sinon une copie portable vérifiée.
Titre 'Step 1/4 - Node.js' 'Étape 1/4 - Node.js'
$majeure = 0
if (Get-Command node -ErrorAction SilentlyContinue) { $v = & node -v; if ("$v" -match '^v(\d+)\.') { $majeure = [int]$Matches[1] } }
if ($majeure -ge 20) {
  Dire "Node.js $v is already on this computer." "Node.js $v est déjà sur cet ordinateur."
} else {
  if ([Environment]::Is64BitOperatingSystem -eq $false) {
    Erreur 'This script needs 64-bit Windows.' 'Ce script demande Windows 64 bits.'; Finir 1
  }
  $arch = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64' -or $env:PROCESSOR_ARCHITEW6432 -eq 'ARM64') { 'arm64' } else { 'x64' }
  $nom = "node-v$NODE_VERSION-win-$arch"
  $dossierNode = Join-Path $outils $nom
  if (-not (Test-Path (Join-Path $dossierNode 'node.exe'))) {
    Dire "Downloading Node.js $NODE_VERSION from nodejs.org (about 35 MB)..." "Téléchargement de Node.js $NODE_VERSION depuis nodejs.org (environ 35 Mo)..."
    New-Item -ItemType Directory -Force $outils | Out-Null
    [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
    $base = "https://nodejs.org/dist/v$NODE_VERSION"
    $zip = Join-Path $outils "$nom.zip"
    $sommes = Join-Path $outils 'SHASUMS256.txt'
    try {
      Invoke-WebRequest -UseBasicParsing -Uri "$base/$nom.zip" -OutFile $zip -ErrorAction Stop
      Invoke-WebRequest -UseBasicParsing -Uri "$base/SHASUMS256.txt" -OutFile $sommes -ErrorAction Stop
    } catch {
      Erreur "Download failed: $($_.Exception.Message). Check the internet connection and run the script again." `
             "Le téléchargement a échoué : $($_.Exception.Message). Vérifie la connexion internet et relance le script."
      Finir 1
    }
    # Vérification : l'empreinte SHA-256 doit être celle publiée par nodejs.org.
    $attendu = ''
    $ligne = Select-String -Path $sommes -Pattern ('^([0-9a-f]{64})\s+' + [regex]::Escape("$nom.zip") + '$') | Select-Object -First 1
    if ($ligne) { $attendu = $ligne.Matches[0].Groups[1].Value }
    $obtenu = (Get-FileHash -Algorithm SHA256 -Path $zip).Hash
    Remove-Item $sommes -Force
    if (-not $attendu -or $obtenu -ne $attendu) {
      Remove-Item $zip -Force
      Erreur 'The Node.js download is damaged (wrong checksum). Run the script again.' 'Le Node.js téléchargé est abîmé (mauvaise somme de contrôle). Relance le script.'
      Finir 1
    }
    Dire 'Checksum OK, unpacking...' 'Somme de contrôle correcte, décompression...'
    if (Get-Command tar.exe -ErrorAction SilentlyContinue) { tar.exe -xf $zip -C $outils }
    if (-not (Test-Path (Join-Path $dossierNode 'node.exe'))) { Expand-Archive -Path $zip -DestinationPath $outils -Force }
    Remove-Item $zip -Force
  }
  $env:Path = "$dossierNode;$env:Path"
  Dire "Using Node.js $NODE_VERSION from the outils folder." "Utilisation de Node.js $NODE_VERSION du dossier outils."
}

# --- 2. L'outil officiel de LG, dans outils\webos-cli (déjà là ? on le garde).
Titre 'Step 2/4 - LG developer tools' 'Étape 2/4 - Outils de développement LG'
$cli = Join-Path $outils 'webos-cli'
$paquetCli = Join-Path $cli 'node_modules\@webos-tools\cli\package.json'
$version = ''
if (Test-Path $paquetCli) { $version = (Get-Content $paquetCli -Raw | ConvertFrom-Json).version }
if ($version -ne $CLI_VERSION) {
  Dire 'Installing the official LG tools into the outils folder (1 to 2 minutes)...' 'Installation des outils officiels LG dans le dossier outils (1 à 2 minutes)...'
  & npm.cmd install --prefix $cli --cache (Join-Path $outils 'npm-cache') --no-audit --no-fund --no-update-notifier --loglevel=error "@webos-tools/cli@$CLI_VERSION"
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path (Ares 'ares-install'))) {
    Erreur 'Installing the LG tools failed. Check the internet connection and run the script again.' `
           'L''installation des outils LG a échoué. Vérifie la connexion internet et relance le script.'
    Finir 1
  }
}
Dire 'LG tools ready.' 'Outils LG prêts.'

# --- 3. La télé : adresse IP, puis la clé (phrase secrète affichée dans Developer Mode).
Titre 'Step 3/4 - Connect to the TV' 'Étape 3/4 - Connexion à la télé'
$liste = (& (Ares 'ares-setup-device') --list) | Out-String
$existe = $liste -match '(?m)^tv\s'
$ancienne = if ($liste -match '(?m)^tv\s+\S+@([\d.]+):') { $Matches[1] } else { '' }
do {
  if ($ancienne) {
    $ip = Demander "TV IP address, shown in the Developer Mode app (press Enter to keep $ancienne):" "Adresse IP de la télé, affichée dans l'appli Developer Mode (Entrée pour garder $ancienne) :"
    if (-not $ip) { $ip = $ancienne }
  } else {
    $ip = Demander 'TV IP address, shown in the Developer Mode app (for example 192.168.1.50):' "Adresse IP de la télé, affichée dans l'appli Developer Mode (par exemple 192.168.1.50) :"
  }
  $ipOk = $ip -match '^\d{1,3}(\.\d{1,3}){3}$'
  if (-not $ipOk) { Erreur 'That is not an IP address. Type it like 192.168.1.50' 'Ce n''est pas une adresse IP. Tape-la comme 192.168.1.50' }
} until ($ipOk)
$mode = if ($existe) { '--modify' } else { '--add' }
& (Ares 'ares-setup-device') $mode tv -i "host=$ip" -i 'port=9922' -i 'username=prisoner' | Out-Null
if ($LASTEXITCODE -ne 0) { Erreur 'Could not save the TV settings.' 'Impossible d''enregistrer les réglages de la télé.'; Finir 1 }

do {
  do {
    $phrase = Demander 'Passphrase shown in the Developer Mode app (6 characters, exactly as shown):' 'Phrase secrète (Passphrase) affichée dans l''appli Developer Mode (6 caractères, exactement comme affichés) :'
  } until ($phrase)
  Dire 'Getting the key from the TV...' 'Récupération de la clé sur la télé...'
  & (Ares 'ares-novacom') --device tv --getkey --passphrase $phrase
  $cleOk = $LASTEXITCODE -eq 0
  if (-not $cleOk) {
    Erreur 'Could not get the key. On the TV: is the Developer Mode app open, with "Key Server" ON? Is the IP address right?' `
           'Impossible de récupérer la clé. Sur la télé : l''appli Developer Mode est-elle ouverte, avec « Key Server » sur ON ? L''adresse IP est-elle juste ?'
    $r = Demander 'Press Enter to try again, or type Q to quit.' 'Appuie sur Entrée pour réessayer, ou tape Q pour quitter.'
    if ($r -match '^[qQ]') { Finir 1 }
  }
} until ($cleOk)

# --- 4. Installation de Debrideur.ipk, puis lancement.
Titre 'Step 4/4 - Install Débrideur on the TV' 'Étape 4/4 - Installation du Débrideur sur la télé'
& (Ares 'ares-install') --device tv $ipk
if ($LASTEXITCODE -ne 0) {
  Erreur 'Installation failed. If the message says "passphrase", run the script again and type the passphrase exactly as shown. Otherwise check that Dev Mode Status is still ON.' `
         'L''installation a échoué. Si le message parle de « passphrase », relance le script et tape la phrase secrète exactement comme affichée. Sinon vérifie que Dev Mode Status est toujours sur ON.'
  Finir 1
}
& (Ares 'ares-launch') --device tv $APP_ID | Out-Null
Titre 'Done! Débrideur is installed and opening on the TV. You will find it in the TV''s app list.' `
      'Terminé ! Le Débrideur est installé et s''ouvre sur la télé. Tu le retrouveras dans la liste des applis de la télé.'
Dire 'Remember: open the Developer Mode app now and then and press "Extend" before the time runs out, or the TV removes the app.' `
     'Pense à ouvrir l''appli Developer Mode de temps en temps et à appuyer sur « Extend » avant la fin du compte à rebours, sinon la télé supprime l''appli.'
Finir 0
