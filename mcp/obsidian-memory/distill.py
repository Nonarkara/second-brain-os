#!/usr/bin/env python3
"""Find evidence-bearing historical notes that merit lesson review.

Raw command logs are deliberately not sent to a model. Only notes containing explicit
lesson, root-cause, workaround, or verified-fix language are reported as candidates.
"""

from __future__ import annotations

import json
import os
import re
from pathlib import Path


SIGNALS = re.compile(
    r"critical lesson learned|lesson learned|root cause|verified fix|regression test passed|never again|workaround",
    re.IGNORECASE,
)


def main() -> None:
    vault = Path(os.environ.get("OBSIDIAN_VAULT", Path.home() / "Documents/SecondBrain")).resolve()
    roots = [vault / "Memory/Sessions", vault / "Memory/Archive/Kingston"]
    scanned = 0
    matches = []
    for root in roots:
        if not root.is_dir():
            continue
        for note in root.rglob("*.md"):
            scanned += 1
            text = note.read_text(encoding="utf-8", errors="replace")
            found = sorted({match.group(0).lower() for match in SIGNALS.finditer(text)})
            if found:
                matches.append(
                    {
                        "path": note.relative_to(vault).as_posix(),
                        "signals": found,
                    }
                )
    print(
        json.dumps(
            {
                "scanned": scanned,
                "evidence_bearing": len(matches),
                "model_calls": 0,
                "reason": "Only evidence-bearing notes may become lesson candidates.",
                "matches": matches,
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
