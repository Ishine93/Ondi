#!/bin/bash
# Ondi — installation on Mac (double-click; the first time: right-click → Open).
# Installation sur Mac (double-clic ; la première fois : clic droit → Ouvrir).
cd "$(dirname "$0")" || exit 1
/bin/bash outils/installer.sh "$@"
code=$?
printf '\nPress Enter to close this window. / Appuie sur Entrée pour fermer cette fenêtre.'
read -r _
exit $code
