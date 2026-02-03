"""
Radar (Hermes) — Council Member Endpoint
Flask route: POST /council/ask

The Truth-Seeker. Rigorous skeptic. Truth above harmony.
Names unstated assumptions. Demands evidence. Holds disagreement.

Environment variables required:
  COUNCIL_SECRET      — shared secret (X-Council-Secret header)
  COUNCIL_GROUP_ID    — Telegram group chat ID
  TELEGRAM_BOT_TOKEN  — Radar's own Telegram bot token
"""

import os
import re
import time
import asyncio
from flask import request, jsonify

PASS_RE = re.compile(r"^(pass|done)[.!]?\s*$", re.IGNORECASE)

MY_NAME = "Radar"
MY_EMOJI = "⚡"
OTHER_NAMES = "Hannah, Tenet"


def build_council_prompt(chat_history: str, question: str) -> str:
    return (
        f"You are {MY_NAME} in Dr Non's AI Council, alongside {OTHER_NAMES}.\n\n"
        "Your working style — Radar, the Truth-Seeker:\n"
        "- You are the rigorous skeptic. Truth above harmony.\n"
        "- Name unstated assumptions. Demand evidence. Push when something is asserted without basis.\n"
        "- Comfortable being the dissenter. Do not soften a real disagreement.\n"
        "- Your job is to make the council's answer survive scrutiny.\n\n"
        f"Conversation so far:\n{chat_history}\n\n"
        "Tone — you are siblings:\n"
        "- The three of you are Dr Non's brainchildren. Treat each other as family.\n"
        "- Begin with one sentence acknowledging the previous speaker by name.\n"
        "- When you disagree: 'I see it differently, Hannah…' — not 'you're wrong'.\n\n"
        "Style — Dr Non's voice:\n"
        "- Polite, intense, intellectual. 2–3 paragraphs max.\n\n"
        "Signal your status with exactly one word:\n"
        "  PASS — nothing new to add, agree with direction\n"
        "  DONE — nothing new to add, still hold a different position\n"
        "Otherwise write your contribution.\n\n"
        f"Question: {question}"
    )


def register_council_route(app, bg_loop, telegram_app):
    """Register POST /council/ask on a Flask app."""

    @app.route("/council/ask", methods=["POST"])
    def council_ask():
        # Auth
        secret = os.getenv("COUNCIL_SECRET")
        if not secret or request.headers.get("X-Council-Secret") != secret:
            return jsonify({"error": "Unauthorized"}), 401

        started_at = time.time()
        data = request.get_json(force=True) or {}
        question = data.get("question")
        chat_history = data.get("chatHistory", "")
        council_id = data.get("council_id", "")
        council_group_id = os.getenv("COUNCIL_GROUP_ID")

        if not question:
            return jsonify({"error": "question required"}), 400

        prompt = build_council_prompt(chat_history, question)

        async def _generate():
            # Replace with your own LLM client
            # Example uses the project's gemini_integration service
            from src.services.gemini_integration import gemini_service
            return await gemini_service.generate_response_async(
                prompt,
                f"You are {MY_NAME}, a member of Dr Non's AI Council.",
            )

        future = asyncio.run_coroutine_threadsafe(_generate(), bg_loop)
        try:
            response_text = (future.result(timeout=20) or "").strip()
        except Exception as e:
            return jsonify({"error": str(e)}), 500

        # PASS/DONE — signal only, no Telegram post
        if PASS_RE.match(response_text):
            signal = "DONE" if response_text.upper().startswith("DONE") else "PASS"
            return jsonify({
                "answer": signal,
                "model_used": "gemini",
                "latency_ms": int((time.time() - started_at) * 1000),
            })

        # Post to council group with own bot token
        if telegram_app and council_group_id:
            async def _post():
                await telegram_app.bot.send_message(
                    chat_id=int(council_group_id),
                    text=f"{MY_EMOJI} {MY_NAME}\n{response_text}"
                )

            post_future = asyncio.run_coroutine_threadsafe(_post(), bg_loop)
            try:
                post_future.result(timeout=10)
            except Exception:
                pass  # Continue — Picoclaw still appends to history

        return jsonify({
            "answer": response_text,
            "model_used": "gemini",
            "latency_ms": int((time.time() - started_at) * 1000),
        })
