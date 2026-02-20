/**
 * Council Endpoint — v2 reference (Node / Express / grammy)
 *
 * Drop-in handler for any Node bot that wants to participate in the Dr Non
 * AI Council. Implements the v2 /council/ask contract:
 *
 *   POST /council/ask
 *   Headers: X-Council-Secret: <shared>
 *   Body:    { question, chatHistory, council_id, member, wrap_up }
 *   Returns: { answer, model_used?, latency_ms? }
 *
 * Behaviour:
 *   1. Validate the shared secret.
 *   2. Build a council prompt (Dr Non's voice) layered over the local persona.
 *   3. Generate the response via the local router.
 *   4. If the bot decides to PASS, return "PASS" and DO NOT post to Telegram.
 *   5. Otherwise, post the answer to COUNCIL_GROUP_ID via the local Telegram
 *      bot token so the bot's own avatar/name renders in the group.
 *   6. Return the answer text to Picoclaw so it can append to the transcript.
 *
 * Wiring:
 *   import { Bot } from "grammy";
 *   import { route } from "./router.js";       // any router with .route({prompt, system, maxTokens})
 *   import { makeCouncilEndpoint } from "./council-endpoint.js";
 *
 *   const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN);
 *   app.post("/council/ask", express.json(), makeCouncilEndpoint({ bot, route }));
 *
 * Required env vars on the host bot:
 *   TELEGRAM_BOT_TOKEN     — used to post the bot's own contribution
 *   COUNCIL_GROUP_ID       — numeric Telegram chat ID
 *   COUNCIL_SECRET         — must match Picoclaw's value
 *   MY_BOT_NAME            — e.g. "OpenClaw"   (no emoji here)
 *   MY_BOT_EMOJI           — e.g. "🪶"          (used when posting to Telegram)
 *   OTHER_BOT_NAMES        — comma-separated, e.g. "Picoclaw,Hermes,Second Brain"
 *   COUNCIL_MODEL          — alias passed to router (e.g. "sonnet", "haiku")
 */

const PASS_RE = /^pass[.!]?\s*$/i;  // "nothing new, agree with direction"
const DONE_RE = /^done[.!]?\s*$/i;  // "nothing new, but I still hold my position"

function buildCouncilSystemPrompt({ myName, otherNames, personality, chatHistory, wrap_up }) {
  const firstSibling = (otherNames || "").split(",")[0].trim() || "the others";

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

  const personalityBlock = personality ? `${personality}\n\n` : "";

  if (wrap_up) {
    return `You are ${myName} in Dr Non's AI Council, alongside ${otherNames}.

${personalityBlock}Conversation so far:
${chatHistory}

This is the closing turn. A CHAIR'S NOTE at the end of the conversation tells you the consensus state — follow it faithfully. Write a one-paragraph wrap-up that:
- Names where the council landed: true consensus, partial agreement, or unresolved disagreement
- If any member signaled DONE, name the specific disagreement that remained — do not paper over it
- Tells Dr Non clearly what to take away or decide
- Acknowledges your siblings by name where their contributions shaped the conclusion
Speak in your own voice as ${myName}. Do not return PASS or DONE.`;
  }

  return `You are ${myName} in Dr Non's AI Council, alongside ${otherNames}.

${personalityBlock}Conversation so far:
${chatHistory}

${tone}

${style}

When you have finished reading, signal your status with exactly one word and nothing else:
  PASS — nothing new to add, and you agree with the direction the discussion is going
  DONE — nothing new to add, but you still hold a different position from the others

The signal must be the single word "PASS" or "DONE" — no punctuation, no explanation.
Otherwise, write your substantive contribution now.`;
}

/**
 * Returns an Express handler.
 * @param {object} deps
 * @param {object} deps.bot   - grammy Bot (or anything with .api.sendMessage)
 * @param {object} deps.route - router exposing async route({prompt, system, maxTokens})
 */
export function makeCouncilEndpoint({ bot, route }) {
  const SECRET      = process.env.COUNCIL_SECRET      || "";
  const GROUP_ID    = process.env.COUNCIL_GROUP_ID    || "";
  const MY_NAME     = process.env.MY_BOT_NAME         || "Council Member";
  const MY_EMOJI    = process.env.MY_BOT_EMOJI        || "•";
  const OTHER       = process.env.OTHER_BOT_NAMES     || "the other council members";
  const MODEL       = process.env.COUNCIL_MODEL       || undefined;
  // Optional per-bot working style (e.g. "the Quick One", "the Truth-Seeker",
  // "the Adult in the Room"). Pasted verbatim into the council prompt.
  const PERSONALITY = process.env.MY_BOT_PERSONALITY  || "";

  return async function councilEndpoint(req, res) {
    const startedAt = Date.now();

    if (req.headers["x-council-secret"] !== SECRET || !SECRET) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { question, chatHistory = "", council_id, member, wrap_up = false } = req.body || {};
    if (!question) return res.status(400).json({ error: "question required" });

    const system = buildCouncilSystemPrompt({
      myName: MY_NAME,
      otherNames: OTHER,
      personality: PERSONALITY,
      chatHistory,
      wrap_up,
    });

    let answer = "";
    let modelUsed;
    try {
      const result = await route({
        prompt: question,
        system,
        model: MODEL,
        maxTokens: 600,
      });
      answer = (result.text || "").trim();
      modelUsed = result.alias;
    } catch (err) {
      console.error(`[council-endpoint] ${member}/${council_id} model error:`, err.message);
      return res.status(500).json({ error: err.message });
    }

    // PASS / DONE short-circuit — do not post to Telegram, just signal to Picoclaw.
    // PASS = agree and nothing new. DONE = disagree and nothing new.
    // Normalise to uppercase so Picoclaw's regex always matches cleanly.
    if ((PASS_RE.test(answer) || DONE_RE.test(answer)) && !wrap_up) {
      const signal = DONE_RE.test(answer) ? "DONE" : "PASS";
      return res.json({
        answer: signal,
        model_used: modelUsed,
        latency_ms: Date.now() - startedAt,
      });
    }

    // Post the answer to the council group as ourselves so the avatar/name renders.
    if (GROUP_ID) {
      try {
        const telegramText = `${MY_EMOJI} ${MY_NAME}\n${answer}`;
        await bot.api.sendMessage(Number(GROUP_ID), telegramText);
      } catch (err) {
        console.error(`[council-endpoint] ${member}/${council_id} telegram post failed:`, err.message);
        // Continue — Picoclaw still appends to history; Dr Non sees the gap.
      }
    } else {
      console.warn(`[council-endpoint] COUNCIL_GROUP_ID not set — skipping Telegram post`);
    }

    res.json({
      answer,
      model_used: modelUsed,
      latency_ms: Date.now() - startedAt,
    });
  };
}

// Default export for convenience
export default makeCouncilEndpoint;
