#!/usr/bin/env node
/**
 * Nightly vault maintenance. One machine should run this. A second machine
 * that also commits the vault will fight the writer.
 *
 *   OBSIDIAN_VAULT=/path/to/vault node scripts/vault-maintenance.mjs
 *
 * Steps: redact → archive old sessions → trim error floods → refresh Today.md
 *        → daily note stub → cull aged extra bridges → brain index + eval
 *        → heartbeat → doctor → git ship (only if this directory is its own git root)
 *
 * OBSIDIAN_MAINTENANCE_SHIP=0 skips the commit. Ship is also skipped when the
 * doctor finds secrets, or when the vault is only a folder inside another repo.
 * OBSIDIAN_BRAIN_CLI overrides the brain.py path. Default: ../mcp/obsidian-memory/brain.py
 * next to this repo, then $OBSIDIAN_VAULT/.mcp/obsidian-memory/brain.py.
 * OBSIDIAN_TIME_ZONE defaults to Asia/Bangkok.
 */
import fs from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const home = process.env.HOME || "";
const fallback = home ? path.join(home, "Documents/SecondBrain") : "";
const VAULT = path.resolve(process.env.OBSIDIAN_VAULT || fallback);
const HOT_DAYS = 14;
const TIME_ZONE = (() => {
  const requested = (process.env.OBSIDIAN_TIME_ZONE || "Asia/Bangkok").trim() || "Asia/Bangkok";
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: requested }).format(new Date());
    return requested;
  } catch {
    return "Asia/Bangkok";
  }
})();

const SECRET_PATTERNS = [
  [/AIza[0-9A-Za-z_-]{35}/g, "AIza[REDACTED]"],
  [/nvapi-[A-Za-z0-9_-]{20,}/g, "nvapi-[REDACTED]"],
  [/\d{8,12}:AA[A-Za-z0-9_-]{30,}/g, "[TELEGRAM_TOKEN_REDACTED]"],
  [/sk-ant-[A-Za-z0-9_-]{20,}/g, "sk-ant-[REDACTED]"],
  [/sk-or-v1-[a-f0-9]{20,}/g, "sk-or-v1-[REDACTED]"],
  [/sk-proj-[A-Za-z0-9_-]{20,}/g, "sk-proj-[REDACTED]"],
  [/sk-[A-Za-z0-9]{40,}/g, "sk-[REDACTED]"],
  [/AQ\.[A-Za-z0-9_-]{40,}/g, "AQ.[REDACTED]"],
  [/cfoat_[A-Za-z0-9_.-]{40,}/g, "cfoat_[REDACTED]"],
  [/gsk_[A-Za-z0-9]{40,}/g, "gsk_[REDACTED]"],
  [/ghp_[A-Za-z0-9_-]{20,}/g, "ghp_[REDACTED]"],
  [/github_pat_[A-Za-z0-9_-]{20,}/g, "github_pat_[REDACTED]"],
  [/AKIA[0-9A-Z]{16}/g, "AKIA[REDACTED]"],
  [/xox[baprs]-[0-9A-Za-z-]{10,}/g, "xox-[REDACTED]"],
  [/eyJhbGciOiJ[A-Za-z0-9_.-]{60,}/g, "[JWT_REDACTED]"]
];

function stamp() {
  const local = new Date().toLocaleString("sv-SE", { timeZone: TIME_ZONE }).replace(" ", "T");
  return `${local} ${TIME_ZONE}`;
}

function today() {
  return stamp().slice(0, 10);
}

function resolveExisting(candidates) {
  return candidates.find(candidate => candidate && existsSync(candidate)) || candidates.find(Boolean) || "";
}

function brainCli() {
  if (process.env.OBSIDIAN_BRAIN_CLI) return process.env.OBSIDIAN_BRAIN_CLI;
  return resolveExisting([
    path.resolve(SCRIPT_DIR, "../mcp/obsidian-memory/brain.py"),
    path.join(VAULT, ".mcp/obsidian-memory/brain.py")
  ]);
}

async function* walkMd(dir) {
  let entries;
  try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return; }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if ([".git", ".obsidian", "node_modules", ".claude", ".trash"].includes(entry.name)) continue;
      yield* walkMd(full);
    } else if (entry.name.endsWith(".md")) yield full;
  }
}

async function redactSweep() {
  let hits = 0;
  for await (const filePath of walkMd(VAULT)) {
    const rel = path.relative(VAULT, filePath);
    if (rel.startsWith("Vitals/Credentials") || rel.startsWith("Memory/Archive")) continue;
    const text = await fs.readFile(filePath, "utf8").catch(() => null);
    if (text === null) continue;
    let out = text;
    for (const [pattern, replacement] of SECRET_PATTERNS) out = out.replace(pattern, replacement);
    if (out !== text) {
      await fs.writeFile(filePath, out, "utf8");
      hits += 1;
      console.log(`REDACTED (capture missed this — investigate the writer): ${rel}`);
    }
  }
  return hits;
}

async function archiveSessions() {
  const hot = path.join(VAULT, "Memory/Sessions");
  const cold = path.join(VAULT, "Memory/Archive/Sessions");
  await fs.mkdir(cold, { recursive: true });
  const cutoff = new Date(Date.now() - HOT_DAYS * 864e5).toISOString().slice(0, 10);
  let moved = 0;
  for (const file of await fs.readdir(hot).catch(() => [])) {
    if (!/^\d{4}-\d{2}-\d{2}.*\.md$/.test(file)) continue;
    if (file.slice(0, 10) < cutoff) {
      await fs.rename(path.join(hot, file), path.join(cold, file));
      moved += 1;
    }
  }
  return moved;
}

async function trimFloods() {
  let trimmed = 0;
  for await (const filePath of walkMd(VAULT)) {
    if (path.relative(VAULT, filePath).startsWith("Memory/Archive")) continue;
    const { size } = await fs.stat(filePath);
    if (size < 1_000_000) continue;
    const lines = (await fs.readFile(filePath, "utf8")).split("\n");
    const seen = new Map();
    const out = lines.filter(line => {
      if (!/Error calling LLM|NotFoundError|RateLimitError/.test(line)) return true;
      const key = line.replace(/^\*\*[\d:· ]+[^:]*:\*\*\s*/, "");
      const count = (seen.get(key) || 0) + 1;
      seen.set(key, count);
      return count <= 3;
    });
    if (out.length < lines.length) {
      out.push("", `> [vault-maintenance ${today()}] ${lines.length - out.length} repeated error lines removed.`, "");
      await fs.writeFile(filePath, out.join("\n"), "utf8");
      trimmed += 1;
    }
  }
  return trimmed;
}

async function refreshDaily() {
  const generator = path.join(SCRIPT_DIR, "generate-today.mjs");
  spawnSync(process.execPath, [generator], {
    cwd: VAULT,
    env: { ...process.env, OBSIDIAN_VAULT: VAULT, OBSIDIAN_TIME_ZONE: TIME_ZONE },
    stdio: "inherit"
  });
  const dailyDir = path.join(VAULT, "Memory/Daily");
  await fs.mkdir(dailyDir, { recursive: true });
  const daily = path.join(dailyDir, `${today()}.md`);
  try {
    await fs.access(daily);
  } catch {
    await fs.writeFile(daily, `---
date: ${today()}
type: daily
tags: [daily]
---
# ${today()}

## Morning Briefing
*Auto-created by vault-maintenance.*

## Captured Topics
*No new captures.*
`, "utf8");
  }
}

async function appendHeartbeat(line) {
  const dir = path.join(VAULT, "Vitals/System");
  await fs.mkdir(dir, { recursive: true });
  await fs.appendFile(path.join(dir, "heartbeat.log"), line);
}

function runBrain(args) {
  const python = process.env.OBSIDIAN_PYTHON || "python3";
  const cli = brainCli();
  return spawnSync(python, [cli, ...args], {
    cwd: VAULT,
    encoding: "utf8",
    env: { ...process.env, OBSIDIAN_VAULT: VAULT, OBSIDIAN_TIME_ZONE: TIME_ZONE }
  });
}

function gitShip() {
  if (process.env.OBSIDIAN_MAINTENANCE_SHIP === "0") {
    console.log("git ship skipped (OBSIDIAN_MAINTENANCE_SHIP=0)");
    return;
  }
  const top = spawnSync("git", ["-C", VAULT, "rev-parse", "--show-toplevel"], { encoding: "utf8" });
  if (top.status !== 0) {
    console.log("git ship skipped (vault is not a git checkout)");
    return;
  }
  if (path.resolve(top.stdout.trim()) !== path.resolve(VAULT)) {
    console.log("git ship skipped (vault is inside another repository; refusing to commit the parent)");
    return;
  }
  spawnSync("git", ["-C", VAULT, "add", "-A"], { stdio: "inherit" });
  const cached = spawnSync("git", ["-C", VAULT, "diff", "--cached", "--quiet"]);
  if (cached.status === 0) {
    console.log("git ship: nothing staged");
    return;
  }
  const commit = spawnSync("git", ["-C", VAULT, "commit", "-m", `chore: nightly vault-maintenance ${today()}`, "-q"]);
  if (commit.status !== 0) {
    console.error("git commit failed");
    return;
  }
  const push = spawnSync("git", ["-C", VAULT, "push", "-q"]);
  if (push.status !== 0) {
    console.error("git push failed. The writer machine needs an upstream. Do not enable this job on a second machine.");
  }
}

async function main() {
  if (!VAULT || VAULT === path.resolve("/")) {
    console.error("Set OBSIDIAN_VAULT to the vault this machine maintains.");
    process.exit(2);
  }
  const redacted = await redactSweep();
  const archived = await archiveSessions();
  const trimmed = await trimFloods();
  await refreshDaily();

  const cull = spawnSync("bash", [path.join(SCRIPT_DIR, "cull-orphan-mcp-bridges.sh")], {
    encoding: "utf8",
    env: process.env
  });
  if (cull.stdout) process.stdout.write(cull.stdout);

  const indexed = runBrain(["index", "--json"]);
  if (indexed.status !== 0) {
    await appendHeartbeat(`${stamp()} brain index soft-fail: ${(indexed.stderr || indexed.stdout || "missing brain.py").slice(0, 180)}\n`);
  }
  const evaluated = runBrain(["eval", "--json"]);
  if (evaluated.status !== 0) {
    await appendHeartbeat(`${stamp()} brain eval soft-fail: ${(evaluated.stderr || evaluated.stdout || "").slice(0, 240)}\n`);
  }

  await appendHeartbeat(`${stamp()} vault-maintenance ok — redacted:${redacted} archived:${archived} trimmed:${trimmed}\n`);

  const doctor = spawnSync(process.execPath, [path.join(SCRIPT_DIR, "secondbrain-doctor.mjs"), VAULT], {
    encoding: "utf8",
    env: { ...process.env, OBSIDIAN_VAULT: VAULT }
  });
  const report = `${doctor.stdout || ""}${doctor.stderr || ""}`;
  const doctorDir = path.join(VAULT, "Vitals/System");
  await fs.mkdir(doctorDir, { recursive: true });
  await fs.writeFile(path.join(doctorDir, "last-doctor.md"), `# Doctor — ${stamp()}\n\n\`\`\`\n${report}\n\`\`\`\n`, "utf8");
  if (doctor.status !== 0) {
    await appendHeartbeat(`${stamp()} DOCTOR FAILED status=${doctor.status}\n`);
    console.error("doctor failed; git ship skipped");
    console.log(`done — redacted:${redacted} archived:${archived} trimmed:${trimmed}`);
    process.exit(doctor.status || 1);
  }

  gitShip();
  console.log(`done — redacted:${redacted} archived:${archived} trimmed:${trimmed}`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
