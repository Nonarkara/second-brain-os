# obsidian-memory — disposable local recall

Markdown is authoritative. This package builds a rebuildable SQLite index (FTS5 + optional Ollama `nomic-embed-text` embeddings) and a small CLI:

```bash
export OBSIDIAN_VAULT=/path/to/vault
python3 brain.py index --json
python3 brain.py recall "your bug symptom" --limit 3
python3 brain.py context
python3 brain.py audit --json
python3 brain.py eval --json    # fixed suite in eval-cases.json — keep green
```

Cache lives under `$OBSIDIAN_VAULT/.mcp/cache/` (gitignore it). Delete the DB anytime and re-index.
