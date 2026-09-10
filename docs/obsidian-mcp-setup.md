# Obsidian as a coding MCP brain — A+ setup

> Goal: every coding agent (Cursor, Claude Code, Codex, Antigravity) can **recall scars, capture verified lessons, and search your vault** without re-burning tokens — on one Mac, $0 SaaS.

Time: ~15 minutes. Everything local.

---

## What “A+” means here

1. **Filesystem forge (stdio)** is the **production coding MCP** — works with Obsidian open or closed.
2. **Disposable recall index** (SQLite FTS5 + optional Ollama embeddings) — Markdown is truth; delete the DB anytime.
3. **Hygiene:** cull orphan bridge processes, green smoke, retrieval eval suite, no secrets in notes.
4. **Official Local REST API + MCP** is an **optional alternate** when Obsidian is open and you want Obsidian-native tags / open note / `vault_patch`.

| | **Filesystem forge (recommended)** | Local REST API + MCP (optional) |
|---|---|---|
| Obsidian running? | Not required | Required |
| Coding agents (Cursor/Claude/Codex) | Best daily driver | Works when plugin is up |
| Local scar recall + eval | Yes (`mcp/obsidian-memory`) | Separate |
| Section patch / open note | Via files | Native plugin tools |
| Failure mode we paid for | Zombie Node processes — cull them | Plugin enabled but port not listening — restart Obsidian |

> Older drafts of this guide called the forge “superseded.” That was wrong for coding. The forge is what survived contact with a real multi-agent desk.

---

## Path A — Filesystem forge (do this)

### 1. Point at a vault

Use your real vault, or this repo’s `vault/` stubs while learning:

```bash
export OBSIDIAN_VAULT="$PWD/vault"   # learning
# export OBSIDIAN_VAULT="$HOME/Documents/SecondBrain"  # production
```

### 2. Install the bridge

```bash
cd mcp/obsidian-bridge
npm install
```

### 3. Wire your agents

Copy [`mcp/config/.mcp.json.example`](../mcp/config/.mcp.json.example) into Cursor / Claude / project `.mcp.json`. Prefer the **stdio `obsidian-bridge` block** (filesystem). Set absolute paths.

### 4. Index + prove

```bash
python3 mcp/obsidian-memory/brain.py index --json
cd mcp/obsidian-bridge && node smoke-test.mjs
bash scripts/cull-orphan-mcp-bridges.sh
```

Optional hybrid embeds: install [Ollama](https://ollama.com) + `ollama pull nomic-embed-text`, then re-run `brain index` until `missing_embeddings` is 0.

### 5. Ritual

Before coding: `recall_lessons` (max 3). After a **verified** fix: `capture_lesson`. Never capture hypotheses. Never write API keys into notes.

Nightly (operator vaults): cull → index → eval → doctor → git ship. See `scripts/cull-orphan-mcp-bridges.sh` and the vibecoding skill [`obsidian-mcp-forge`](https://github.com/Nonarkara/dr-non-vibecoding-skills/blob/main/skills/obsidian-mcp-forge/SKILL.md).

---

## Path B — Local REST API + MCP (optional)

Use when you want Obsidian-aware tools and Obsidian stays open.

1. Community plugin **Local REST API with MCP** → Enable → copy API key (full R/W password).
2. Fully quit and reopen Obsidian; verify listen ports `27123` / `27124`.
3. Point an HTTP MCP client at `http://127.0.0.1:27123/mcp` with `Authorization: Bearer …`.
4. Keep the filesystem forge wired for coding agents anyway.

Never commit `.obsidian/**/data.json`.

---

## Failure modes we actually hit

| Symptom | Cause | Fix |
|---|---|---|
| 10–20 `node …/obsidian-bridge` processes | Clients spawn stdio servers and don’t reap | `bash scripts/cull-orphan-mcp-bridges.sh` |
| Smoke/eval fails on an old “map vanished” query | Newer scars steal generic queries | Retarget `eval-cases.json` / smoke fixture |
| `indexFresh=false` / missing embeds | Ollama down or never pulled | Start Ollama + `nomic-embed-text`, re-index |
| REST MCP “configured” but dead | Plugin enabled, server not listening | Full restart; `lsof` the ports |
| Keys in the vault | Ingest / paste | Rotate; doctor must stay clean |

---

## Related

- Bridge: [`mcp/obsidian-bridge/`](../mcp/obsidian-bridge/)
- Memory CLI: [`mcp/obsidian-memory/`](../mcp/obsidian-memory/)
- Vibecoding skill: [obsidian-mcp-forge](https://github.com/Nonarkara/dr-non-vibecoding-skills/tree/main/skills/obsidian-mcp-forge)
