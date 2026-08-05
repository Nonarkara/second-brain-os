/**
 * braind — pure logic, no I/O.
 *
 * Everything here is a plain function so test-braind.mjs can break it
 * without touching the vault, the network, or a model. braind.mjs owns
 * the side effects; this file owns the decisions.
 */

/** Bangkok calendar date for a timestamp — pulses are daily in HIS day, not UTC's. */
export function bkkDate(ts = Date.now()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date(ts));
}

/**
 * Merge freshly pulled captures into state. Returns the new watermark,
 * the ids to remember, and only the captures never seen before.
 *
 * The watermark alone is not enough: two captures can share a
 * created_at, and a re-pull with `gt.` on that boundary would either
 * drop one or repeat one depending on which side you err. The id ring
 * absorbs the boundary; the watermark does the heavy lifting.
 */
export function mergeCaptures(state, pulled) {
  const seen = new Set(state.seenIds || []);
  const fresh = [];
  let watermark = state.lastCaptureTs || "1970-01-01T00:00:00Z";
  for (const c of pulled) {
    if (!c || !c.id || seen.has(String(c.id))) continue;
    seen.add(String(c.id));
    fresh.push(c);
    if (c.created_at && c.created_at > watermark) watermark = c.created_at;
  }
  // Ring: keep the newest 500 ids. Old ids are safely behind the watermark.
  const seenIds = [...seen].slice(-500);
  return { fresh, watermark, seenIds };
}

/** One capture → one markdown block for the inbox file. */
export function captureBlock(c) {
  const when = (c.created_at || "").replace("T", " ").slice(0, 16);
  const tags = Array.isArray(c.tags) && c.tags.length ? " " + c.tags.map(t => `#${t}`).join(" ") : "";
  const text = String(c.text || "").trim();
  return `\n---\n**${when}** · ${c.source || "note"}${tags}\n\n${text}\n`;
}

/**
 * Decide what this pulse should do. Small on purpose — this is the
 * daemon's whole personality:
 *   online  → transfer, then compute
 *   offline → compute harder (the synthesis license is the same; the
 *             difference is transfer is skipped, so there is more
 *             time budget for the model)
 */
export function planPulse({ online, todayPulseExists, ollamaUp }) {
  return {
    transfer: online,
    index: true,
    synthesize: !todayPulseExists && ollamaUp,
    mode: online ? "transfer+compute" : "compute",
  };
}

/** The status the daemon reports. Counts and dates only — never content. */
export function buildStatus({ plan, audit, state, capturesPulled }) {
  return {
    mode: plan.mode,
    documents: audit?.documents ?? null,
    chunks: audit?.chunks ?? null,
    pulses: state.pulseCount || 0,
    capturesPulled,
    lastPulseNote: state.lastPulseDate || null,
    indexFresh: audit?.missing_embeddings === 0,
  };
}

/** Frontmatter + skeleton for the daily pulse note. */
export function pulseNoteHeader(date) {
  return `---
type: pulse
status: candidate
date: ${date}
source: braind
---

# Pulse · ${date}

*Written by the resident brain worker. A candidate, not a verified
lesson — it suggests, the human decides.*

`;
}

/**
 * Strip a model's markdown reflexes down to vault-clean prose.
 * Same lesson as the podcast pipeline: strip once, never re-prompt.
 */
export function cleanSynthesis(s) {
  return String(s || "")
    .replace(/^\s*(here'?s|here is|okay,?|sure,?)[^\n]*\n+/i, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/^#{4,6}\s*/gm, "### ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
