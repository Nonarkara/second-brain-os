#!/bin/bash
# backup-vault-github.sh
# Commits and pushes all SecondBrain changes to the private GitHub repo.
# Runs automatically via launchd (com.drnon.vault-backup.plist).

set -euo pipefail

VAULT="$HOME/Documents/SecondBrain"
LOG="$HOME/Library/Logs/vault-backup.log"
STAMP=$(date '+%Y-%m-%d %H:%M')

cd "$VAULT"

# Nothing to do if working tree is clean
if git diff --quiet && git diff --cached --quiet && [ -z "$(git ls-files --others --exclude-standard)" ]; then
  echo "[$STAMP] GitHub: clean, nothing to push" >> "$LOG"
  exit 0
fi

git add -A
git commit -m "backup: $STAMP" --quiet
git push origin main --quiet

echo "[$STAMP] GitHub: pushed OK" >> "$LOG"
