#!/bin/bash
# Cull leftover filesystem obsidian-bridge MCP servers.
# Cursor/Claude/Antigravity spawn one per session and often leave zombies.
# Safe: clients respawn a fresh bridge on next tool call.
set -euo pipefail
PATTERN='SecondBrain/.mcp/obsidian-bridge/index.js'
before=$(pgrep -f "$PATTERN" | wc -l | tr -d ' ')
if [ "$before" -eq 0 ]; then
  echo "cull-orphan-mcp-bridges: 0 running"
  exit 0
fi
# Keep nothing — orphans have no useful shared state; MCP is stdio-per-client
pkill -f "$PATTERN" 2>/dev/null || true
sleep 0.5
after=$(pgrep -f "$PATTERN" | wc -l | tr -d ' ' || echo 0)
echo "cull-orphan-mcp-bridges: killed ~$before, now $after"
