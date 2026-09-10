# obsidian-bridge — production coding MCP (filesystem forge)

> **Recommended for coding agents.** Stdio MCP over your vault folder. Works with Obsidian open **or** closed. Pairs with `mcp/obsidian-memory/` (disposable SQLite + optional Ollama embeds).

This is the A+ path Dr Non runs daily after burning tokens on weaker setups. Official **Local REST API + MCP** remains a useful *optional* alternate when Obsidian is open and you want tags / open-note / `vault_patch` — see [`docs/obsidian-mcp-setup.md`](../../docs/obsidian-mcp-setup.md). It does **not** replace this forge for Cursor / Claude / Codex / Antigravity coding sessions.

## Quick start

```bash
export OBSIDIAN_VAULT=/absolute/path/to/your/vault   # or this repo's vault/ stubs while learning
cd mcp/obsidian-bridge && npm install

# Wire Cursor / Claude / Codex (example ~/.cursor/mcp.json):
# {
#   "mcpServers": {
#     "obsidian-bridge": {
#       "command": "/opt/homebrew/bin/node",
#       "args": ["/ABS/PATH/second-brain-os/mcp/obsidian-bridge/index.js"],
#       "env": { "OBSIDIAN_VAULT": "/ABS/PATH/to/vault" }
#     }
#   }
# }
```

Also see [`mcp/config/.mcp.json.example`](../config/.mcp.json.example).

## Prove it (do not skip)

```bash
bash scripts/cull-orphan-mcp-bridges.sh
python3 mcp/obsidian-memory/brain.py index --json
python3 mcp/obsidian-memory/brain.py eval --json    # after you have scars; target 20/20
cd mcp/obsidian-bridge && node smoke-test.mjs       # must print status: pass
```

## Hard-won hygiene

| Failure | Fix |
|---|---|
| Double-digit zombie `node …/obsidian-bridge` processes | `scripts/cull-orphan-mcp-bridges.sh` (Claude/Cursor leave orphans) |
| Eval/smoke goes red after new scars | Retarget fixtures — generic queries get stolen |
| `missing_embeddings > 0` for days | Run Ollama `nomic-embed-text` or accept lexical fallback honestly |
| Secrets in notes | Doctor fails closed; Keychain/env names only |

Skill write-up for vibecoders: [`obsidian-mcp-forge`](https://github.com/Nonarkara/dr-non-vibecoding-skills/tree/main/skills/obsidian-mcp-forge) (PR may land on `docs/obsidian-mcp-a-plus`).

## Tools (high level)

Recall / capture / context / audit / search plus vault write helpers. Markdown remains authoritative; `.mcp/cache/` is gitignored disposable index.
