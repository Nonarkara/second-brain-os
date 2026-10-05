# obsidian-memory — disposable local recall

Markdown is authoritative. This package builds a rebuildable SQLite index (FTS5 + optional Ollama `nomic-embed-text` embeddings) and a small CLI. The bridge finds `brain.py` next to itself (`../obsidian-memory/brain.py`). You do not copy this folder into the vault. `OBSIDIAN_BRAIN_CLI` overrides the path.

```bash
export OBSIDIAN_VAULT=/path/to/vault          # or "$PWD/vault" while learning
export OBSIDIAN_TIME_ZONE="${OBSIDIAN_TIME_ZONE:-Asia/Bangkok}"
python3 brain.py index --json
python3 brain.py recall "your bug symptom" --limit 3
python3 brain.py context
python3 brain.py audit --json
```

Cache lives under `$OBSIDIAN_VAULT/.mcp/cache/` (gitignore it). Delete the DB anytime and re-index.

## Eval (your notes, not someone else's)

The operator bar is 20/20. A public suite of another person's scar paths scores 0 on your vault, so this repo ships a template instead of a filled suite.

```bash
python3 build_eval_cases.py
python3 brain.py eval --json
```

`build_eval_cases.py` reads durable notes in the recall roots (`Scars/Debug-Logs`, `Scars/Anti-Regression`, `Knowledge/Topics`, `Knowledge/Bible`, `Will/Projects`, and the other roots in `memory_core.RECALL_ROOTS`), checks that each query actually returns that note in the top 3, and writes `$OBSIDIAN_VAULT/.mcp/cache/eval-cases.json`. It exits 0 only at 20 verified cases. Do not commit that file.

To write the suite by hand, copy [`eval-cases.template.json`](eval-cases.template.json). Use a phrase that appears in one note. Generic queries get stolen by the next note you add. Point `brain.py eval --cases` or `OBSIDIAN_EVAL_CASES` at your file.

The shipped `vault/` stub has no scars. Smoke can pass after `index` before you have 20 lessons. Eval reaches 20/20 after you capture them.
