#!/bin/bash
# Starts Ondi and opens the page / Démarre Ondi et ouvre la page.
cd "$(dirname "$0")" || exit 1
NODE="./runtime/node/bin/node"
[ -x "$NODE" ] || NODE="node"
"$NODE" lancer.mjs "$@"
