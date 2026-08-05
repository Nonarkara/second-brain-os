#!/usr/bin/env node
/**
 * braind — the second brain, resident on this laptop.
 *
 *   node braind.mjs           # one pulse (launchd runs this every 15 min)
 *   node braind.mjs --status  # print the last status and exit
 *
 * The contract, in the owner's words: when it's connected to the
 * internet it TRANSFERS — captures come down into the vault, snapshots
 * of the world (fleet incidents, markets) are cached, vital signs go up
 * to the site. When it's not connected it COMPUTES — the index stays
 * warm and once a day a local model reads what's new and writes a Pulse
 * note: what changed, what connects, what needs a decision. Either way
 * it is always working, and every pulse leaves the vault slightly
 * better organized than it found it.
 *
 * What it deliberately is NOT:
 *   - not an indexer (brain CLI already owns that, hybrid FTS5+vectors)
 *   - not a capture tool (the site, bots and MCP already capture)
 *   - not autonomous memory: everything it writes is frontmatter-marked
 *     `status: candidate`. The vault law stands — candidates do not
 *     guide work until a human promotes them.
 *
 * One pulse and exit. No long-running process to babysit; launchd is
 * the heartbeat, this file is one beat.
 */
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  bkkDate, mergeCaptures, captureBlock, planPulse, buildStatus,
  pulseNoteHeader, cleanSynthesis,
} from "./braind-lib.mjs";

const run = promisify(execFile);

const VAULT = process.env.OBSIDIAN_VAULT || path.join(os.homedir(), "Documents", "SecondBrain");
const CACHE = path.join(VAULT, ".mcp", "cache", "braind");
const STATE_FILE = path.join(CACHE, "state.json");
const API = process.env.BRAIN_API || "https://api.nonarkara.org";
const BRAIN_BIN = process.env.BRAIN_BIN || path.join(os.homedir(), ".local", "bin", "brain");
const OLLAMA = process.env.OLLAMA_URL || "http://127.0.0.1:11434";
// Same ladder as the podcast: the 31GB brain first, the small one after.
const MODELS = (process.env.BRAIND_MODELS || "glm-4.7-flash:q8_0,gemma4:12b-it-qat").split(",");

// BRAIND_KEY comes from the axiom-ops .env by way of run-pulse.sh, or
// the environment directly. Without it the daemon still computes — it
// just cannot transfer. Offline-by-misconfiguration degrades, not dies.
const KEY = process.env.BRAIND_KEY || "";

const log = (m) => process.stderr.write(`${new Date().toISOString().slice(11, 19)} ${m}\n`);

async function loadState() {
  try { return JSON.parse(await fs.readFile(STATE_FILE, "utf8")); }
  catch { return { pulseCount: 0, seenIds: [], lastCaptureTs: null, lastPulseDate: null }; }
}
async function saveState(s) {
  await fs.mkdir(CACHE, { recursive: true });
  await fs.writeFile(STATE_FILE, JSON.stringify(s, null, 2));
}

const fetchJson = async (u, opts = {}, ms = 15_000) => {
  const r = await fetch(u, { ...opts, signal: AbortSignal.timeout(ms) });
  if (!r.ok) throw new Error(`${u.split("?")[0]} → ${r.status}`);
  return r.json();
};

async function isOnline() {
  try { await fetchJson(`${API}/now`, {}, 5_000); return true; }
  catch { return false; }
}

async function ollamaUp() {
  try {
    const r = await fetch(`${OLLAMA}/api/tags`, { signal: AbortSignal.timeout(4_000) });
    return r.ok;
  } catch { return false; }
}

// ── TRANSFER ────────────────────────────────────────────────

async function pullCaptures(state) {
  if (!KEY) { log("transfer: no BRAIND_KEY — skipping captures"); return 0; }
  const since = state.lastCaptureTs || "1970-01-01T00:00:00Z";
  const d = await fetchJson(`${API}/captures?since=${encodeURIComponent(since)}&key=${KEY}`);
  const { fresh, watermark, seenIds } = mergeCaptures(state, d.captures || []);
  if (fresh.length) {
    // One file per month. Append-only: the inbox is a river, the vault
    // regions are where things land after a human reads them.
    const month = bkkDate().slice(0, 7);
    const file = path.join(VAULT, "Senses", "Inbox", `captures-${month}.md`);
    await fs.mkdir(path.dirname(file), { recursive: true });
    let head = "";
    try { await fs.access(file); }
    catch { head = `# Captures · ${month}\n\n*Pulled from the wire by braind. Read, file, delete.*\n`; }
    await fs.appendFile(file, head + fresh.map(captureBlock).join(""));
  }
  state.lastCaptureTs = watermark;
  state.seenIds = seenIds;
  return fresh.length;
}

async function pullSnapshots() {
  // The world, cached for offline thinking. Best-effort each; a missing
  // snapshot just means the next synthesis has one less input.
  const snaps = { incidents: "/incidents", uptime: "/uptime", brief: "/daily-brief" };
  await fs.mkdir(CACHE, { recursive: true });
  for (const [name, p] of Object.entries(snaps)) {
    try {
      const d = await fetchJson(`${API}${p}`);
      await fs.writeFile(path.join(CACHE, `snap-${name}.json`), JSON.stringify({ ts: Date.now(), data: d }));
    } catch (e) { log(`snapshot ${name}: ${e.message}`); }
  }
}

async function pushStatus(status) {
  if (!KEY) return;
  try {
    await fetchJson(`${API}/brain-status?key=${KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(status),
    });
  } catch (e) { log(`push status: ${e.message}`); }
}

// ── COMPUTE ─────────────────────────────────────────────────

async function reindex() {
  try {
    const { stdout } = await run(BRAIN_BIN, ["index"], { timeout: 600_000 });
    const j = JSON.parse(stdout);
    if (j.indexed || j.embedded) log(`index: +${j.indexed ?? 0} docs, +${j.embedded ?? 0} embeddings`);
  } catch (e) { log(`index failed: ${e.message.split("\n")[0]}`); }
  try {
    const { stdout } = await run(BRAIN_BIN, ["audit"], { timeout: 60_000 });
    return JSON.parse(stdout);
  } catch { return null; }
}

async function readIfThere(p, max = 4000) {
  try { return (await fs.readFile(p, "utf8")).slice(0, max); } catch { return ""; }
}

async function gatherSynthesisInput(state) {
  const today = bkkDate(), yesterday = bkkDate(Date.now() - 86_400_000);
  const daily = (d) => path.join(VAULT, "Memory", "Daily", `${d}.md`);
  const month = today.slice(0, 7);
  const parts = [];

  const dToday = await readIfThere(daily(today));
  const dYest = await readIfThere(daily(yesterday));
  if (dToday) parts.push(`## Today's daily note (${today})\n${dToday}`);
  if (dYest) parts.push(`## Yesterday's daily note (${yesterday})\n${dYest}`);

  const inbox = await readIfThere(path.join(VAULT, "Senses", "Inbox", `captures-${month}.md`), 3000);
  if (inbox) parts.push(`## Recent captures (newest at the bottom)\n${inbox.slice(-3000)}`);

  for (const name of ["incidents", "brief"]) {
    const raw = await readIfThere(path.join(CACHE, `snap-${name}.json`), 2500);
    if (!raw) continue;
    try {
      const { ts, data } = JSON.parse(raw);
      const ageH = Math.round((Date.now() - ts) / 3_600_000);
      parts.push(`## Snapshot: ${name} (${ageH}h old)\n${JSON.stringify(data).slice(0, 2000)}`);
    } catch { /* torn write — skip */ }
  }
  return parts.join("\n\n");
}

const SYNTH_PROMPT = `You are the resident brain worker on Dr Non's laptop, writing his daily Pulse note.
Input: his daily notes, fresh captures, and cached snapshots of his systems and markets.
Write in plain, confident prose. Rules:
- Three sections, exactly: "What changed", "What connects", "What needs a decision".
- Ground every claim in the input. If the input is thin, say so in one line and write less — never pad.
- "What connects" is the reason you exist: name links between items a busy person would miss.
- "What needs a decision" is at most three items, each one sentence, each actionable.
- No headings other than the three. No bullet-point spam — prose first, a short list only where it genuinely beats prose.
- Under 350 words. No preamble, no sign-off.`;

async function synthesize(input) {
  for (const model of MODELS) {
    try {
      log(`synthesis: trying ${model}`);
      const d = await fetchJson(`${OLLAMA}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: model.trim(), stream: false,
          think: false, // reasoning models babble their budget away otherwise
          messages: [
            { role: "system", content: SYNTH_PROMPT },
            { role: "user", content: input || "No input today. Say so briefly." },
          ],
          options: { temperature: 0.4, num_predict: 900, num_ctx: 16384 },
        }),
      }, 480_000);
      const text = d.message?.content?.trim();
      if (text && text.length > 80) return { text: cleanSynthesis(text), model: model.trim() };
    } catch (e) { log(`  ${model}: ${e.message.split("\n")[0]}`); }
  }
  return null;
}

async function writePulseNote(state) {
  const today = bkkDate();
  const file = path.join(VAULT, "Senses", "Pulse", `${today}.md`);
  try { await fs.access(file); return false; } catch { /* not yet written */ }

  const input = await gatherSynthesisInput(state);
  const out = await synthesize(input);
  if (!out) { log("synthesis: no model produced a pulse"); return false; }

  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, pulseNoteHeader(today) + out.text +
    `\n\n---\n*model: ${out.model} · local · ${new Date().toISOString()}*\n`);
  state.lastPulseDate = today;
  log(`pulse note written: Senses/Pulse/${today}.md (${out.model})`);
  return true;
}

// ── THE PULSE ───────────────────────────────────────────────

async function pulse() {
  const state = await loadState();
  const [online, llm] = await Promise.all([isOnline(), ollamaUp()]);
  const today = bkkDate();
  const plan = planPulse({
    online,
    todayPulseExists: state.lastPulseDate === today,
    ollamaUp: llm,
  });
  log(`pulse #${state.pulseCount + 1} · ${plan.mode}${llm ? "" : " · no local model"}`);

  let capturesPulled = 0;
  if (plan.transfer) {
    try { capturesPulled = await pullCaptures(state); } catch (e) { log(`captures: ${e.message}`); }
    await pullSnapshots();
    if (capturesPulled) log(`transfer: ${capturesPulled} new capture(s) → Senses/Inbox`);
  }

  const audit = await reindex();
  if (plan.synthesize) await writePulseNote(state);

  state.pulseCount = (state.pulseCount || 0) + 1;
  const status = buildStatus({ plan, audit, state, capturesPulled });
  await fs.writeFile(path.join(CACHE, "status.json"), JSON.stringify({ ts: new Date().toISOString(), ...status }, null, 2));
  if (online) await pushStatus(status);
  await saveState(state);
  log(`done · ${status.documents ?? "?"} docs · ${status.chunks ?? "?"} chunks · pulses ${status.pulses}`);
}

if (process.argv.includes("--status")) {
  fs.readFile(path.join(CACHE, "status.json"), "utf8")
    .then(console.log)
    .catch(() => { console.log('{"mode":"never pulsed"}'); });
} else {
  pulse().catch((e) => { console.error(e.message); process.exit(1); });
}
