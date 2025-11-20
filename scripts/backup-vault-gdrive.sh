#!/bin/bash
# backup-vault-gdrive.sh
# Syncs the full SecondBrain vault to Google Drive via rclone.
# Runs automatically via launchd (com.drnon.vault-backup.plist).
#
# Prerequisites: run `rclone config` once to create the "gdrive" remote.
# See ~/Projects/_shared/scripts/VAULT-BACKUP-SETUP.md for instructions.

set -euo pipefail

VAULT="$HOME/Documents/SecondBrain"
REMOTE="gdrive:SecondBrain"
LOG="$HOME/Library/Logs/vault-backup.log"
STAMP=$(date '+%Y-%m-%d %H:%M')

# Skip if rclone remote not configured yet
if ! rclone listremotes 2>/dev/null | grep -q "^gdrive:"; then
  echo "[$STAMP] GDrive: 'gdrive' remote not configured — run rclone config first" >> "$LOG"
  exit 0
fi

rclone sync "$VAULT" "$REMOTE" \
  --exclude ".git/**" \
  --exclude ".obsidian/cache/**" \
  --exclude ".obsidian/workspace*" \
  --exclude ".mcp/**/node_modules/**" \
  --exclude ".DS_Store" \
  --exclude "*.pem" \
  --exclude "*.key" \
  --exclude "*credentials*.json" \
  --exclude "*service-account*.json" \
  --exclude ".env" \
  --exclude ".env.*" \
  --transfers 8 \
  --checkers 16 \
  --quiet

echo "[$STAMP] GDrive: sync OK → $REMOTE" >> "$LOG"
