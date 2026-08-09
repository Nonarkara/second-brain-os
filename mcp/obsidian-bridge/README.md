# obsidian-bridge — superseded (kept for reference)

**You probably don't need this.** As of **v4.0 (May 2026)** the official
[Local REST API](https://github.com/coddingtonbear/obsidian-local-rest-api)
plugin ships an MCP server **built in** — the plugin is now called
*"Local REST API with MCP"*.

Use that instead: **[`docs/obsidian-mcp-setup.md`](../../docs/obsidian-mcp-setup.md)**

## Why the built-in server is better

| | This bridge | Built-in plugin MCP |
|---|---|---|
| Extra process to run | Yes | No — Obsidian *is* the server |
| Tools exposed | ~6 (filesystem ops) | **16** |
| Knows tags / backlinks | No | Yes |
| Section-level edits | No | Yes (`vault_patch`) |
| Run Obsidian commands | No | Yes (`command_execute`) |
| Knows the open note | No | Yes |
| Maintained by | This repo | Plugin author, 2.6k★ |

## When this bridge is still the right answer

One genuine case: **you need vault access while Obsidian is closed.** The
plugin only serves the currently open vault, so a headless box syncing markdown
with no Obsidian UI cannot use it. A filesystem-based MCP server — this bridge,
or any maintained equivalent — still works there.

For that scenario, prefer an actively maintained filesystem MCP server over
this code, which is retained as a worked example rather than as a supported
component.
