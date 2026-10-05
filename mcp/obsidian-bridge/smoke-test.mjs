#!/usr/bin/env node
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import path from "path";
import process from "process";
import { fileURLToPath } from "url";
import { resolveBridgeIndex } from "./paths.mjs";

const vault = process.env.OBSIDIAN_VAULT || path.join(process.env.HOME || "", "Documents/SecondBrain");
const here = path.dirname(fileURLToPath(import.meta.url));
const serverPath = resolveBridgeIndex({ scriptDir: here });
const transport = new StdioClientTransport({
  command: process.execPath,
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

  const recall = await client.callTool({
    name: "recall_lessons",
    arguments: { query: "coding lesson filesystem bridge", limit: 3 }
  });
  const recallText = recall.content?.find(item => item.type === "text")?.text || "";
  if (recall.isError || recallText.startsWith("Error:")) {
    throw new Error(`recall_lessons failed: ${recallText.slice(0, 400)}`);
  }
  if (recallText.length > 3200) throw new Error(`recall budget exceeded: ${recallText.length}`);

  const context = await client.callTool({ name: "get_brain_context", arguments: {} });
  const contextText = context.content?.find(item => item.type === "text")?.text || "";
  if (context.isError) throw new Error(`get_brain_context failed: ${contextText.slice(0, 400)}`);
  if (!contextText.includes("Conservation law")) throw new Error("compact context missing invariant");
  if (contextText.length > 3200) throw new Error(`context budget exceeded: ${contextText.length}`);

  const audit = await client.callTool({ name: "audit_super_mcp", arguments: {} });
  const auditText = audit.content?.find(item => item.type === "text")?.text || "";
  if (audit.isError) throw new Error(`audit_super_mcp failed: ${auditText.slice(0, 400)}`);
  if (!auditText.includes("PASS local recall index: ready")) {
    throw new Error(
      "local recall index is not ready. From the repo root: python3 mcp/obsidian-memory/brain.py index --json\n"
      + auditText.slice(0, 500)
    );
  }
  if (!auditText.includes("eval_accuracy=1")) {
    console.warn("smoke: eval suite is not 20/20 yet — build cases from your own notes, then brain eval");
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
