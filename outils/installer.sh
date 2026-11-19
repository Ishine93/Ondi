#!/bin/bash
# Débrideur — installation on macOS (started by installer.command) / installation sur Mac.
# 1. Portable Node.js in runtime/node (nothing installed elsewhere on the Mac);
# 2. ffmpeg (Jellyfin build, Apple VideoToolbox hardware conversion + HDR tone mapping) in runtime/ffmpeg;
# 3. Desktop shortcut and optional start at login.
# Every download is checked against its SHA-256 fingerprint.
set -euo pipefail

RACINE="$(cd "$(dirname "$0")/.." && pwd)"
RUNTIME="$RACINE/runtime"
NODE_VERSION="26.13.1"
FFMPEG_VERSION="8.1.3-2"
SILENCIEUX=0
SANS_LANCER=0
for a in "$@"; do
  case "$a" in
    --silencieux) SILENCIEUX=1 ;;
    --sans-lancer) SANS_LANCER=1 ;;
  esac
done

etape() { printf '\n\033[36m== %s\033[0m\n' "$1"; }
ok() { printf '   \033[32mOK\033[0m  %s\n' "$1"; }
info() { printf '   %s\n' "$1"; }
attention() { printf '   \033[33m!\033[0m   %s\n' "$1"; }
echec() {
  printf '\n\033[31mFAILED / ÉCHEC : %s\033[0m\n' "$1"
  echo 'Nothing was changed outside the Débrideur folder. You can run installer.command again.'
  echo "Rien n'a été modifié en dehors du dossier du Débrideur. Tu peux relancer installer.command."
  exit 1
}
question() {
  [ "$SILENCIEUX" = 1 ] && return 0
  read -r -p "$1 [Y/n · O/n] " r
  [ -z "$r" ] || [[ "$r" =~ ^[oOyY] ]]
}
telecharger() {
  info "Download / Téléchargement : $1"
  curl -fL --retry 3 --retry-delay 3 --connect-timeout 20 -o "$2" "$1" || echec "cannot download / téléchargement impossible : $1"
}
verifier() {
  local obtenue
  obtenue="$(shasum -a 256 "$1" | cut -d' ' -f1)"
  if [ "$obtenue" != "$2" ]; then
    rm -f "$1"
    echec "$3 : wrong SHA-256 fingerprint, file deleted / empreinte incorrecte, fichier supprimé."
  fi
  ok "SHA-256 checked / empreinte vérifiée"
}

echo 'Débrideur — installation'
echo "Folder / Dossier : $RACINE"

# ------------------------------------------------------------------ system / système
etape 'System / Système'
[ "$(uname -s)" = "Darwin" ] || echec 'this script is for macOS / ce script est pour Mac.'
case "$(uname -m)" in
  arm64) ARCH_NODE="arm64"; ARCH_FFMPEG="arm64"; FICHIER_FFMPEG="jellyfin-ffmpeg_${FFMPEG_VERSION}_portable_macarm64-gpl.tar.xz"; SHA_FFMPEG="d898cc819e7c4e9219d6410ddbdaada0838f14bec6ff89e283639915394cb43f" ;;
  x86_64) ARCH_NODE="x64"; ARCH_FFMPEG="x86_64"; FICHIER_FFMPEG="jellyfin-ffmpeg_${FFMPEG_VERSION}_portable_mac64-gpl.tar.xz"; SHA_FFMPEG="d394180f1155f84857544a48a99869f5741ccc50c5a1f73d2797429a2b326448" ;;
  *) echec "unsupported processor / processeur non pris en charge : $(uname -m)" ;;
esac
ok "macOS $(sw_vers -productVersion) · $(uname -m)"
# Files from a downloaded zip are « quarantined » by macOS: lift it for this folder only.
xattr -dr com.apple.quarantine "$RACINE" 2>/dev/null || true
mkdir -p "$RUNTIME/telechargements"
TMP="$RUNTIME/telechargements"

# ------------------------------------------------------------------ Node.js
etape "Node.js $NODE_VERSION (portable, runtime/node)"
NODE="$RUNTIME/node/bin/node"
if [ -x "$NODE" ] && [ "$("$NODE" -v)" = "v$NODE_VERSION" ]; then
  ok "already installed / déjà installé ($("$NODE" -v))"
else
  NOM="node-v$NODE_VERSION-darwin-$ARCH_NODE"
  telecharger "https://nodejs.org/dist/v$NODE_VERSION/SHASUMS256.txt" "$TMP/SHASUMS256.txt"
  telecharger "https://nodejs.org/dist/v$NODE_VERSION/$NOM.tar.gz" "$TMP/$NOM.tar.gz"
  ATTENDUE="$(grep "  $NOM.tar.gz\$" "$TMP/SHASUMS256.txt" | cut -d' ' -f1)"
  [ -n "$ATTENDUE" ] || echec 'Node.js fingerprint not found / empreinte de Node.js introuvable.'
  verifier "$TMP/$NOM.tar.gz" "$ATTENDUE" 'Node.js'
  rm -rf "$RUNTIME/node" "$TMP/$NOM"
  tar -xzf "$TMP/$NOM.tar.gz" -C "$TMP"
  mv "$TMP/$NOM" "$RUNTIME/node"
  rm -f "$TMP/$NOM.tar.gz" "$TMP/SHASUMS256.txt"
  ok "installed / installé ($("$NODE" -v))"
fi

# ------------------------------------------------------------------ ffmpeg
etape "ffmpeg $FFMPEG_VERSION (Jellyfin build, runtime/ffmpeg)"
if [ -x "$RUNTIME/ffmpeg/ffmpeg" ] && [ "$(cat "$RUNTIME/ffmpeg/version.txt" 2>/dev/null)" = "$FFMPEG_VERSION" ]; then
  ok "already installed / déjà installé ($FFMPEG_VERSION)"
else
  telecharger "https://repo.jellyfin.org/files/ffmpeg/macos/8.x/$FFMPEG_VERSION/$ARCH_FFMPEG/$FICHIER_FFMPEG" "$TMP/ffmpeg.tar.xz"
  verifier "$TMP/ffmpeg.tar.xz" "$SHA_FFMPEG" 'ffmpeg'
  rm -rf "$RUNTIME/ffmpeg"
  mkdir -p "$RUNTIME/ffmpeg"
  tar -xJf "$TMP/ffmpeg.tar.xz" -C "$RUNTIME/ffmpeg"
  chmod +x "$RUNTIME/ffmpeg/ffmpeg" "$RUNTIME/ffmpeg/ffprobe"
  echo "$FFMPEG_VERSION" > "$RUNTIME/ffmpeg/version.txt"
  rm -f "$TMP/ffmpeg.tar.xz"
  ok 'installed / installé'
fi
rm -rf "$TMP"
chmod +x "$RACINE"/*.command 2>/dev/null || true

# ------------------------------------------------------------------ shortcuts / raccourcis
etape 'Shortcuts / Raccourcis'
ln -sf "$RACINE/lancer.command" "$HOME/Desktop/Débrideur.command" && ok 'Desktop: Débrideur.command / Bureau : Débrideur.command'
PLIST="$HOME/Library/LaunchAgents/io.github.ishine93.debrideur.plist"
if question 'Start Débrideur automatically when you log in? / Lancer le Débrideur à l'"'"'ouverture de session ?'; then
  mkdir -p "$HOME/Library/LaunchAgents"
  cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>io.github.ishine93.debrideur</string>
  <key>ProgramArguments</key>
  <array><string>$NODE</string><string>$RACINE/lancer.mjs</string><string>--sans-navigateur</string></array>
  <key>WorkingDirectory</key><string>$RACINE</string>
  <key>RunAtLoad</key><true/>
</dict>
</plist>
PLIST
  launchctl unload "$PLIST" 2>/dev/null || true
  launchctl load "$PLIST" 2>/dev/null || true
  ok 'starts at login / démarre à l'"'"'ouverture de session'
elif [ -f "$PLIST" ]; then
  launchctl unload "$PLIST" 2>/dev/null || true
  rm -f "$PLIST"
fi
info 'If macOS asks whether "node" may accept incoming connections, click Allow (needed for phone and TV).'
info 'Si macOS demande si « node » peut accepter des connexions entrantes, clique Autoriser (pour le téléphone et la télé).'

# ------------------------------------------------------------------ done / fini
etape 'Ready / Prêt'
info 'Open Débrideur with Débrideur.command on the Desktop. The first time, a setup wizard guides you.'
info 'Ouvre le Débrideur avec Débrideur.command sur le Bureau. La première fois, un assistant te guide.'
if [ "$SANS_LANCER" = 0 ]; then
  "$NODE" "$RACINE/lancer.mjs" || true
fi
