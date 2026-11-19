#!/bin/bash
# Starts Débrideur and opens the page / Démarre le Débrideur et ouvre la page.
cd "$(dirname "$0")" || exit 1
NODE="./runtime/node/bin/node"
[ -x "$NODE" ] || NODE="node"
"$NODE" lancer.mjs "$@"
