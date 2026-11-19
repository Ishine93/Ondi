#!/usr/bin/env bash
# Fabrique l'application Android TV / Google TV / Fire TV du Débrideur, sans Gradle, avec les seuls outils du SDK :
#   tele/android/build/Debrideur.apk
#   tele/android/build/Debrideur-AndroidTV.zip et Debrideur-FireTV.zip (APK + mode d'emploi + scripts d'installation)
# Pensé pour GitHub Actions (ubuntu-latest) : $ANDROID_HOME (build-tools, platforms) et un JDK 17 (actions/setup-java).
# Signature : DEBRIDEUR_KEYSTORE_B64 (keystore PKCS12 en base64) + DEBRIDEUR_KEYSTORE_MDP (mot de passe, alias « debrideur »).
# Sans eux, une clé jetable est créée : installer une version suivante demandera alors de désinstaller l'ancienne.
#   bash tele/android/construire.sh
set -euo pipefail

ICI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TELE="$(dirname "$ICI")"
SORTIE="$ICI/build"
MIN_SDK=21
CIBLE_SDK=34

echec() { echo "ERREUR : $*" >&2; exit 1; }

# ---------- outils ----------
SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
[ -n "$SDK" ] && [ -d "$SDK" ] || echec "SDK Android introuvable : définis ANDROID_HOME."

# build-tools : la version la plus récente.
BT="$(ls -d "$SDK"/build-tools/*/ 2>/dev/null | sort -V | tail -n 1 || true)"
BT="${BT%/}"
[ -n "$BT" ] || echec "aucun dossier dans $SDK/build-tools"
for outil in aapt2 d8 zipalign apksigner; do
  [ -x "$BT/$outil" ] || echec "$outil absent de $BT"
done

# Plateforme : la plus récente, 34 au moins (android-35, android-36, android-36-ext… sont acceptés).
PLATEFORME="$(for d in "$SDK"/platforms/android-*; do
  n="${d##*/android-}"
  n="${n%%[!0-9]*}"
  # Les plateformes « preview » (codename ≠ REL) sont écartées : l'APK porterait la mention DEV.
  if [ -f "$d/build.prop" ] && ! grep -q '^ro.build.version.codename=REL' "$d/build.prop"; then continue; fi
  if [ -n "$n" ] && [ "$n" -ge 34 ] && [ -f "$d/android.jar" ]; then echo "$d"; fi
done | sort -V | tail -n 1)"
[ -n "$PLATEFORME" ] || echec "aucune plateforme android-34 (ou plus récente) dans $SDK/platforms"
JAR="$PLATEFORME/android.jar"

for outil in javac keytool zip cmp base64; do
  command -v "$outil" >/dev/null || echec "$outil introuvable (un JDK 17 et zip sont attendus)."
done
echo "build-tools : $BT"
echo "plateforme  : $JAR"
javac -version

# ---------- vérifications ----------
VERSION="$(sed -n 's/.*"version" *: *"\([^"]*\)".*/\1/p' "$ICI/app.json")"
CODE="$(sed -n 's/.*"versionCode" *: *\([0-9][0-9]*\).*/\1/p' "$ICI/app.json")"
[ -n "$VERSION" ] && [ -n "$CODE" ] || echec "app.json illisible (attendu : {\"version\":\"1.0.0\",\"versionCode\":1})"
grep -q "android:versionName=\"$VERSION\"" "$ICI/AndroidManifest.xml" || echec "versionName du manifeste différent de app.json ($VERSION)"
grep -q "android:versionCode=\"$CODE\"" "$ICI/AndroidManifest.xml" || echec "versionCode du manifeste différent de app.json ($CODE)"
# Les scripts d'installation de tele/firetv sont des copies exactes de ceux d'ici.
for f in installer-sur-la-tele.bat installer-sur-la-tele.command outils/installer-tele.ps1; do
  cmp -s "$ICI/$f" "$TELE/firetv/$f" || echec "tele/firetv/$f doit être une copie exacte de tele/android/$f"
done
echo "version     : $VERSION ($CODE)"

rm -rf "$SORTIE"
mkdir -p "$SORTIE/res" "$SORTIE/classes" "$SORTIE/dex"

# ---------- ressources + manifeste + lanceur (assets) ----------
echo "→ ressources (aapt2)"
for f in "$ICI"/res/*/*; do
  "$BT/aapt2" compile "$f" -o "$SORTIE/res/"
done
"$BT/aapt2" link -o "$SORTIE/brut.apk" -I "$JAR" --manifest "$ICI/AndroidManifest.xml" \
  --min-sdk-version "$MIN_SDK" --target-sdk-version "$CIBLE_SDK" -A "$ICI/assets" "$SORTIE"/res/*.flat

# ---------- code Java → classes.dex ----------
echo "→ code (javac + d8)"
mapfile -t SOURCES < <(find "$ICI/src" -name '*.java')
[ "${#SOURCES[@]}" -gt 0 ] || echec "aucun fichier .java dans $ICI/src"
javac --release 11 -encoding UTF-8 -Xlint:-options -classpath "$JAR" -d "$SORTIE/classes" "${SOURCES[@]}"
mapfile -t CLASSES < <(find "$SORTIE/classes" -name '*.class')
"$BT/d8" --release --min-api "$MIN_SDK" --lib "$JAR" --output "$SORTIE/dex" "${CLASSES[@]}"
[ -f "$SORTIE/dex/classes.dex" ] || echec "d8 n'a pas produit classes.dex"
cp "$SORTIE/brut.apk" "$SORTIE/avec-code.apk"
(cd "$SORTIE/dex" && zip -q -X "$SORTIE/avec-code.apk" classes.dex)

# ---------- alignement + signature ----------
echo "→ alignement et signature"
"$BT/zipalign" -f -p 4 "$SORTIE/avec-code.apk" "$SORTIE/aligne.apk"

CLE="$SORTIE/cle.p12"
trap 'rm -f "$CLE"' EXIT
if [ -n "${DEBRIDEUR_KEYSTORE_B64:-}" ]; then
  [ -n "${DEBRIDEUR_KEYSTORE_MDP:-}" ] || echec "DEBRIDEUR_KEYSTORE_MDP manque (mot de passe du keystore)."
  printf '%s' "$DEBRIDEUR_KEYSTORE_B64" | tr -d ' \r\n' | base64 -d > "$CLE" || echec "DEBRIDEUR_KEYSTORE_B64 n'est pas du base64 valide."
  export DEBRIDEUR_MDP_SIGNATURE="$DEBRIDEUR_KEYSTORE_MDP"
  echo "clé         : keystore fourni (alias debrideur)"
else
  echo "::warning::APK signé avec une clé jetable (DEBRIDEUR_KEYSTORE_B64 absent) : pour installer une version suivante, il faudra désinstaller celle-ci. / Signed with a throwaway key: installing a later version will require uninstalling this one."
  DEBRIDEUR_MDP_SIGNATURE="$(head -c 24 /dev/urandom | base64 | tr -dc 'A-Za-z0-9')"
  export DEBRIDEUR_MDP_SIGNATURE
  keytool -genkeypair -keystore "$CLE" -storetype PKCS12 -alias debrideur -keyalg RSA -keysize 2048 -validity 10000 \
    -dname "CN=Debrideur" -storepass:env DEBRIDEUR_MDP_SIGNATURE -keypass:env DEBRIDEUR_MDP_SIGNATURE -noprompt
fi
"$BT/apksigner" sign --ks "$CLE" --ks-type PKCS12 --ks-key-alias debrideur \
  --ks-pass env:DEBRIDEUR_MDP_SIGNATURE --key-pass env:DEBRIDEUR_MDP_SIGNATURE \
  --v4-signing-enabled false --out "$SORTIE/Debrideur.apk" "$SORTIE/aligne.apk"
rm -f "$CLE"
"$BT/apksigner" verify --verbose "$SORTIE/Debrideur.apk"
"$BT/aapt2" dump badging "$SORTIE/Debrideur.apk" 2>/dev/null \
  | grep -E "^(package|sdkVersion|targetSdkVersion|application-label:|launchable-activity|leanback-launchable-activity)" || true

# ---------- paquets à distribuer ----------
# $1 = dossier des documents (android ou firetv), $2 = nom du zip.
paquet() {
  local dossier="$TELE/$1" tmp="$SORTIE/paquet-$1"
  mkdir -p "$tmp/outils"
  cp "$SORTIE/Debrideur.apk" "$dossier/README.md" "$dossier/PROMPT-IA.md" \
     "$dossier/installer-sur-la-tele.bat" "$dossier/installer-sur-la-tele.command" "$tmp/"
  cp "$dossier/outils/installer-tele.ps1" "$tmp/outils/"
  # Fins de ligne attendues quel que soit le dépôt : CRLF pour Windows (.bat), LF pour Mac/Linux (.command).
  sed -i 's/\r*$/\r/' "$tmp/installer-sur-la-tele.bat"
  sed -i 's/\r$//' "$tmp/installer-sur-la-tele.command"
  chmod 755 "$tmp/installer-sur-la-tele.command"
  (cd "$tmp" && zip -q -X -r "$SORTIE/$2" .)
}
paquet android Debrideur-AndroidTV.zip
paquet firetv Debrideur-FireTV.zip

rm -rf "$SORTIE/res" "$SORTIE/classes" "$SORTIE/dex" "$SORTIE"/paquet-* \
  "$SORTIE/brut.apk" "$SORTIE/avec-code.apk" "$SORTIE/aligne.apk"
echo
echo "Prêt :"
ls -l "$SORTIE"
sha256sum "$SORTIE/Debrideur.apk"
