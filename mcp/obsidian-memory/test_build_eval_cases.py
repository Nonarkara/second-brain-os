import json
import os
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from build_eval_cases import build_cases, refuse_package_path  # noqa: E402
from brain import evaluate, resolve_cases_path  # noqa: E402
from memory_core import MemoryIndex  # noqa: E402


class BuildEvalCasesTests(unittest.TestCase):
    def setUp(self):
        os.environ["OBSIDIAN_DISABLE_EMBEDDINGS"] = "1"
        self.temp = tempfile.TemporaryDirectory()
        self.vault = Path(self.temp.name)

    def tearDown(self):
        self.temp.cleanup()

    def write_lesson(self, number):
        token = f"zeta{number:02d}quartz"
        relative = Path("Scars/Debug-Logs") / f"2026-01-{number + 1:02d}-lesson-{token}.md"
        target = self.vault / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(
            "\n".join(
                [
                    "---",
                    "status: verified",
                    "tags: [scar, coding-lesson]",
                    "---",
                    "",
                    f"# Lesson {token} stdio bridge stall",
                    "",
                    f"The {token} bridge stalled because the client kept a dead pipe.",
                    "",
                    "## Fix",
                    "",
                    f"Restart the client so {token} gets a fresh stdio process.",
                    "",
                ]
            ),
            encoding="utf-8",
        )
        return relative.as_posix()

    def test_twenty_own_notes_verify(self):
        expected = [self.write_lesson(i) for i in range(20)]
        built = build_cases(self.vault, target=20)
        self.assertTrue(built["complete"])
        self.assertEqual(len(built["cases"]), 20)
        self.assertEqual([case["expected_paths"][0] for case in built["cases"]], expected)
        index = MemoryIndex(self.vault)
        result = evaluate(index, self._write_cases(built["cases"]))
        self.assertEqual(result["passed"], 20)
        self.assertEqual(result["total"], 20)
        self.assertTrue(result["suite_complete"])

    def test_short_vault_is_incomplete(self):
        self.write_lesson(0)
        built = build_cases(self.vault, target=20)
        self.assertFalse(built["complete"])
        self.assertEqual(len(built["cases"]), 1)

    def test_refuses_writing_suite_into_the_package(self):
        with self.assertRaises(SystemExit):
            refuse_package_path(Path(__file__).resolve().parent / "eval-cases.json")

    def test_shipped_tree_has_template_not_private_suite(self):
        package = Path(__file__).resolve().parent
        self.assertFalse((package / "eval-cases.json").exists())
        template = (package / "eval-cases.template.json").read_text(encoding="utf-8")
        self.assertIn("REPLACE", template)
        self.assertNotIn("2026-07-29", template)
        self.assertNotIn("codex-silent-rewrite", template)

    def test_missing_cases_path_points_at_the_vault_cache(self):
        resolved = resolve_cases_path(self.vault, None)
        self.assertEqual(resolved, self.vault / ".mcp" / "cache" / "eval-cases.json")

    def _write_cases(self, cases):
        target = self.vault / "cases.json"
        target.write_text(json.dumps(cases), encoding="utf-8")
        return target


if __name__ == "__main__":
    unittest.main()
