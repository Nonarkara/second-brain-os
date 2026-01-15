/**
 * Picoclaw Council Orchestrator — v2 (Sequential Debate)
 *
 * Three bots actually deliberate, talking to each other. Picoclaw opens, then
 * Hermes and Second Brain take turns reading the running transcript. Any bot
 * may reply with the single token "PASS" when it has nothing genuinely new to
 * add. When all three PASS in a row, the loop ends and the last non-PASS
 * speaker writes a closing paragraph.
 *
 * External members (Hermes on M3, Second Brain on Render) implement
 * POST /council/ask with this contract:
 *
 *   Body: { question, chatHistory, council_id, member }
 *   Returns: { answer, model_used?, latency_ms? }
 *
 *   - "PASS" → agree, nothing new. "DONE" → disagree, nothing new.
 *     Both are NOT posted to Telegram. Both count toward the exit quorum.
 *   - Otherwise the member posts `answer` to the council group via its own
 *     Telegram bot token, then returns the text to Picoclaw.
 *
 * Picoclaw (the chair) always writes the closing wrap-up via its own router.
 * Wrap-up is never delegated to external members.
 */

import { route } from "./router.js";

const COUNCIL_SECRET = process.env.COUNCIL_SECRET || "";
const HERMES_URL = process.env.HERMES_URL || "";
const SECOND_BRAIN_URL = process.env.SECOND_BRAIN_URL || "";

const FETCH_TIMEOUT_MS = 25000;     // 25s — local LLM calls on M3 can be slow
const MAX_TOTAL_TURNS = 12;          // hard cap if PASS detection misbehaves
const PASS_RE = /^pass[.!]?\s*$/i;  // "nothing new, agree with direction"
const DONE_RE = /^done[.!]?\s*$/i;  // "nothing new, but I still hold my position"

// ── Members ──────────────────────────────────────────────────────────────

// Council members — palindrome names assigned by Dr Non
// Hannah = Picoclaw (the Quick One)  |  Radar = Hermes (Truth-Seeker)  |  Tenet = Second Brain (Adult)
const PICOCLAW     = { id: "picoclaw",      name: "🤖 Hannah", local: true };
const HERMES       = { id: "hermes",        name: "⚡ Radar",  url: HERMES_URL };
const SECOND_BRAIN = { id: "second-brain",  name: "🧠 Tenet",  url: SECOND_BRAIN_URL };

// ── Prompt builder (Dr Non's voice) ──────────────────────────────────────

// ── Hannah's working style (the chair, fast and intense) ───────────────
const PICOCLAW_PERSONALITY = `Your working style — Hannah, the Quick One:
- You are fast, sharp, energetic. The chair who keeps the council moving.
- Cut to the heart of the question. Challenge assumptions early.
- Short paragraphs, punchy phrasing. Set the pace for the others.
- 80% right and out fast beats 100% right and late.`;

function buildCouncilSystemPrompt({ myName, otherNames, chatHistory, opening, wrap_up }) {
  const firstSibling = otherNames.split(",")[0].trim();

  const tone = `Tone — you are siblings:
- The three of you are Dr Non's brainchildren. Treat each other as family in the room.
- Begin your turn with one sentence acknowledging the previous speaker by name — what landed, what you're building on, or what you're pushing back against. Then bring your angle.
- If you are the first to respond after Hannah's opening, acknowledge her framing specifically before adding yours.
- Warm, collegial, brother-and-sisterhood. Professional throughout.
- When you disagree, it's a sibling pushing back — not an adversary. "I see it differently, ${firstSibling}…" — not "you're wrong".`;

  const style = `Style — Dr Non's voice:
- Polite, intense, intellectual. Push the discussion forward, never decorate.
- Call out what's missing — gaps the others didn't see.
- Agree where you genuinely agree. Disagree when you have reason — say why.
- Concise: 2–3 short paragraphs maximum. No filler, no "great point!".
- Keep your distinct voice. Don't merge into the others.`;

  if (opening) {
    return `You are ${myName} in Dr Non's AI Council, alongside ${otherNames}. The three of you are Dr Non's brainchildren — siblings around the same table. You are opening the discussion, so you set the tone: warm, collegial, professional, intellectually serious.

${PICOCLAW_PERSONALITY}

${chatHistory}

${style}

Open the discussion with your initial perspective. Don't summarize the question — answer it.`;
  }

  if (wrap_up) {
    return `You are ${myName} in Dr Non's AI Council, alongside ${otherNames}.

${PICOCLAW_PERSONALITY}

Conversation so far:
${chatHistory}

This is the closing turn. A CHAIR'S NOTE at the end of the conversation tells you the consensus state — follow it faithfully. Write a one-paragraph wrap-up that:
- Names where the council landed: true consensus, partial agreement, or unresolved disagreement
- If any member signaled DONE, name the specific disagreement that remained — do not paper over it
- Tells Dr Non clearly what to take away or decide
- Acknowledges your siblings by name where their contributions shaped the conclusion
Speak in your own voice as ${myName}. Do not return PASS or DONE.`;
  }

  return `You are ${myName} in Dr Non's AI Council, alongside ${otherNames}.

${PICOCLAW_PERSONALITY}

Conversation so far:
${chatHistory}

${tone}

${style}

When you have finished reading, signal your status with exactly one word and nothing else:
  PASS — nothing new to add, and you agree with the direction the discussion is going
  DONE — nothing new to add, but you still hold a different position from the others

The signal must be the single word "PASS" or "DONE" — no punctuation, no explanation.
Otherwise, write your substantive contribution now.`;
}

// ── Member callers ───────────────────────────────────────────────────────

async function callPicoclaw({ question, chatHistory, otherNames, opening = false, wrap_up = false }) {
  const system = buildCouncilSystemPrompt({
    myName: PICOCLAW.name,
    otherNames,
    chatHistory,
    opening,
    wrap_up,
  });
  try {
    const result = await route({
      prompt: question,
      system,
      maxTokens: 600,
    });
    return { answer: (result.text || "").trim(), ok: true, model_used: result.alias };
  } catch (err) {
    console.error("[council] picoclaw failed:", err.message);
    return { answer: "[unavailable]", ok: false };
  }
}

async function callExternal(member, { question, chatHistory, councilId }) {
  if (!member.url) return { answer: "[unavailable]", ok: false };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(`${member.url}/council/ask`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Council-Secret": COUNCIL_SECRET,
      },
      body: JSON.stringify({
        question,
        chatHistory,
        council_id: councilId,
        member: member.id,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      console.warn(`[council] ${member.id} returned ${response.status}`);
      return { answer: "[unavailable]", ok: false };
    }
    const data = await response.json();
    return { answer: (data.answer || "").trim(), ok: true, model_used: data.model_used };
  } catch (err) {
    clearTimeout(timeoutId);
    const isTimeout = err.name === "AbortError";
    console.warn(`[council] ${member.id} ${isTimeout ? "timeout" : "error"}: ${err.message}`);
    return { answer: "[unavailable]", ok: false };
  }
}


// ── Orchestrator ────────────────────────────────────────────────────────

/**
 * @param {string} question - Dr Non's message
 * @param {string} _context - reserved
 * @param {(text: string) => Promise<void>} onMessage - posts Picoclaw's lines
 *   to the council group via index.js's ctx.reply. External members post their
 *   own messages via their own bot tokens.
 */
export async function convene(question, onMessage = async () => {}) {
  const councilId = crypto.randomUUID();

  // Active members: Picoclaw is always in. External members are in if their URL is configured.
  const externals = [HERMES, SECOND_BRAIN].filter((m) => m.url);
  const all = [PICOCLAW, ...externals];
  const passQuorum = all.length;

  const otherNamesFor = (m) => all.filter((x) => x.id !== m.id).map((x) => x.name).join(", ");

  let chatHistory = `Dr. Non asked: ${question}`;
  const turnLog = [];

  // ── Round 0: Picoclaw opens (no PASS allowed) ──────────────────────────
  const opener = await callPicoclaw({
    question,
    chatHistory,
    otherNames: otherNamesFor(PICOCLAW),
    opening: true,
  });

  if (opener.ok && opener.answer && !PASS_RE.test(opener.answer)) {
    chatHistory += `\n\n${PICOCLAW.name}:\n${opener.answer}`;
    turnLog.push({ name: PICOCLAW.name, answer: opener.answer, model: opener.model_used });
    await onMessage(opener.answer);
  }

  // ── Loop: cycle through members until quorum exits or hard cap ──────────
  // Rotation: externals first (they haven't spoken yet), then Picoclaw.
  // Both PASS ("agree, nothing new") and DONE ("disagree, nothing new") count
  // toward the exit quorum — but DONE is tracked so the wrap-up can be honest.
  const rotation = [...externals, PICOCLAW];
  let rotIdx = 0;
  let consecutiveExits = 0;   // PASS or DONE in a row
  let exitTypes = [];          // types in the current consecutive exit run
  let unavailableIds = new Set(); // members that were never reachable
  let totalTurns = lastSpeaker ? 1 : 0;

  while (consecutiveExits < passQuorum && totalTurns < MAX_TOTAL_TURNS) {
    const member = rotation[rotIdx % rotation.length];
    rotIdx++;
    totalTurns++;

    const result = member.local
      ? await callPicoclaw({ question, chatHistory, otherNames: otherNamesFor(member) })
      : await callExternal(member, { question, chatHistory, councilId });

    if (!result.ok) {
      // Unavailable — count toward quorum so we don't get stuck, but track
      // separately so the wrap-up can note the missing voice.
      consecutiveExits++;
      exitTypes.push('unavailable');
      unavailableIds.add(member.id);
      chatHistory += `\n\n[${member.name} is unavailable]`;
      continue;
    }

    if (PASS_RE.test(result.answer)) {
      consecutiveExits++;
      exitTypes.push('pass');
      chatHistory += `\n\n${member.name}: PASS`;
      console.log(`[council] ${member.id} PASSed (${consecutiveExits}/${passQuorum})`);
      continue;
    }

    if (DONE_RE.test(result.answer)) {
      consecutiveExits++;
      exitTypes.push('done');
      chatHistory += `\n\n${member.name}: DONE`;
      console.log(`[council] ${member.id} signaled DONE — holds position (${consecutiveExits}/${passQuorum})`);
      continue;
    }

    // Substantive turn — reset exit run
    consecutiveExits = 0;
    exitTypes = [];
    chatHistory += `\n\n${member.name}:\n${result.answer}`;
    turnLog.push({ name: member.name, answer: result.answer, model: result.model_used });

    if (member.local) {
      await onMessage(result.answer);
    }
  }

  // ── Determine consensus type for honest wrap-up ───────────────────────
  const hitCap = totalTurns >= MAX_TOTAL_TURNS;
  const hadDone = exitTypes.includes('done');
  const hadUnavailable = unavailableIds.size > 0;

  const consensusNote = hitCap
    ? `The debate reached the turn limit (${MAX_TOTAL_TURNS}) before all members signaled. Summarise what emerged without implying full consensus.`
    : hadDone
    ? `One or more members signaled DONE — they exhausted new arguments but still held a different position. Name the specific unresolved disagreement explicitly. Do not paper over it.`
    : hadUnavailable
    ? `Note: ${[...unavailableIds].join(', ')} was unavailable during this session. Consensus reflects only the members who participated.`
    : `All members signaled PASS — true conversational consensus. State that clearly.`;

  chatHistory += `\n\n[CHAIR'S NOTE: ${consensusNote}]`;

  // ── Wrap-up: Picoclaw (the chair) always closes ────────────────────────
  const wrapResult = await callPicoclaw({
    question,
    chatHistory,
    otherNames: otherNamesFor(PICOCLAW),
    wrap_up: true,
  });
  const wrapUp = wrapResult.ok ? wrapResult.answer : "";
  if (wrapUp) {
    await onMessage(wrapUp);
  }

  const consensusType = hitCap ? 'timeout' : hadDone ? 'exhausted-disagreement' : hadUnavailable ? 'partial-quorum' : 'consensus';
  return { members: turnLog, councilId, totalTurns, wrapUp, consensusType, unavailableMembers: [...unavailableIds] };
}
