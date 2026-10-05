#!/bin/bash
# Unit checks for the cull matcher. Does not signal real clients.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=cull-orphan-mcp-bridges.sh
source "$HERE/cull-orphan-mcp-bridges.sh"

fail() { echo "FAIL: $*" >&2; exit 1; }

[[ "$(etime_to_seconds "90")" == "90" ]] || fail "seconds-only etime"
[[ "$(etime_to_seconds "01:02")" == "62" ]] || fail "mm:ss"
[[ "$(etime_to_seconds "01:02:03")" == "3723" ]] || fail "hh:mm:ss"
[[ "$(etime_to_seconds "2-01:02:03")" == "176523" ]] || fail "dd-hh:mm:ss"
[[ "$(etime_to_seconds "08:09")" == "489" ]] || fail "leading zero must not be octal"

is_bridge_command "node /repo/mcp/obsidian-bridge/index.js" || fail "repo layout argv"
is_bridge_command "/opt/homebrew/bin/node /Users/example/Documents/SecondBrain/.mcp/obsidian-bridge/index.js" || fail "vault copy argv"
is_bridge_command "node obsidian-bridge/index.js" || fail "relative argv"

embedded='/exec-daemon/node /exec-daemon/index.js serve --mcp-config {"mcpServers":{"obsidian-bridge":{"command":"node","args":["/workspace/obsidian-bridge/index.js"]}}}'
if is_bridge_command "$embedded"; then
  fail "embedded MCP JSON must not count as a bridge process"
fi
if is_bridge_command "python3 -c import /tmp/mcp/obsidian-bridge/index.js"; then
  fail "a non-node process that mentions the script is not a bridge"
fi
if is_bridge_command "bash -c node /repo/mcp/obsidian-bridge/index.js"; then
  fail "a shell command line that mentions the script is not a bridge"
fi

# Same parent, 2h leftover + 2m live. Keep the live one only.
rows=$'100\t50\t7200\tnode /repo/mcp/obsidian-bridge/index.js\n101\t50\t120\tnode /repo/mcp/obsidian-bridge/index.js\n'
got="$(printf '%s' "$rows" | decide_cull_rows 3600 1 | tr '\n' ' ')"
[[ "$got" == "100 " ]] || fail "expected to cull only the aged sibling, got [$got]"

# Single long-lived Cursor bridge stays.
rows=$'300\t80\t28800\tnode /repo/mcp/obsidian-bridge/index.js\n'
got="$(printf '%s' "$rows" | decide_cull_rows 3600 1 || true)"
[[ -z "$got" ]] || fail "the only bridge of a living parent must stay, got [$got]"

# Young extra under the floor stays (Codex thread just opened).
rows=$'400\t90\t4000\tnode /repo/mcp/obsidian-bridge/index.js\n401\t90\t30\tnode /repo/mcp/obsidian-bridge/index.js\n'
got="$(printf '%s' "$rows" | decide_cull_rows 3600 1 | tr '\n' ' ')"
[[ "$got" == "400 " ]] || fail "young extra must stay and aged sibling must go, got [$got]"

# Reparented orphan past the floor goes. A young orphan stays.
rows=$'500\t1\t9000\tnode /repo/mcp/obsidian-bridge/index.js\n501\t1\t10\tnode /repo/mcp/obsidian-bridge/index.js\n'
got="$(printf '%s' "$rows" | decide_cull_rows 3600 1 | tr '\n' ' ')"
[[ "$got" == "500 " ]] || fail "only the aged pid-1 bridge should go, got [$got]"

# Age-only mode also removes the live bridge once it is old.
rows=$'300\t80\t28800\tnode /repo/mcp/obsidian-bridge/index.js\n'
got="$(printf '%s' "$rows" | decide_cull_rows 3600 0 | tr '\n' ' ')"
[[ "$got" == "300 " ]] || fail "keep_newest=0 should cull the aged live bridge, got [$got]"

echo "cull tests passed"
