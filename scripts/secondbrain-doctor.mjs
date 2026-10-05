#!/usr/bin/env node
/**
 * Read-only vault health scan.
 *
 *   OBSIDIAN_VAULT=/path/to/vault node scripts/secondbrain-doctor.mjs
 *   node scripts/secondbrain-doctor.mjs /path/to/vault
 *
 * Exit 1 when a secret-like pattern is found outside Vitals/Credentials/.
 * The report names the file and the pattern, not the matched text.
 */
import fs from "fs/promises";
import path from "path";
import process from "process";

const home = process.env.HOME || "";
const fallback = home ? path.join(home, "Documents/SecondBrain") : "";
const VAULT = path.resolve(process.argv[2] || process.env.OBSIDIAN_VAULT || fallback);
if (!VAULT || VAULT === path.resolve("/")) {
  process.stderr.write("Set OBSIDIAN_VAULT or pass the vault path.\n");
  process.exit(2);
}

const SKIP_DIRS = new Set([".git", ".obsidian", ".trash", "node_modules", ".cache", ".claude"]);
const SKIP_FOR_LINKS = ["Reflexes/Templates"];
const DURABLE_SKIP = ["Memory/Sessions", "Memory/Transcripts", "Memory/Archive", "Senses/Inbox", "Vitals/Credentials"];
const SECRET_SAFE = ["Vitals/Credentials"];
const SECRET_PATTERNS = [
  ["nvapi", /nvapi-[A-Za-z0-9_-]{20,}/g],
  ["github_pat", /github_pat_[A-Za-z0-9_-]{20,}/g],
  ["ghp", /ghp_[A-Za-z0-9_-]{20,}/g],
  ["sk-or", /sk-or-v1-[a-f0-9]{20,}/g],
  ["sk-proj", /sk-proj-[A-Za-z0-9_-]{20,}/g],
  ["sk", /sk-[A-Za-z0-9]{40,}/g],
  ["google_api", /AIza[0-9A-Za-z_-]{35}/g],
  ["fc", /fc-[a-f0-9]{20,}/g],
  ["tavily", /tvly-(?:dev-)?[A-Za-z0-9_-]{20,}/g],
  ["wandb", /wandb_v1_[A-Za-z0-9_-]{30,}/g],
  ["discord", /MT[A-Za-z0-9]{20,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{20,}/g],
  ["slack", /xox[baprs]-[0-9A-Za-z-]{10,}/g],
  ["aws_access_key", /AKIA[0-9A-Z]{16}/g],
  ["telegram_token", /\b\d{8,12}:[A-Za-z0-9_-]{35,}\b/g]
];

function relUnix(fullPath) {
  return path.relative(VAULT, fullPath).split(path.sep).join("/");
}

function startsWithAny(rel, prefixes) {
  return prefixes.some(prefix => rel === prefix || rel.startsWith(`${prefix}/`));
}

async function readText(rel) {
  return fs.readFile(path.join(VAULT, rel), "utf8").catch(() => "");
}

async function listFiles({ markdownOnly = false } = {}) {
  const files = [];
  async function walk(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (SKIP_DIRS.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile() && (!markdownOnly || entry.name.endsWith(".md"))) files.push(relUnix(full));
    }
  }
  await walk(VAULT);
  return files.sort();
}

function frontmatterBody(text) {
  const match = text.match(/^---\n([\s\S]*?)\n---\n?/);
  return match ? match[1] : "";
}

function cleanWikiTarget(raw) {
  return raw.replace(/\\\|/g, "|").split("|")[0].split("#")[0].trim().replace(/\.md$/i, "");
}

function section(title, rows, limit = 12) {
  const visible = rows.slice(0, limit).map(row => `- ${row}`);
  const more = rows.length > limit ? [`- ... ${rows.length - limit} more`] : [];
  return [`## ${title}: ${rows.length}`, ...visible, ...more].join("\n");
}

async function heartbeatStatus() {
  for (const rel of ["Vitals/System/heartbeat.log", "heartbeat.log"]) {
    const stat = await fs.stat(path.join(VAULT, rel)).catch(() => null);
    if (stat) {
      const ageMinutes = Math.round((Date.now() - stat.mtimeMs) / 60000);
      return `${rel}, ${ageMinutes} min old`;
    }
  }
  return "missing";
}

async function main() {
  const allFiles = await listFiles();
  const mdFiles = allFiles.filter(file => file.endsWith(".md"));
  const known = new Set();
  for (const rel of allFiles) {
    const withoutExt = rel.replace(/\.[^/.]+$/, "");
    known.add(withoutExt.toLowerCase());
    known.add(path.basename(withoutExt).toLowerCase());
  }

  const brokenLinks = [];
  const missingFrontmatter = [];
  const missingTags = [];
  const secrets = [];

  for (const rel of mdFiles) {
    const text = await readText(rel);
    const fm = frontmatterBody(text);
    const isDurable = !startsWithAny(rel, DURABLE_SKIP);
    if (isDurable && !fm) missingFrontmatter.push(rel);
    if (isDurable && fm && !/^tags:\s*/m.test(fm)) missingTags.push(rel);

    if (!startsWithAny(rel, SECRET_SAFE)) {
      for (const [name, pattern] of SECRET_PATTERNS) {
        pattern.lastIndex = 0;
        if (pattern.test(text)) secrets.push(`${rel} -> ${name}`);
      }
    }

    if (startsWithAny(rel, SKIP_FOR_LINKS)) continue;
    let linkText = text;
    const fmMatch = linkText.match(/^---\n([\s\S]*?)\n---\n?/);
    if (fmMatch) linkText = linkText.slice(fmMatch[0].length);
    linkText = linkText.replace(/```[\s\S]*?```/g, "").replace(/`[^`]+`/g, "");
    for (const match of linkText.matchAll(/\[\[([^\]]+)\]\]/g)) {
      const target = cleanWikiTarget(match[1]);
      if (!target || target.startsWith("http") || target.includes("{{")) continue;
      const key = target.toLowerCase();
      const base = path.basename(target).toLowerCase();
      if (!known.has(key) && !known.has(base)) brokenLinks.push(`${rel} -> [[${target}]]`);
    }
  }

  const lines = [
    "# SecondBrain Doctor",
    `Markdown files scanned: ${mdFiles.length}`,
    "",
    section("Exposed secret patterns outside Vitals/Credentials", secrets),
    "",
    section("Broken wikilinks", brokenLinks, 20),
    "",
    section("Durable notes missing frontmatter", missingFrontmatter),
    "",
    section("Durable notes missing tags", missingTags),
    "",
    "## Heartbeat",
    `- ${await heartbeatStatus()}`,
    "",
    secrets.length
      ? "Verdict: secrets found. Rotate them and remove them from tracked notes. Maintenance will not git-ship this vault."
      : "Verdict: no exposed secret patterns found."
  ];
  process.stdout.write(`${lines.join("\n")}\n`);
  process.exit(secrets.length ? 1 : 0);
}

main().catch(error => {
  process.stderr.write(`secondbrain-doctor failed: ${error.message}\n`);
  process.exit(2);
});
