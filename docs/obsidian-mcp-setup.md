# Obsidian as an MCP Second Brain — The 2026 Setup

> Goal: your AI coding agent can **read, search, write and organise** your
> Obsidian vault as a first-class tool — not by pasting notes into a chat box.
>
> Time: ~10 minutes. Cost: $0. Everything runs on your machine.

Every command and output on this page was executed against a real 1.7GB vault
on macOS with Obsidian 1.4+, and the failure modes at the bottom are ones that
actually happened during that setup.

---

## The 2026 change that makes this simple

**You almost certainly do not need a custom MCP bridge any more.**

Until mid-2026 the standard approach was to run a third-party Node/Python MCP
server that read your vault off the filesystem. As of **v4.0 (May 2026)**, the
official **Local REST API** plugin ships an **MCP server built in**. It is now
called *"Local REST API with MCP"*.

That matters for three reasons:

1. **Fewer moving parts.** No separate process to install, supervise, or keep
   alive. If Obsidian is running, your MCP server is running.
2. **It is Obsidian-aware.** A filesystem server sees folders of markdown. The
   plugin sees *Obsidian*: tags with usage counts, the currently open note,
   periodic notes, the command palette, and Obsidian's own search.
3. **Structured editing.** `vault_patch` targets a specific heading or block
   rather than rewriting whole files — which is what stops an agent from
   silently clobbering a note.

> If you are running a custom bridge today, this guide replaces it. Keep the old
> config until the new one is verified, then delete it.

### Two architectures, briefly

| | Filesystem MCP | **Local REST API + MCP** (recommended) |
|---|---|---|
| Setup | Point it at a folder | Install plugin, copy key |
| Obsidian running? | Not required | **Required** |
| Knows tags/backlinks | No | Yes |
| Obsidian commands | No | Yes |
| Section-level edits | No | Yes (`vault_patch`) |
| Best for | Read-only over a synced vault | Day-to-day agentic work |

Pick filesystem only if you need vault access while Obsidian is closed.

---

## Setup

### 1. Install the plugin

Settings → Community plugins → Browse → **"Local REST API"**
(shows as *Local REST API with MCP*, by Adam Coddington) → Install → **Enable**.

### 2. Copy your API key

Settings → Local REST API. Copy the key. Treat it like a password: it grants
**full read/write** access to your vault.

Note both ports:

- `27124` — HTTPS, self-signed certificate
- `27123` — HTTP, must be switched on ("Enable insecure server")

### 3. Restart Obsidian — do not skip this

Enabling a plugin does **not** reliably start its server. Verify a socket is
actually open before going further:

```bash
lsof -nP -iTCP -sTCP:LISTEN | grep -i obsidian
```

Expected:

```
Obsidian  127.0.0.1:27124
Obsidian  127.0.0.1:27123
```

If that prints nothing, the plugin is enabled but not running. Fully quit
Obsidian (not just close the window) and reopen it. This single step is the
most common reason "the MCP server doesn't work".

### 4. Confirm the API answers

```bash
curl -sk https://127.0.0.1:27124/ | head -5
```

`"status": "OK"` means the server is up. Now authenticate:

```bash
curl -sk https://127.0.0.1:27124/vault/ -H "Authorization: Bearer YOUR_API_KEY"
```

You should get a JSON list of your top-level vault files.

### 5. Register with your agent

**Claude Code:**

```bash
claude mcp add --scope user --transport http obsidian \
  "http://127.0.0.1:27123/mcp" \
  --header "Authorization: Bearer YOUR_API_KEY"
```

Then confirm:

```bash
claude mcp list
```

```
obsidian: http://127.0.0.1:27123/mcp (HTTP) - ✓ Connected
```

**Why the HTTP port here?** The HTTPS port uses a self-signed certificate, and
most MCP clients reject it without extra trust configuration. Port 27123 is
bound to loopback only, so the key never leaves your machine. If you prefer
HTTPS, add the plugin's certificate to your system trust store first.

**Other clients** (Claude Desktop, Cursor, Windsurf) use a JSON config —
same URL and header:

```jsonc
{
  "mcpServers": {
    "obsidian": {
      "type": "http",
      "url": "http://127.0.0.1:27123/mcp",
      "headers": { "Authorization": "Bearer YOUR_API_KEY" }
    }
  }
}
```

### 6. Verify the handshake yourself (optional but worth it)

If a client says "failed to connect", test the protocol directly:

```bash
curl -s -X POST http://127.0.0.1:27123/mcp \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize",
       "params":{"protocolVersion":"2025-06-18","capabilities":{},
                 "clientInfo":{"name":"probe","version":"1"}}}'
```

A healthy server returns its capabilities:

```
event: message
data: {"result":{"protocolVersion":"2025-06-18",
       "capabilities":{"resources":{...},"tools":{...}},
       "serverInfo":{"name":"obsidian-local-rest-api",...}}}
```

**`HTTP 406` is not an error you should fear** — it means the endpoint exists
but your `Accept` header is wrong. The streamable-HTTP transport requires
`application/json, text/event-stream`.

---

## What your agent can now do — the 16 tools

| Tool | What it's for |
|---|---|
| `vault_list` | List files/folders in a directory |
| `vault_read` | Read a note's content + metadata |
| `vault_write` | Create or **overwrite** a note |
| `vault_append` | Append to a note (creates if missing) |
| `vault_patch` | Edit one heading/section — safest write |
| `vault_delete` | Delete a note |
| `vault_move` | Move/rename, creating folders as needed |
| `vault_get_document_map` | Outline of a note's headings/structure |
| `active_file_get_path` | What you have open right now |
| `periodic_note_get_path` | Today's daily/weekly note |
| `search_simple` | Obsidian's own search |
| `search_query` | Structured JsonLogic query |
| `tag_list` | Every tag with usage counts |
| `command_list` | Every registered Obsidian command |
| `command_execute` | Run an Obsidian command |
| `open_file` | Open a note in the UI |

The two that change how you work: **`vault_patch`**, because section-level edits
mean an agent can update one part of a long note without rewriting it; and
**`command_execute`**, because anything you can do from the command palette,
your agent can now do too.

---

## Security — read this before enabling writes

The API key is **full read/write access to everything in your vault.**

- **Loopback only.** Both ports bind to `127.0.0.1`. Do not port-forward them,
  do not expose them through a tunnel. There is no per-note permission model.
- **The key is a credential.** Don't commit it, don't paste it into issues, and
  be aware that shell commands containing it land in your shell history and
  your agent's transcript. Rotate it in plugin settings if it leaks.
- **Version-control the vault before granting writes.** This is the real safety
  net. `git init` in your vault and commit regularly — then any bad agent edit
  is `git diff` and `git checkout` away, not a restore-from-memory exercise.
- **Prefer `vault_patch` over `vault_write`** in your agent instructions.
  Overwrite is how notes get silently truncated.
- **Exclude noise.** Vault settings → Files & Links → *Excluded files*, and
  keep caches, `node_modules`, and session logs out of search — otherwise your
  agent burns context reading build artefacts.

A reasonable `.gitignore` for a vault under version control:

```gitignore
.obsidian/workspace.json      # cursor position, changes constantly
.obsidian/plugins/*/data.json # PLUGIN SECRETS — including your API key
.trash/
.DS_Store
```

> That second line matters: the Local REST API plugin stores your API key in
> `.obsidian/plugins/obsidian-local-rest-api/data.json`. If you commit your
> `.obsidian` folder without excluding it, you publish your vault credential.

---

## Make the agent actually useful: give it house rules

An agent with vault access and no instructions will make a mess — inventing
folders, duplicating notes, overwriting things. Put a short instruction note at
your vault root (e.g. `AI_INSTRUCTIONS.md`) and reference it in your agent's
project instructions.

What earns its place in that file:

- **Where things go.** "Daily captures → `Inbox/`. Never create top-level
  folders." Ambiguity here is the single biggest source of mess.
- **Write discipline.** "Use `vault_patch` for edits. `vault_write` only for
  new notes. Never delete without asking."
- **Naming and frontmatter.** The exact shape you expect, with one example.
  Agents copy patterns reliably and invent them badly.
- **Linking.** "Link related notes with `[[wikilinks]]`. A link to a note that
  doesn't exist yet is fine — it marks something worth writing."
- **What not to touch.** Anything private, anything generated.

---

## Structuring a vault an agent can navigate

Folder-by-type (`notes/`, `pdfs/`, `images/`) is easy to create and useless to
search — it tells an agent nothing about *meaning*.

Organise by **function** instead. This repo's vault uses a brain metaphor,
which works well precisely because the names describe what a thing is *for*:

| Folder | Function |
|---|---|
| `Inbox/` | Unprocessed capture — everything lands here first |
| `Hippocampus/` | Long-term memory: durable facts and references |
| `FrontalLobe/` | Planning, decisions, active thinking |
| `Amygdala/` | Instincts, values, the things you react strongly to |
| `Cerebellum/` | Procedures and repeatable how-tos |
| `Reflexes/` | Automations and scripts |
| `Scars/` | Postmortems — what went wrong and what it taught |

You don't have to use these names. The transferable rules are:

1. **One inbox.** Exactly one place where new things land, so nothing is lost
   and the agent never has to guess where to put a capture.
2. **Name by function, not format.** `Scars/` tells an agent what belongs
   there; `docs/` does not.
3. **Shallow.** Two levels max. Deep nesting is where notes go to die.
4. **A `Scars/`-equivalent is worth more than it sounds.** Postmortems are the
   highest-value thing you can hand an agent later, because they encode what
   you learned the expensive way.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Nothing on 27123/27124 | Plugin enabled but never started | **Fully quit and reopen Obsidian**, then re-check with `lsof` |
| `HTTP 406` on `/mcp` | Wrong `Accept` header | Send `application/json, text/event-stream` |
| `HTTP 401` | Missing/incorrect key | `Authorization: Bearer <key>`, re-copy from settings |
| Client won't connect over HTTPS | Self-signed cert rejected | Use the HTTP port on loopback, or trust the plugin's cert |
| Connects, but agent can't find notes | Vault not open in Obsidian | The plugin only serves the **currently open vault** |
| Tools missing after upgrade | Client cached the old tool list | Restart the agent client |
| Agent edits wander | No house rules | Add `AI_INSTRUCTIONS.md` (above) |

**The two-minute diagnosis**, in order — each step rules out everything above it:

```bash
pgrep -f Obsidian                                  # 1. app running?
lsof -nP -iTCP -sTCP:LISTEN | grep -i obsidian     # 2. plugin serving?
curl -sk https://127.0.0.1:27124/                  # 3. API answering?
curl -sk https://127.0.0.1:27124/vault/ \
  -H "Authorization: Bearer KEY"                   # 4. key valid?
claude mcp list                                    # 5. client connected?
```

---

## Sources

- [Local REST API plugin (obsidian-local-rest-api)](https://github.com/coddingtonbear/obsidian-local-rest-api)
- [Model Context Protocol](https://modelcontextprotocol.io/)
- [Obsidian MCP: Setup Guide + 6 Best Servers (2026)](https://contextbolt.com/blog/obsidian-mcp-claude/)
- [How to Set Up the Obsidian MCP Server for Claude Code (2026)](https://markanamedia.com/blog/obsidian-mcp-server-claude-code/)
- [Obsidian MCP Server: Connect Your Vault to AI Agents (2026)](https://www.morphllm.com/obsidian-mcp-server)
