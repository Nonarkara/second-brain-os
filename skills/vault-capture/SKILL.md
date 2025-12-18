---
name: vault-capture
description: >-
  Instantly capture the current conversation's key insight, decision, or
  discovery into the Obsidian Second Brain vault inbox. Use after any
  session where something worth remembering was figured out.
  Requires the obsidian-bridge MCP to be connected.
---

# Vault Capture

Distill the most important thing from this conversation and write it to the vault inbox.

## What to capture

Not a summary of the conversation. The one thing that, if forgotten, means this session was wasted.

Pick from:
- A decision made (and why — not just what)
- A pattern discovered (something that will recur)
- A tool or technique that actually worked
- A mistake and what it cost (with the specific fix)
- A connection between two ideas that wasn't obvious before

## Format

Use `mcp__obsidian-bridge__write_inbox` with:

```
title: [specific, searchable, 5–8 words]
content: [2–4 sentences. The decision/discovery + why it matters + what changes because of it.]
source: "claude-code-session"
tags: [relevant topic tags from the vault]
```

## Rules

- One capture per session. If there are two things worth capturing, capture the more important one and mention the second.
- Title must be specific enough to find in search six months from now.
- Content must include the reasoning, not just the conclusion. "Use X" is useless. "Use X because Y failed when Z happened" is the capture.
- No preamble. No "here's what I captured." Just do it.

## After capturing

Confirm with: "Captured: [title]" — nothing more.
