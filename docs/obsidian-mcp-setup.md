# Obsidian as a coding MCP brain — A+ setup

> Goal: every coding agent (Cursor, Claude Code, Codex) can **recall scars, capture verified lessons, and search your vault** without re-burning tokens. Filesystem only. $0 SaaS. Obsidian does not have to be open.

Time: about 15 minutes once Node and Python are installed.

---

## What “A+” means here

1. **Filesystem forge (stdio)** is the **production coding MCP**. It reads and writes the vault folder. The Obsidian app can be quit.
2. **Disposable recall index** (SQLite FTS5 + optional Ollama embeddings). Markdown is truth. Delete the DB anytime.
3. **Hygiene:** one bridge per live client, smoke green, a 20-case eval built from *your* notes, no secrets in notes.
4. **Official Local REST API + MCP** is an **optional alternate** when Obsidian is actually serving HTTP and you want Obsidian-native tags / open note / `vault_patch`. Coding must not depend on it.

| | **Filesystem forge (recommended)** | Local REST API + MCP (optional) |
|---|---|---|
| Obsidian running? | Not required | Required, and the REST port must be listening |
| Coding agents | Daily driver | Only while the plugin is really up |
| Scar recall + eval | Yes (`mcp/obsidian-memory`) | Separate |
| Section patch / open note | Via files | Native plugin tools |
| Failure we paid for | Extra Node processes — cull the old ones, keep the live client | Plugin “on” but nothing listening |

The bridge in this repo is `mcp/obsidian-bridge`. The CLI is the sibling `mcp/obsidian-memory/brain.py`. A vault does **not** need its own copy of either. `OBSIDIAN_BRAIN_CLI` overrides the CLI path if you moved it.

---

## Path A — Filesystem forge (do this)

### 1. Point at a vault

Use your real vault, or this repo’s `vault/` stubs while learning:

```bash
export OBSIDIAN_VAULT="$PWD/vault"   # learning, from the repo root
# export OBSIDIAN_VAULT="$HOME/Documents/SecondBrain"  # a real vault
export OBSIDIAN_TIME_ZONE="${OBSIDIAN_TIME_ZONE:-Asia/Bangkok}"
```

`OBSIDIAN_TIME_ZONE` is any IANA name (`Asia/Bangkok`, `UTC`, `America/New_York`). Daily notes and captured lessons use it. An invalid name falls back to `Asia/Bangkok`.

### 2. Install

```bash
cd mcp/obsidian-bridge
npm install
cd ../..
python3 mcp/obsidian-memory/brain.py index --json
node mcp/obsidian-bridge/smoke-test.mjs
```

Smoke launches `mcp/obsidian-bridge/index.js` with the same `node` that started the test (`process.execPath`). It does not look for a copy under `$OBSIDIAN_VAULT/.mcp/`. It must print `"status": "pass"`.

On the empty `vault/` stub, recall returns no lessons and `audit_super_mcp` WARNs on Soul and project files you have not written. That is expected. The pass line that matters is `PASS local recall index: ready` and zero exposed secrets.

### 3. Wire each client once

Copy paths from **this** machine. `command -v node` is the node path. GUI apps often start with a PATH that cannot see Homebrew, nvm, or a user-level install, so if `"node"` fails, paste that absolute path into the config that lives only on this computer.

Do not commit the filled-in file. Another OS username makes `/Users/you/...` and `/home/you/...` wrong.

**Cursor** — `~/.cursor/mcp.json` (one global entry; skip a second project entry with the same name):

```json
{
  "mcpServers": {
    "obsidian-bridge": {
      "command": "node",
      "args": ["/ABS/PATH/second-brain-os/mcp/obsidian-bridge/index.js"],
      "env": {
        "OBSIDIAN_VAULT": "/ABS/PATH/to/your/vault",
        "OBSIDIAN_TIME_ZONE": "Asia/Bangkok"
      }
    }
  }
}
```

See [`mcp/config/.mcp.json.example`](../mcp/config/.mcp.json.example).

**Claude Code** — user scope **or** a project `.mcp.json`, not both under the name `obsidian-bridge`. Two definitions with the same name hide which vault you are reading and can start two stdio processes.

User scope follows you across repos (this is the usual choice for one personal vault):

```bash
claude mcp add -s user \
  -e OBSIDIAN_VAULT="$OBSIDIAN_VAULT" \
  -e OBSIDIAN_TIME_ZONE="$OBSIDIAN_TIME_ZONE" \
  -- obsidian-bridge -- "$(command -v node)" "$PWD/mcp/obsidian-bridge/index.js"
```

If this checkout also has a project `.mcp.json` (or `.mcp.json`) defining `obsidian-bridge`, delete one of them. `python3 mcp/obsidian-memory/install-connections.py --check` reports whether the user-level Claude, Cursor, and Codex files match. `--apply` writes them. It records the repo bridge path, not `$VAULT/.mcp/obsidian-bridge`.

Claude Desktop can have an empty MCP list. Coding does not need it.

**Codex** — paste [`mcp/config/codex-config.toml.example`](../mcp/config/codex-config.toml.example) into `~/.codex/config.toml`:

```toml
[mcp_servers.obsidian]
command = "node"
args = ["/ABS/PATH/second-brain-os/mcp/obsidian-bridge/index.js"]
startup_timeout_sec = 10
tool_timeout_sec = 60

[mcp_servers.obsidian.env]
OBSIDIAN_VAULT = "/ABS/PATH/to/your/vault"
OBSIDIAN_TIME_ZONE = "Asia/Bangkok"
```

`startup_timeout_sec` is how long Codex waits for the stdio handshake. `tool_timeout_sec` is how long one tool call may run (an index rebuild on a large vault). Codex can leak **one bridge per thread**. That is a leak, not a target of zero. The cull below keeps the newest bridge for each living client and removes older extras after the age floor.

### 4. While you code

- **One** `get_brain_context` when a session needs orientation. Not every turn.
- **`recall_lessons`** before a task. Limit 3. Pass the symptom, project, stack, or error. No secrets, no whole-vault dump.
- **`search_vault`** when you remember a phrase.
- **`capture_lesson`** only after a fix you actually verified. Hypotheses stay out of `Scars/Debug-Logs`.
- **`audit_super_mcp`** when the substrate feels wrong, not as a prologue to every edit.
- Obsidian can stay closed. The tools talk to the folder.

### 5. Eval from your own notes

A checkout used to embed another vault’s scar paths. On a fork that suite scores 0/20. Build yours:

```bash
export OBSIDIAN_VAULT=/path/to/your/vault
python3 mcp/obsidian-memory/build_eval_cases.py
python3 mcp/obsidian-memory/brain.py eval --json
```

The builder writes `$OBSIDIAN_VAULT/.mcp/cache/eval-cases.json` and exits 0 only when 20 cases come back in the top 3. You need durable markdown in the recall roots (`Scars/Debug-Logs`, `Scars/Anti-Regression`, `Knowledge/Topics`, `Knowledge/Bible`, `Will/Projects`, and the rest listed in `memory_core.py`). `capture_lesson` with a concrete verification line is the normal way to grow that set.

Hand-written cases start from [`mcp/obsidian-memory/eval-cases.template.json`](../mcp/obsidian-memory/eval-cases.template.json). Use a phrase that appears in one note. When a newer note steals a generic query, retarget that case. Do not commit the generated file. The operator bar is `"passed": 20, "total": 20`.

The learning stub can pass smoke before it can pass eval.

### 6. Cull

```bash
bash scripts/cull-orphan-mcp-bridges.sh
```

The matcher is a `node` (or `nodejs`) process with a later argv entry ending in `obsidian-bridge/index.js` (override the suffix with `OBSIDIAN_BRIDGE_CULL_PATTERN`). It does not use a `SecondBrain/.mcp/...` path, and it does not `pgrep -f` that string: clients embed the path inside their own command line, and a shell that merely mentions the path is not a bridge.

Default policy (`OBSIDIAN_BRIDGE_CULL_KEEP_NEWEST=1`, `OBSIDIAN_BRIDGE_CULL_MIN_AGE_SEC=3600`):

- Keep the newest bridge of each living parent, no matter how old that session is.
- Remove older siblings only after they are an hour old.
- Remove bridges whose parent has exited (reparented to pid 1) once they pass the same floor.

After a cull you should still see **one bridge per live client**. Cursor is usually one. Codex may still show a young extra per thread until that extra passes the floor. Zero while you are working means you killed the live client. `OBSIDIAN_BRIDGE_CULL_KEEP_NEWEST=0` is the blunt version that also removes an aged live bridge. Leave it at 1.

An hourly launchd example is [`scripts/launchd/com.secondbrain.cull-orphan-bridges.plist.example`](../scripts/launchd/com.secondbrain.cull-orphan-bridges.plist.example).

### 7. Nightly writer (one machine)

```text
cull → index → eval → doctor → git ship
```

Shipped scripts, sanitized (no private paths, no keys):

| Script | Role |
|---|---|
| [`scripts/vault-maintenance.mjs`](../scripts/vault-maintenance.mjs) | Redact secret-shaped tokens outside credentials, archive sessions older than 14 days, trim repeated error floods, refresh `Bridges/Today.md`, stub today’s daily note, cull, index, eval, doctor, then git ship |
| [`scripts/secondbrain-doctor.mjs`](../scripts/secondbrain-doctor.mjs) | Read-only scan. Exit 1 on secret-like patterns outside `Vitals/Credentials/`. The report names the pattern, not the matched text |
| [`scripts/generate-today.mjs`](../scripts/generate-today.mjs) | Rewrites `Bridges/Today.md` from active projects, recent sessions, and open loops |
| [`scripts/run-vault-maintenance.sh`](../scripts/run-vault-maintenance.sh) | launchd wrapper. Finds `node` on PATH. Does not hardcode a Homebrew prefix as the binary |

```bash
OBSIDIAN_VAULT="$HOME/Documents/SecondBrain" node scripts/vault-maintenance.mjs
```

Git ship runs only when the vault directory **is** the git root. A `vault/` folder inside this repo is not shipped (that would commit the OS checkout). `OBSIDIAN_MAINTENANCE_SHIP=0` skips git. A failed doctor skips git.

05:30 **local** time, on the writer machine only: [`scripts/launchd/com.secondbrain.vault-maintenance.plist.example`](../scripts/launchd/com.secondbrain.vault-maintenance.plist.example). Replace `__HOME__` and `__REPO__` with absolute paths. launchd does not expand `~`. Do not commit the filled-in plist.

```bash
cp scripts/launchd/com.secondbrain.vault-maintenance.plist.example \
  ~/Library/LaunchAgents/com.secondbrain.vault-maintenance.plist
# edit the copy, then:
launchctl bootstrap "gui/$(id -u)" ~/Library/LaunchAgents/com.secondbrain.vault-maintenance.plist
```

Load the hourly cull plist the same way if Codex threads are leaking bridges.

Optional embeds: [Ollama](https://ollama.com) + `ollama pull nomic-embed-text`, then `brain index` until `missing_embeddings` is 0. Lexical search works without it.

---

## Path B — Local REST API + MCP (optional)

Use this only when you want Obsidian-aware tools **and** Obsidian is actually listening. Coding agents keep the filesystem forge either way.

1. Community plugin **Local REST API with MCP** → Enable → copy the API key (it is a full read/write password).
2. Quit Obsidian fully and reopen it so a window exists. “Keep running in background” can leave the app looking up with **no window and no port**.
3. Check `27123` / `27124` with `lsof`. Configured-but-dead is the usual REST failure.
4. Point an HTTP MCP client at `http://127.0.0.1:27123/mcp` with `Authorization: Bearer …`.

Never commit `.obsidian/**/data.json`.

---

## Two machines

One vault. **One nightly writer** (the Mac whose launchd runs `vault-maintenance.mjs` and pushes). The other machine pulls. Two writers diverge or reject each other’s pushes.

- Different OS usernames break committed absolute paths. Keep `mcp.json`, `config.toml`, and the filled-in plist off git. The examples use `/ABS/PATH` on purpose.
- A second install can quietly point `OBSIDIAN_VAULT` at a different folder, or wire only the REST plugin, and look “set up” while recall hits the wrong notes. After wiring, confirm the client command is the stdio `index.js` from this repo and that `OBSIDIAN_VAULT` is the folder you indexed.
- Obsidian keepalive is not a REST health check. The filesystem bridge does not use port 27123.
- `command -v node` on each machine. `/opt/homebrew/bin/node` is one Apple Silicon layout. Intel Homebrew, nvm, and Linux are different. Do not copy the path from the other computer.

---

## Failure modes

| Symptom | Cause | Fix |
|---|---|---|
| `recall_lessons` / audit cannot find `brain.py` | An old build looked under `$VAULT/.mcp/obsidian-memory/` | Use this repo’s bridge. Or set `OBSIDIAN_BRAIN_CLI` |
| Smoke looks for a vault copy of `index.js` | Old smoke path | `node mcp/obsidian-bridge/smoke-test.mjs` from the repo |
| Eval 0/20 | Suite names notes that are not in this vault | `build_eval_cases.py` from your scars. Do not commit it |
| Many bridge processes | Clients leak stdio servers; Codex one per thread | Hourly cull. Expect one per live client, not zero |
| `node` not found inside Cursor/Codex/launchd | Minimal PATH | `command -v node` on that machine, paste it into that machine’s config |
| REST “up”, tools dead | App kept alive with no window; port closed | Filesystem forge for coding. Restart Obsidian only if you wanted REST |
| Second computer recalls a different vault | Drifted `OBSIDIAN_VAULT` or REST-only config | Point stdio at the writer’s vault path (or a pull of it) |
| Doctor exit 1 | Secret-like token outside `Vitals/Credentials/` | Rotate it. Maintenance will not push |

---

## Related

- Bridge: [`mcp/obsidian-bridge/`](../mcp/obsidian-bridge/)
- Memory CLI: [`mcp/obsidian-memory/`](../mcp/obsidian-memory/)
- Maintenance: [`scripts/`](../scripts/)
