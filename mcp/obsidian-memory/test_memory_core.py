import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from memory_core import (  # noqa: E402
    MemoryIndex,
    SecretDetected,
    capture_lesson,
    chunk_markdown,
    is_recall_source,
    redact_sensitive,
)


class FakeEmbedder:
    def __init__(self):
        self.calls = 0
        self.enabled = True

    def embed(self, texts):
        self.calls += len(texts)
        vectors = []
        for text in texts:
            lowered = text.lower()
            vectors.append([
                1.0 if any(word in lowered for word in ("marker", "map", "leaflet", "latlng")) else 0.0,
                1.0 if any(word in lowered for word in ("secret", "credential", "token")) else 0.0,
                1.0 if any(word in lowered for word in ("mcp", "obsidian", "agent")) else 0.0,
            ])
        return vectors


class MemoryCoreTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.vault = Path(self.temp.name)
        for folder in (
            "Scars/Debug-Logs",
            "Scars/Candidates",
            "Knowledge/Topics",
            "Memory/Sessions",
        ):
            (self.vault / folder).mkdir(parents=True, exist_ok=True)
        self.db = self.vault / ".mcp/cache/brain-index.sqlite"

    def tearDown(self):
        self.temp.cleanup()

    def write(self, relative, content):
        target = self.vault / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")
        return target

    def test_recall_source_policy(self):
        self.assertTrue(is_recall_source("Knowledge/Topics/mcp.md"))
        self.assertTrue(is_recall_source("Scars/Debug-Logs/fix.md"))
        self.assertFalse(is_recall_source("Scars/Candidates/unverified.md"))
        self.assertFalse(is_recall_source("Memory/Sessions/raw.md"))
        self.assertFalse(is_recall_source("Vitals/Credentials/key.md"))

    def test_heading_aware_chunks_are_bounded(self):
        text = "# Title\n\n## Cause\n\n" + ("marker movement " * 200)
        chunks = chunk_markdown(text, max_chars=300, overlap=40)
        self.assertGreater(len(chunks), 1)
        self.assertTrue(all(len(item[1]) <= 300 for item in chunks))
        self.assertEqual(chunks[0][0], "Title")

    def test_semantic_recall_finds_different_wording(self):
        self.write(
            "Scars/Debug-Logs/react-leaflet.md",
            """---
status: verified
project: phuket-smart-bus
stack: [react-leaflet]
---
# React Leaflet vehicle updates

Declarative Marker props did not refresh position. Use L.marker and setLatLng after each telemetry tick.
""",
        )
        index = MemoryIndex(self.vault, self.db, embedder=FakeEmbedder())
        index.index()
        result = index.search("moving markers on a map", limit=3)
        self.assertEqual(result["mode"], "hybrid")
        self.assertEqual(result["results"][0]["path"], "Scars/Debug-Logs/react-leaflet.md")

    def test_lexical_fallback_still_recalls(self):
        self.write("Knowledge/Topics/mcp.md", "# Obsidian MCP\n\nShared memory bridge for coding agents.")
        embedder = FakeEmbedder()
        index = MemoryIndex(self.vault, self.db, embedder=embedder)
        index.index()
        embedder.enabled = False
        result = index.search("shared memory bridge", limit=3)
        self.assertEqual(result["mode"], "lexical-fallback")
        self.assertEqual(result["results"][0]["path"], "Knowledge/Topics/mcp.md")

    def test_candidates_and_sessions_are_not_indexed(self):
        self.write("Scars/Candidates/guess.md", "# Guess\n\nmarker setLatLng")
        self.write("Memory/Sessions/raw.md", "# Raw\n\nmarker setLatLng")
        self.write(
            "Knowledge/Topics/raw-signal.md",
            "---\nstatus: raw\n---\n# Raw signal\n\nmarker setLatLng",
        )
        index = MemoryIndex(self.vault, self.db, embedder=FakeEmbedder())
        stats = index.index()
        self.assertEqual(stats["documents"], 0)

    def test_incremental_index_skips_unchanged_notes(self):
        self.write("Knowledge/Topics/mcp.md", "# Obsidian MCP\n\nShared memory bridge.")
        embedder = FakeEmbedder()
        index = MemoryIndex(self.vault, self.db, embedder=embedder)
        index.index()
        first_calls = embedder.calls
        stats = index.index()
        self.assertEqual(stats["updated"], 0)
        self.assertEqual(embedder.calls, first_calls)

    def test_capture_verified_and_candidate_lessons(self):
        verified = capture_lesson(
            self.vault,
            {
                "title": "Marker position updates",
                "symptom": "Vehicles stayed in their old position.",
                "failed_attempt": "Changed the React Marker position prop.",
                "cause": "The wrapper did not apply the position update reliably.",
                "fix": "Use L.marker and call setLatLng for every telemetry tick.",
                "applies_when": "Animating live vehicles with React Leaflet.",
                "verification": "Observed three vehicles move for 20 consecutive ticks in the live map.",
                "project": "phuket-smart-bus",
                "stack": ["react-leaflet"],
                "source": "session:test",
            },
        )
        self.assertEqual(verified["status"], "verified")
        self.assertTrue((self.vault / verified["path"]).exists())

        candidate = capture_lesson(
            self.vault,
            {
                "title": "Possible cache issue",
                "symptom": "Old data appeared.",
                "failed_attempt": "Reloaded once.",
                "cause": "Unknown.",
                "fix": "Clear the cache.",
                "applies_when": "Data looks old.",
                "verification": "unknown",
            },
        )
        self.assertEqual(candidate["status"], "candidate")
        self.assertTrue(candidate["path"].startswith("Scars/Candidates/"))

    def test_duplicate_capture_refuses_overwrite(self):
        payload = {
            "title": "Stable fix",
            "symptom": "Failure.",
            "failed_attempt": "Retry.",
            "cause": "Wrong state.",
            "fix": "Reset state.",
            "applies_when": "State is wrong.",
            "verification": "The regression test passed twice.",
        }
        capture_lesson(self.vault, payload)
        with self.assertRaises(FileExistsError):
            capture_lesson(self.vault, payload)

    def test_secret_content_is_rejected_without_echo(self):
        payload = {
            "title": "Unsafe note",
            "symptom": "Authentication failed.",
            "failed_attempt": "Used a literal credential.",
            "cause": "OPENAI_API_KEY=fixture-value-that-must-not-be-stored",
            "fix": "Use process.env.",
            "applies_when": "Authentication is configured.",
            "verification": "The environment-backed test passed.",
        }
        with self.assertRaises(SecretDetected) as raised:
            capture_lesson(self.vault, payload)
        self.assertNotIn("fixture-value", str(raised.exception))

    def test_redaction_covers_assignments_flags_and_urls(self):
        raw = (
            "TOKEN=fixture-token command --api-key fixture-flag "
            "SUPABASE_SERVICE_ROLE_KEY=fixture-service "
            "https://user:fixture-pass@example.test/path?access_token=fixture-query&safe=yes"
        )
        redacted = redact_sensitive(raw)
        for secret in ("fixture-token", "fixture-flag", "fixture-service", "fixture-pass", "fixture-query"):
            self.assertNotIn(secret, redacted)
        self.assertIn("safe=yes", redacted)


if __name__ == "__main__":
    unittest.main()
