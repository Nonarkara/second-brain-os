import fs from "fs";
import path from "path";

/**
 * The public repo ships the bridge at mcp/obsidian-bridge and the CLI at
 * mcp/obsidian-memory. A vault that copied both under .mcp/ has the same
 * sibling relationship. Either layout works. OBSIDIAN_BRAIN_CLI wins if set.
 * Forks do not need a second copy of the bridge inside the vault.
 */

export function timeZone(env = process.env) {
  const requested = (env.OBSIDIAN_TIME_ZONE || "Asia/Bangkok").trim() || "Asia/Bangkok";
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: requested }).format(new Date());
    return requested;
  } catch {
    return "Asia/Bangkok";
  }
}

function firstExisting(candidates) {
  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) return candidate;
  }
  return candidates.find(Boolean) || "";
}

export function resolveBrainCli({ scriptDir, vault = "", env = process.env }) {
  if (env.OBSIDIAN_BRAIN_CLI) return env.OBSIDIAN_BRAIN_CLI;
  return firstExisting([
    path.resolve(scriptDir, "../obsidian-memory/brain.py"),
    vault ? path.join(vault, ".mcp/obsidian-memory/brain.py") : ""
  ]);
}

export function resolveGenerateToday({ scriptDir, vault = "", env = process.env }) {
  if (env.OBSIDIAN_GENERATE_TODAY) return env.OBSIDIAN_GENERATE_TODAY;
  return firstExisting([
    path.resolve(scriptDir, "../../scripts/generate-today.mjs"),
    vault ? path.join(vault, "Reflexes/Scripts/generate-today.mjs") : ""
  ]);
}

export function resolveBridgeIndex({ scriptDir, env = process.env }) {
  if (env.OBSIDIAN_BRIDGE_INDEX) return env.OBSIDIAN_BRIDGE_INDEX;
  return path.join(scriptDir, "index.js");
}
