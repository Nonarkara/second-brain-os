# obsidian-bridge — production coding MCP (filesystem forge)

> **Recommended for coding agents.** Stdio MCP over your vault folder. Works with Obsidian open **or** closed. Pairs with `mcp/obsidian-memory/` (disposable SQLite + optional Ollama embeds).

This is the coding path. Official **Local REST API + MCP** is an optional alternate when Obsidian is open and you want tags / open-note / `vault_patch`. Coding does not depend on it. See [`docs/obsidian-mcp-setup.md`](../../docs/obsidian-mcp-setup.md).

The bridge resolves `brain.py` as the sibling `../obsidian-memory/brain.py` (this repo's `mcp/` layout, or a vault `.mcp/` copy with the same shape). `OBSIDIAN_BRAIN_CLI` overrides that. A fork does not need to copy the bridge into the vault.

## Quick start

```bash
export OBSIDIAN_VAULT="${OBSIDIAN_VAULT:-$PWD/vault}"
export OBSIDIAN_TIME_ZONE="${OBSIDIAN_TIME_ZONE:-Asia/Bangkok}"
cd mcp/obsidian-bridge && npm install
```

Wire Cursor, Claude Code, or Codex with the stdio block in [`mcp/config/.mcp.json.example`](../config/.mcp.json.example) and [`mcp/config/codex-config.toml.example`](../config/codex-config.toml.example). `command` is `node`, or the output of `command -v node` on this machine when the app's PATH is too small. Do not reuse another machine's Homebrew path.

## Prove it

From the repo root, after `npm install`:

```bash
python3 mcp/obsidian-memory/brain.py index --json
node mcp/obsidian-bridge/smoke-test.mjs
bash scripts/cull-orphan-mcp-bridges.sh
```

Smoke must print `"status": "pass"`. It launches this directory's `index.js` with the same `node` you used to start it.

## While you code

One `get_brain_context` when you need orientation. `recall_lessons` (limit 3) before a task, with the real symptom and no secrets. `search_vault` when you remember a phrase. `capture_lesson` only after a fix you verified. Do not load the vault into the prompt. Obsidian can stay closed.

A live client holds one bridge. Codex can hold one more per thread until the hourly cull's age floor. Do not aim for zero processes while you are working.

## Hard-won hygiene

| Failure | Fix |
|---|---|
| Many `obsidian-bridge/index.js` processes | `scripts/cull-orphan-mcp-bridges.sh` keeps the newest per live client and removes older extras |
| Eval is 0 because the suite names notes you do not have | `python3 mcp/obsidian-memory/build_eval_cases.py` from your own scars |
| `missing_embeddings > 0` | Ollama `nomic-embed-text`, or accept lexical fallback |
| Secrets in notes | `node scripts/secondbrain-doctor.mjs` fails closed |
