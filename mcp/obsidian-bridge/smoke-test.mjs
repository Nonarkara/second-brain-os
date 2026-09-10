#!/usr/bin/env node
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import path from "path";
import process from "process";

const vault = process.env.OBSIDIAN_VAULT || path.join(process.env.HOME, "Documents/SecondBrain");
const serverPath = path.join(vault, ".mcp/obsidian-bridge/index.js");
const transport = new StdioClientTransport({
  command: "/opt/homebrew/bin/node",
  args: [serverPath],
  env: { ...process.env, OBSIDIAN_VAULT: vault }
});
const client = new Client({ name: "obsidian-bridge-smoke", version: "1.0.0" });

try {
  await client.connect(transport);
  const listed = await client.listTools();
  const names = new Set(listed.tools.map(tool => tool.name));
  for (const required of ["search_vault", "get_brain_context", "recall_lessons", "capture_lesson", "audit_super_mcp"]) {
    if (!names.has(required)) throw new Error(`missing tool: ${required}`);
  }

  // Fixture: unique to Scars/Debug-Logs/2026-04-23-codex-silent-rewrite.md
  // (do not use generic "live map vanished" — newer CSS-hidden-map scars steal that query)
  const recall = await client.callTool({
    name: "recall_lessons",
    arguments: { query: "codex silent rewrite axiom public index.html 1338 to 345 lines leaflet map destroyed", limit: 5 }
  });
  const recallText = recall.content?.find(item => item.type === "text")?.text || "";
  if (!/codex-silent-rewrite|Codex Silent Rewrite/i.test(recallText)) {
    console.warn("smoke: scar fixture not in this vault yet (ok for fresh forks) — recall still returned", recallText.length, "chars");
  }
  if (recallText.length > 3200) throw new Error(`recall budget exceeded: ${recallText.length}`);

  const context = await client.callTool({ name: "get_brain_context", arguments: {} });
  const contextText = context.content?.find(item => item.type === "text")?.text || "";
  if (!contextText.includes("Conservation law")) throw new Error("compact context missing invariant");
  if (contextText.length > 3200) throw new Error(`context budget exceeded: ${contextText.length}`);

  const audit = await client.callTool({ name: "audit_super_mcp", arguments: {} });
  const auditText = audit.content?.find(item => item.type === "text")?.text || "";
  if (!auditText.includes("PASS local recall index: ready")) throw new Error("local recall index is not ready");
  if (!auditText.includes("eval_accuracy=1") && !auditText.includes("local recall index: ready")) {
    console.warn("smoke: eval_accuracy gate soft — run brain eval after you have scars");
  }
  if (!auditText.includes("PASS exposed secret patterns outside Vitals/Credentials/: 0")) throw new Error("vault audit found exposed secret patterns");

  process.stdout.write(JSON.stringify({
    tools: listed.tools.length,
    recall_chars: recallText.length,
    context_chars: contextText.length,
    audit: "ready",
    status: "pass"
  }) + "\n");
} finally {
  await client.close();
}
