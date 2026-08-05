#!/bin/bash
# One brain pulse, run by launchd every 15 minutes.
# launchd provides almost no environment; everything is explicit.
set -uo pipefail
export PATH="/opt/homebrew/bin:$HOME/.local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
HERE="$(cd "$(dirname "$0")" && pwd)"
LOG="$HOME/Library/Logs/braind.log"

# BRAIND_KEY et al. Missing file = offline-by-misconfiguration: the
# daemon still computes, it just cannot transfer. It says so in the log.
ENVF="$HOME/Projects/_toolkit/axiom-ops/.env"
[ -f "$ENVF" ] && set -a && . "$ENVF" && set +a

echo "───── $(date '+%Y-%m-%d %H:%M:%S %Z') ─────" >>"$LOG"
node "$HERE/braind.mjs" >>"$LOG" 2>&1
code=$?
[ $code -ne 0 ] && echo "pulse FAILED (exit $code)" >>"$LOG"

tail -n 1500 "$LOG" >"$LOG.tmp" && mv "$LOG.tmp" "$LOG"
exit $code
