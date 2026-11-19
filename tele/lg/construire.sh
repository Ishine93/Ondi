#!/usr/bin/env bash
# Fabrique l'application télé LG (webOS) :
#   tele/lg/build/Debrideur.ipk   le paquet à installer sur la télé
#   tele/lg/build/Debrideur-LG.zip  ce qu'on donne aux utilisateurs : l'ipk, les scripts d'installation, la notice
# Prévu pour un runner GitHub Actions ubuntu-latest : il faut node (>= 20), npm et zip, et l'accès à registry.npmjs.org.
# L'outil officiel de LG (@webos-tools/cli) est installé dans un dossier temporaire, jamais en global.
#   bash tele/lg/construire.sh
set -euo pipefail

CLI_VERSION="3.2.6"   # version figée de @webos-tools/cli
ICI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP="$ICI/app"
SORTIE="$ICI/build"
OUTILS="$(mktemp -d)"
trap 'rm -rf "$OUTILS"' EXIT

for outil in node npm zip; do
  command -v "$outil" >/dev/null || { echo "Il manque « $outil » sur cette machine." >&2; exit 1; }
done

# 1. Vérifications : appinfo.json lisible, et même version que celle que l'appli annonce au serveur (appli=lg-<version>).
version="$(node -p 'require(process.argv[1]).version' "$APP/appinfo.json")"
grep -q "var VERSION = '$version';" "$APP/index.html" || {
  echo "La version de app/index.html (VERSION) ne correspond pas à appinfo.json ($version)." >&2; exit 1; }
echo "Application LG version $version"

# 2. Outil officiel LG, dans le dossier temporaire.
npm install --prefix "$OUTILS" --no-audit --no-fund --no-update-notifier --loglevel=error "@webos-tools/cli@$CLI_VERSION"
ARES="$OUTILS/node_modules/.bin"

# 3. Le paquet .ipk (sans minification : le code reste tel qu'il est écrit).
rm -rf "$SORTIE"
mkdir -p "$SORTIE"
"$ARES/ares-package" --no-minify --outdir "$SORTIE" "$APP"
shopt -s nullglob
paquets=("$SORTIE"/*.ipk)
[ "${#paquets[@]}" -eq 1 ] || { echo "ares-package n'a pas produit exactement un .ipk." >&2; exit 1; }
mv "${paquets[0]}" "$SORTIE/Debrideur.ipk"
"$ARES/ares-package" --info "$SORTIE/Debrideur.ipk"

# 4. Le zip pour les utilisateurs (fins de ligne Windows pour .bat/.ps1, Unix pour .command).
for f in installer-sur-la-tele.bat installer-sur-la-tele.ps1; do sed 's/\r*$/\r/' "$ICI/$f" > "$SORTIE/$f"; done
sed 's/\r$//' "$ICI/installer-sur-la-tele.command" > "$SORTIE/installer-sur-la-tele.command"
chmod +x "$SORTIE/installer-sur-la-tele.command"
cp "$ICI/README.md" "$ICI/PROMPT-IA.md" "$SORTIE/"
(cd "$SORTIE" && zip -q Debrideur-LG.zip Debrideur.ipk installer-sur-la-tele.bat installer-sur-la-tele.ps1 \
  installer-sur-la-tele.command README.md PROMPT-IA.md)
echo "Prêt : $SORTIE/Debrideur.ipk et $SORTIE/Debrideur-LG.zip"
