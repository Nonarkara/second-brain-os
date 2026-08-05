// Self-check for braind's decision logic. `node test-braind.mjs`
// The failures these catch are the quiet kind: a capture silently
// dropped at a timestamp boundary, a pulse written twice, content
// leaking into the public status.
import assert from "node:assert";
import {
  bkkDate, mergeCaptures, captureBlock, planPulse, buildStatus,
  pulseNoteHeader, cleanSynthesis,
} from "./braind-lib.mjs";

// ── mergeCaptures: the watermark boundary ─────────────────────
{
  const t = "2026-08-05T10:00:00Z";
  const state = { lastCaptureTs: t, seenIds: ["a"] };
  // Two captures share the watermark timestamp; one is already seen.
  const pulled = [
    { id: "a", created_at: t, text: "old" },
    { id: "b", created_at: t, text: "boundary twin" },
    { id: "c", created_at: "2026-08-05T11:00:00Z", text: "new" },
  ];
  const { fresh, watermark, seenIds } = mergeCaptures(state, pulled);
  assert.deepEqual(fresh.map(c => c.id), ["b", "c"], "boundary twin must not be dropped, seen must not repeat");
  assert.equal(watermark, "2026-08-05T11:00:00Z");
  assert(seenIds.includes("a") && seenIds.includes("b") && seenIds.includes("c"));
}

// ── mergeCaptures: replay of the same page is a no-op ─────────
{
  const pulled = [{ id: "x", created_at: "2026-01-01T00:00:00Z", text: "hi" }];
  const s1 = mergeCaptures({ seenIds: [] }, pulled);
  const s2 = mergeCaptures({ seenIds: s1.seenIds, lastCaptureTs: s1.watermark }, pulled);
  assert.equal(s2.fresh.length, 0, "same page pulled twice must add nothing");
}

// ── mergeCaptures: id ring stays bounded ──────────────────────
{
  const pulled = Array.from({ length: 600 }, (_, i) => ({ id: `n${i}`, created_at: "2026-01-01T00:00:00Z" }));
  const { seenIds } = mergeCaptures({ seenIds: [] }, pulled);
  assert.equal(seenIds.length, 500, "ring must cap at 500");
  assert(seenIds.includes("n599") && !seenIds.includes("n0"), "ring keeps the newest");
}

// ── planPulse: the four worlds ────────────────────────────────
{
  const p = (o) => planPulse(o);
  assert.deepEqual(p({ online: true, todayPulseExists: false, ollamaUp: true }),
    { transfer: true, index: true, synthesize: true, mode: "transfer+compute" });
  assert.deepEqual(p({ online: false, todayPulseExists: false, ollamaUp: true }),
    { transfer: false, index: true, synthesize: true, mode: "compute" },
    "offline must still compute — that is the whole point");
  assert.equal(p({ online: true, todayPulseExists: true, ollamaUp: true }).synthesize, false,
    "one pulse note per day, ever");
  assert.equal(p({ online: false, todayPulseExists: false, ollamaUp: false }).synthesize, false,
    "no model, no synthesis — but index still runs");
}

// ── buildStatus: counts only, never content ───────────────────
{
  const status = buildStatus({
    plan: { mode: "compute" },
    audit: { documents: 483, chunks: 3513, missing_embeddings: 0 },
    state: { pulseCount: 7, lastPulseDate: "2026-08-05" },
    capturesPulled: 2,
  });
  assert.deepEqual(Object.keys(status).sort(),
    ["capturesPulled", "chunks", "documents", "indexFresh", "lastPulseNote", "mode", "pulses"].sort());
  for (const v of Object.values(status)) {
    assert(typeof v !== "string" || v.length <= 40, "no long strings can ride out on the status");
  }
  assert.equal(status.indexFresh, true);
}

// ── captureBlock: tags, no tags, hostile text survives ────────
{
  const b = captureBlock({ created_at: "2026-08-05T10:30:00Z", source: "line", tags: ["city", "idea"], text: "  keep me  " });
  assert(b.includes("#city #idea") && b.includes("keep me") && b.includes("2026-08-05 10:30"));
  const plain = captureBlock({ text: "no meta at all" });
  assert(plain.includes("no meta at all") && plain.includes("note"));
}

// ── pulse note: header is a candidate, dated, sourced ─────────
{
  const h = pulseNoteHeader("2026-08-05");
  assert(h.includes("status: candidate") && h.includes("date: 2026-08-05") && h.includes("source: braind"));
}

// ── cleanSynthesis strips model reflexes ──────────────────────
{
  const raw = "Here's your pulse note:\n\n**What changed** is that ####### nothing\n\n\n\nmoved.";
  const c = cleanSynthesis(raw);
  assert(!c.startsWith("Here"), "preamble must go");
  assert(!c.includes("**"), "bold must go");
  assert(!c.includes("\n\n\n"), "blank-line runs must collapse");
}

// ── bkkDate shape ─────────────────────────────────────────────
assert(/^\d{4}-\d{2}-\d{2}$/.test(bkkDate()), "en-CA formatter must yield ISO date");

console.log("braind: all checks passed");
