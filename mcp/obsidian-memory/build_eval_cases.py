#!/usr/bin/env python3
"""Build a retrieval suite from THIS vault's notes.

Writes $OBSIDIAN_VAULT/.mcp/cache/eval-cases.json (disposable, gitignored when
the vault lives in this repo). The public tree does not ship someone else's
scars. Do not commit the generated file.

Usage:
  export OBSIDIAN_VAULT=/path/to/vault
  python3 mcp/obsidian-memory/build_eval_cases.py
  python3 mcp/obsidian-memory/brain.py eval --json

Exit 0 when at least --target cases (default 20) verify in the top 3.
Exit 1 when some notes verified but fewer than the target.
Exit 2 when the vault has no durable recall notes yet.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path

from memory_core import UNTRUSTED_STATUSES, MemoryIndex, note_title, parse_frontmatter


def vault_path() -> Path:
    return Path(os.environ.get("OBSIDIAN_VAULT", Path.home() / "Documents/SecondBrain")).expanduser().resolve()


def candidate_queries(path: Path, text: str) -> list[str]:
    title = note_title(text, path.stem).strip()
    slug = path.stem.replace("-", " ")
    queries: list[str] = []
    for query in (title, f"{title} {slug}".strip(), slug):
        cleaned = re.sub(r"\s+", " ", query).strip()
        if len(cleaned) >= 12 and cleaned not in queries:
            queries.append(cleaned)
    for heading in ("Fix", "Cause", "Symptom"):
        match = re.search(rf"(?m)^## {heading}\n+(.+)", text)
        if not match:
            continue
        sentence = re.sub(r"\s+", " ", match.group(1)).strip()[:180]
        if len(sentence) >= 24 and sentence not in queries:
            queries.append(sentence)
    return queries


def verified_case(index: MemoryIndex, path: Path, text: str) -> dict | None:
    relative = path.relative_to(index.vault).as_posix()
    for query in candidate_queries(path, text):
        result = index.search(query, limit=3)
        returned = [item["path"] for item in result["results"]]
        if relative in returned:
            return {"query": query, "expected_paths": [relative]}
    return None


def collect_notes(index: MemoryIndex) -> list[Path]:
    notes = []
    for path in index._source_files():
        text = path.read_text(encoding="utf-8", errors="replace")
        status = str(parse_frontmatter(text).get("status", "durable")).strip().lower()
        if status in UNTRUSTED_STATUSES:
            continue
        if len(text.strip()) < 40:
            continue
        notes.append(path)
    return notes


def build_cases(vault: Path, target: int = 20) -> dict:
    index = MemoryIndex(vault)
    index.index()
    cases = []
    considered = 0
    for path in collect_notes(index):
        considered += 1
        text = path.read_text(encoding="utf-8", errors="replace")
        case = verified_case(index, path, text)
        if not case:
            continue
        cases.append(case)
        if len(cases) >= target:
            break
    return {
        "cases": cases,
        "considered": considered,
        "target": target,
        "complete": len(cases) >= target,
    }


def default_output(vault: Path) -> Path:
    return vault / ".mcp" / "cache" / "eval-cases.json"


def refuse_package_path(out: Path) -> None:
    package = Path(__file__).resolve().parent
    if out.resolve() == package / "eval-cases.json" or package.resolve() in out.resolve().parents and out.name == "eval-cases.json":
        raise SystemExit(
            "Refusing to write eval-cases.json into mcp/obsidian-memory. "
            "That file would commit your note paths. The default cache path is gitignored."
        )


def main() -> int:
    parser = argparse.ArgumentParser(description="Build eval cases from your own vault notes")
    parser.add_argument("--target", type=int, default=20)
    parser.add_argument("--out", default="", help="Defaults to $OBSIDIAN_VAULT/.mcp/cache/eval-cases.json")
    args = parser.parse_args()
    vault = vault_path()
    if not vault.is_dir():
        print(f"Vault does not exist: {vault}", file=sys.stderr)
        return 2
    out = Path(args.out).expanduser() if args.out else default_output(vault)
    refuse_package_path(out)
    built = build_cases(vault, max(1, args.target))
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(built["cases"], ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    summary = {
        "written": len(built["cases"]),
        "target": built["target"],
        "considered": built["considered"],
        "complete": built["complete"],
        "path": str(out),
    }
    print(json.dumps(summary, ensure_ascii=False))
    if built["considered"] == 0:
        print(
            "No durable recall notes yet. Capture verified lessons (capture_lesson) or add markdown under "
            "Scars/Debug-Logs, Scars/Anti-Regression, Knowledge/Topics, Knowledge/Bible, or Will/Projects. "
            "Then rerun this builder. Do not commit the output.",
            file=sys.stderr,
        )
        return 2
    if not built["complete"]:
        print(
            f"Verified {len(built['cases'])} of {built['target']}. "
            "Add more distinctive notes, then rerun. Generic titles get stolen by newer notes. "
            "Do not commit the output.",
            file=sys.stderr,
        )
        return 1
    print("Suite is large enough. Run: python3 mcp/obsidian-memory/brain.py eval --json", file=sys.stderr)
    print("Do not commit the generated file.", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
