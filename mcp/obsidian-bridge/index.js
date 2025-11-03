#!/usr/bin/env node
/**
 * obsidian-bridge — MCP Server for Obsidian Second Brain
 *
 * Exposes the Obsidian vault as tools callable by Claude Code and other
 * MCP-compatible agents. Supports read, write, search, and structured
 * capture operations.
 *
 * Configuration via environment variables:
 *   OBSIDIAN_VAULT   — absolute path to vault root (required)
 *   MCP_PORT         — HTTP port if using HTTP transport (default: stdio)
 *
 * Install:
 *   npm install
 *   # Add to ~/.claude.json or project .mcp.json (see config/ for examples)
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import fs from "fs/promises";
import path from "path";

const VAULT = process.env.OBSIDIAN_VAULT;
if (!VAULT) {
  console.error("[obsidian-bridge] OBSIDIAN_VAULT env var not set");
  process.exit(1);
}

// ── Tool definitions ────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: "write_inbox",
    description: "Write a new note to the vault inbox (Senses/Inbox/). The daily agent will process and route it.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Note title (becomes filename)" },
        content: { type: "string", description: "Markdown body" },
        source: { type: "string", description: "Where this came from: telegram, line, api, voice, session" },
        tags: { type: "array", items: { type: "string" }, description: "Obsidian tags" },
      },
      required: ["title", "content"],
    },
  },
  {
    name: "write_note",
    description: "Create or overwrite a note at a specific vault path.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path relative to vault root, e.g. Knowledge/Topics/my-note.md" },
        content: { type: "string", description: "Full markdown content" },
        frontmatter_fields: { type: "object", description: "YAML frontmatter key-value pairs (optional)" },
      },
      required: ["path", "content"],
    },
  },
  {
    name: "read_note",
    description: "Read a note from the vault by path.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path relative to vault root" },
      },
      required: ["path"],
    },
  },
  {
    name: "search_vault",
    description: "Full-text search across the vault. Returns matching files with excerpts.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search terms" },
        limit: { type: "number", description: "Max results (default 10)" },
        folder: { type: "string", description: "Restrict search to a folder (optional)" },
      },
      required: ["query"],
    },
  },
  {
    name: "list_topics",
    description: "List all topics/notes in a vault folder.",
    inputSchema: {
      type: "object",
      properties: {
        folder: { type: "string", description: "Folder path relative to vault root (default: Knowledge/Topics)" },
      },
    },
  },
  {
    name: "append_to_daily",
    description: "Append a section to today's daily note (Memory/Daily/YYYY-MM-DD.md). Creates the note if absent.",
    inputSchema: {
      type: "object",
      properties: {
        section: { type: "string", description: "Markdown to append" },
        heading: { type: "string", description: "Heading under which to append (optional)" },
      },
      required: ["section"],
    },
  },
  {
    name: "get_context",
    description: "Retrieve context about Dr Non's current state: recent daily notes, open projects, active topics.",
    inputSchema: {
      type: "object",
      properties: {
        days: { type: "number", description: "How many recent daily notes to include (default 3)" },
      },
    },
  },
  {
    name: "log_decision",
    description: "Append a dated decision to Soul/Working-Philosophy.md decision log.",
    inputSchema: {
      type: "object",
      properties: {
        decision: { type: "string", description: "The decision made" },
        reasoning: { type: "string", description: "Why this decision was made" },
        context: { type: "string", description: "Project or situation context" },
      },
      required: ["decision"],
    },
  },
];

// ── Handlers ────────────────────────────────────────────────────────────────

function vaultPath(...parts) {
  return path.join(VAULT, ...parts);
}

async function ensureDir(filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

function buildFrontmatter(fields) {
  if (!fields || Object.keys(fields).length === 0) return "";
  const yaml = Object.entries(fields)
    .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
    .join("\n");
  return `---\n${yaml}\n---\n\n`;
}

async function handleTool(name, args) {
  switch (name) {

    case "write_inbox": {
      const { title, content, source = "api", tags = [] } = args;
      const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
      const date = new Date().toISOString().split("T")[0];
      const fileName = `${date}-${slug}.md`;
      const filePath = vaultPath("Senses", "Inbox", fileName);
      const tagLine = tags.length ? `\ntags: [${tags.join(", ")}]` : "";
      const body = `---\ntitle: ${JSON.stringify(title)}\nsource: ${source}\ndate: ${date}${tagLine}\n---\n\n# ${title}\n\n${content}\n`;
      await ensureDir(filePath);
      await fs.writeFile(filePath, body, "utf8");
      return { success: true, path: `Senses/Inbox/${fileName}` };
    }

    case "write_note": {
      const { path: notePath, content, frontmatter_fields } = args;
      const filePath = vaultPath(notePath);
      await ensureDir(filePath);
      const fm = buildFrontmatter(frontmatter_fields);
      await fs.writeFile(filePath, fm + content, "utf8");
      return { success: true, path: notePath };
    }

    case "read_note": {
      const filePath = vaultPath(args.path);
      const content = await fs.readFile(filePath, "utf8");
      return { content, path: args.path };
    }

    case "search_vault": {
      const { query, limit = 10, folder } = args;
      const base = folder ? vaultPath(folder) : VAULT;
      const results = [];
      const terms = query.toLowerCase().split(/\s+/);

      async function walk(dir) {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.name.startsWith(".")) continue;
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            await walk(full);
          } else if (entry.name.endsWith(".md")) {
            const content = await fs.readFile(full, "utf8");
            const lower = content.toLowerCase();
            const score = terms.filter(t => lower.includes(t)).length;
            if (score > 0) {
              const rel = path.relative(VAULT, full);
              const match = content.split("\n").find(l => terms.some(t => l.toLowerCase().includes(t))) || "";
              results.push({ path: rel, score, excerpt: match.trim().slice(0, 200) });
            }
          }
          if (results.length >= limit * 3) return;
        }
      }

      await walk(base);
      results.sort((a, b) => b.score - a.score);
      return { results: results.slice(0, limit) };
    }

    case "list_topics": {
      const folder = args.folder || "Knowledge/Topics";
      const dir = vaultPath(folder);
      const entries = await fs.readdir(dir, { withFileTypes: true });
      const files = entries
        .filter(e => e.isFile() && e.name.endsWith(".md"))
        .map(e => e.name.replace(/\.md$/, ""));
      return { folder, topics: files };
    }

    case "append_to_daily": {
      const { section, heading } = args;
      const date = new Date().toISOString().split("T")[0];
      const filePath = vaultPath("Memory", "Daily", `${date}.md`);
      await ensureDir(filePath);
      let existing = "";
      try { existing = await fs.readFile(filePath, "utf8"); } catch {}
      if (!existing) {
        existing = `---\ndate: ${date}\ntype: daily\n---\n# ${date}\n\n`;
      }
      const append = heading ? `\n## ${heading}\n\n${section}\n` : `\n${section}\n`;
      await fs.writeFile(filePath, existing + append, "utf8");
      return { success: true, path: `Memory/Daily/${date}.md` };
    }

    case "get_context": {
      const { days = 3 } = args;
      const summaries = [];
      for (let i = 0; i < days; i++) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const date = d.toISOString().split("T")[0];
        const filePath = vaultPath("Memory", "Daily", `${date}.md`);
        try {
          const content = await fs.readFile(filePath, "utf8");
          summaries.push({ date, content: content.slice(0, 500) });
        } catch {}
      }
      return { recent_days: summaries };
    }

    case "log_decision": {
      const { decision, reasoning = "", context = "" } = args;
      const date = new Date().toISOString().split("T")[0];
      const entry = `\n### ${date}\n\n**Decision:** ${decision}\n${reasoning ? `**Reasoning:** ${reasoning}\n` : ""}${context ? `**Context:** ${context}\n` : ""}`;
      const filePath = vaultPath("Soul", "Working-Philosophy.md");
      const existing = await fs.readFile(filePath, "utf8");
      await fs.writeFile(filePath, existing + entry, "utf8");
      return { success: true, logged: decision };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ── Server ───────────────────────────────────────────────────────────────────

const server = new Server(
  { name: "obsidian-bridge", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    const result = await handleTool(name, args || {});
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  } catch (err) {
    return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
