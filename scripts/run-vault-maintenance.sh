#!/bin/bash
# launchd entrypoint. launchd's PATH is tiny and differs by machine.
# Search the usual prefixes. Do not hardcode /opt/homebrew/bin/node:
# Intel Homebrew, nvm, and Linux put node somewhere else.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
export PATH="${HOME}/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:${PATH:-}"
export OBSIDIAN_VAULT="${OBSIDIAN_VAULT:-${HOME}/Documents/SecondBrain}"
export OBSIDIAN_TIME_ZONE="${OBSIDIAN_TIME_ZONE:-Asia/Bangkok}"
NODE="$(command -v node || true)"
if [[ -z "$NODE" ]]; then
  echo "node not on PATH. Install Node.js 18+ or set PATH in the launchd plist. Run \`command -v node\` in a normal shell on this machine." >&2
  exit 127
fi
exec "$NODE" "$HERE/vault-maintenance.mjs"
