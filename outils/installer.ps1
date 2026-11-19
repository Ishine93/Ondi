# Ondi — installation on Windows (started by installer.bat) / installation sous Windows.
# 1. Portable Node.js in runtime\node (nothing installed elsewhere on the PC);
# 2. ffmpeg (Jellyfin build: NVIDIA, Intel, AMD hardware conversion + HDR tone mapping) in runtime\ffmpeg;
# 3. shortcuts (Desktop, Start menu, optional start with Windows), optional firewall rule for phone/TV access.
# Every download is checked against its SHA-256 fingerprint.
param([switch]$SansLancer, [switch]$Silencieux, [switch]$SansRaccourcis)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$Racine = Split-Path -Parent $PSScriptRoot
$Runtime = Join-Path $Racine 'runtime'
$NodeVersion = '26.13.1'
$NodeDossier = Join-Path $Runtime 'node'
$FfmpegVersion = '8.1.3-2'
$FfmpegUrl = "https://repo.jellyfin.org/files/ffmpeg/windows/8.x/$FfmpegVersion/win64/jellyfin-ffmpeg_${FfmpegVersion}_portable_win64-clang-gpl.zip"
$FfmpegSha = 'b65dd5011a80b5abec08bd559489cf188217238c8e38b5bf553504c974f5694d'
$FfmpegDossier = Join-Path $Runtime 'ffmpeg'
$Port = 8097

function Etape($texte) { Write-Host ''; Write-Host "== $texte" -ForegroundColor Cyan }
function Ok($texte) { Write-Host "   OK  $texte" -ForegroundColor Green }
function Info($texte) { Write-Host "   $texte" }
function Attention($texte) { Write-Host "   !   $texte" -ForegroundColor Yellow }
function Echec($texte) {
  Write-Host ''
  Write-Host "FAILED / ÉCHEC : $texte" -ForegroundColor Red
  Write-Host 'Nothing was changed outside the Ondi folder. You can run installer.bat again.'
  Write-Host 'Rien n''a été modifié en dehors du dossier d''Ondi. Tu peux relancer installer.bat.'
  exit 1
}
function Question($texte, $siSilencieux = $true) {
  if ($Silencieux) { return $siSilencieux }
  $r = Read-Host "$texte [Y/n · O/n]"
  return ($r -eq '' -or $r -match '^[oOyY]')
}
function Telecharger($url, $fichier) {
  Info "Download / Téléchargement : $url"
  for ($essai = 1; $essai -le 3; $essai++) {
    try {
      Invoke-WebRequest -Uri $url -OutFile $fichier -UseBasicParsing -TimeoutSec 900
      return
    } catch {
      if ($essai -eq 3) { throw }
      Attention "Download interrupted, retrying / Téléchargement interrompu, nouvel essai ($essai/3)…"
      Start-Sleep -Seconds 3
    }
  }
}
function VerifierEmpreinte($fichier, $attendue, $nom) {
  $obtenue = (Get-FileHash -Algorithm SHA256 -Path $fichier).Hash.ToLower()
  if ($obtenue -ne $attendue.ToLower()) {
    Remove-Item $fichier -Force
    Echec "$nom : wrong SHA-256 fingerprint, the file was deleted / empreinte incorrecte, fichier supprimé."
  }
  Ok "SHA-256 checked / empreinte vérifiée"
}

Write-Host 'Ondi — installation' -ForegroundColor White
Write-Host "Folder / Dossier : $Racine"

# ------------------------------------------------------------------ system / système
Etape 'System / Système'
$os = [Environment]::OSVersion.Version
if ($os.Major -lt 10) { Echec 'Windows 10 or 11 is required / Windows 10 ou 11 est nécessaire.' }
if (-not [Environment]::Is64BitOperatingSystem) { Echec 'A 64-bit Windows is required / Un Windows 64 bits est nécessaire.' }
Ok "Windows $($os.Major).$($os.Minor) (build $($os.Build)), 64-bit"
if ($Racine -match '[^\x20-\x7E]') { Attention 'The folder path has special characters: if something fails, move the folder somewhere simple (e.g. C:\Ondi). / Le chemin contient des caractères spéciaux : en cas d''échec, déplace le dossier (ex. C:\Ondi).' }
New-Item -ItemType Directory -Force -Path $Runtime | Out-Null
$tmp = Join-Path $Runtime 'telechargements'
New-Item -ItemType Directory -Force -Path $tmp | Out-Null

# ------------------------------------------------------------------ Node.js
Etape "Node.js $NodeVersion (portable, runtime\node)"
$nodeExe = Join-Path $NodeDossier 'node.exe'
$versionActuelle = $null
if (Test-Path $nodeExe) { try { $versionActuelle = (& $nodeExe -v).Trim() } catch { $versionActuelle = $null } }
if ($versionActuelle -eq "v$NodeVersion") {
  Ok "already installed / déjà installé ($versionActuelle)"
} else {
  $nom = "node-v$NodeVersion-win-x64"
  $base = "https://nodejs.org/dist/v$NodeVersion"
  $zip = Join-Path $tmp "$nom.zip"
  $sommes = Join-Path $tmp "SHASUMS256-node-$NodeVersion.txt"
  try {
    Telecharger "$base/SHASUMS256.txt" $sommes
    Telecharger "$base/$nom.zip" $zip
  } catch { Echec "cannot download Node.js / téléchargement de Node.js impossible ($($_.Exception.Message))." }
  $attendue = (Select-String -Path $sommes -Pattern "  $nom\.zip$" | Select-Object -First 1).Line -split '\s+' | Select-Object -First 1
  if (-not $attendue) { Echec 'Node.js fingerprint not found / empreinte de Node.js introuvable.' }
  VerifierEmpreinte $zip $attendue 'Node.js'
  $extrait = Join-Path $tmp 'node-extrait'
  if (Test-Path $extrait) { Remove-Item $extrait -Recurse -Force }
  Expand-Archive -Path $zip -DestinationPath $extrait -Force
  if (Test-Path $NodeDossier) { Remove-Item $NodeDossier -Recurse -Force }
  Move-Item (Join-Path $extrait $nom) $NodeDossier
  Remove-Item $extrait -Recurse -Force
  Remove-Item $zip, $sommes -Force
  Ok "installed / installé ($((& $nodeExe -v).Trim()))"
}

# ------------------------------------------------------------------ ffmpeg
Etape "ffmpeg $FfmpegVersion (Jellyfin build, runtime\ffmpeg)"
$ffmpegExe = Join-Path $FfmpegDossier 'ffmpeg.exe'
$marque = Join-Path $FfmpegDossier 'version.txt'
if ((Test-Path $ffmpegExe) -and (Test-Path $marque) -and ((Get-Content $marque -Raw).Trim() -eq $FfmpegVersion)) {
  Ok "already installed / déjà installé ($FfmpegVersion)"
} else {
  $zip = Join-Path $tmp 'ffmpeg.zip'
  try { Telecharger $FfmpegUrl $zip } catch { Echec "cannot download ffmpeg / téléchargement de ffmpeg impossible ($($_.Exception.Message))." }
  VerifierEmpreinte $zip $FfmpegSha 'ffmpeg'
  if (Test-Path $FfmpegDossier) { Remove-Item $FfmpegDossier -Recurse -Force }
  Expand-Archive -Path $zip -DestinationPath $FfmpegDossier -Force
  Set-Content -Path $marque -Value $FfmpegVersion -Encoding ascii
  Remove-Item $zip -Force
  Ok 'installed / installé'
}
Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue

# ------------------------------------------------------------------ shortcuts / raccourcis
if (-not $SansRaccourcis) {
  Etape 'Shortcuts / Raccourcis'
  $wsh = New-Object -ComObject WScript.Shell
  $vbs = Join-Path $Racine 'Debrideur.vbs'
  $icone = Join-Path $Racine 'debrideur.ico'
  function Raccourci($chemin, $arguments) {
    $l = $wsh.CreateShortcut($chemin)
    $l.TargetPath = "$env:WINDIR\System32\wscript.exe"
    $l.Arguments = "`"$vbs`" $arguments"
    $l.WorkingDirectory = $Racine
    if (Test-Path $icone) { $l.IconLocation = $icone }
    $l.Description = 'Ondi'
    $l.Save()
  }
  $bureau = [Environment]::GetFolderPath('Desktop')
  # Before the new name the shortcuts were called "Débrideur": remove them so there is only one of each.
  # Avant le nouveau nom, les raccourcis s'appelaient « Débrideur » : on les retire pour n'en garder qu'un.
  foreach ($dossier in @($bureau, [Environment]::GetFolderPath('Programs'), [Environment]::GetFolderPath('Startup'))) {
    $ancien = Join-Path $dossier 'Débrideur.lnk'
    if (Test-Path $ancien) { Remove-Item $ancien -Force }
  }
  $menu = Join-Path ([Environment]::GetFolderPath('Programs')) 'Ondi.lnk'
  Raccourci (Join-Path $bureau 'Ondi.lnk') ''
  Raccourci $menu ''
  Ok 'Desktop + Start menu / Bureau + menu Démarrer'
  $demarrage = Join-Path ([Environment]::GetFolderPath('Startup')) 'Ondi.lnk'
  if (Question 'Start Ondi automatically with Windows? / Lancer Ondi au démarrage de Windows ?') {
    Raccourci $demarrage '--sans-navigateur'
    Ok 'starts with Windows / démarre avec Windows'
  } elseif (Test-Path $demarrage) { Remove-Item $demarrage -Force }

  # Phone and TV reach this PC on port 8097: one firewall rule for this Node.js, private networks only.
  Etape 'Phone and TV access (firewall) / Accès du téléphone et de la télé (pare-feu)'
  $regle = Get-NetFirewallRule -DisplayName 'Ondi', 'Débrideur' -ErrorAction SilentlyContinue
  if ($regle) { Ok 'rule already present / règle déjà présente' }
  elseif (Question 'Allow your phone and TV to connect (Windows will ask for admin rights)? / Autoriser le téléphone et la télé (Windows demande les droits administrateur) ?') {
    $commande = "New-NetFirewallRule -DisplayName 'Ondi' -Direction Inbound -Program '$nodeExe' -Action Allow -Profile Private,Domain | Out-Null"
    try {
      Start-Process powershell -Verb RunAs -Wait -ArgumentList '-NoProfile', '-Command', $commande
      if (Get-NetFirewallRule -DisplayName 'Ondi' -ErrorAction SilentlyContinue) { Ok 'allowed on private networks / autorisé sur les réseaux privés' }
      else { Attention 'not added: Windows will ask the first time instead (choose Private networks). / non ajoutée : Windows le demandera au premier lancement (choisis Réseaux privés).' }
    } catch { Attention 'cancelled: Windows will ask the first time instead. / annulé : Windows le demandera au premier lancement.' }
  }
}

# ------------------------------------------------------------------ done / fini
Etape 'Ready / Prêt'
Info 'Open Ondi with the Desktop shortcut. The first time, a setup wizard guides you.'
Info 'Ouvre Ondi avec le raccourci du Bureau. La première fois, un assistant te guide.'
if (-not $SansLancer) {
  Start-Process "$env:WINDIR\System32\wscript.exe" -ArgumentList "`"$(Join-Path $Racine 'Debrideur.vbs')`""
  Ok "starting / démarrage : http://localhost:$Port"
}
