"""Local, rebuildable retrieval for the Obsidian SecondBrain.

Markdown is authoritative. SQLite and embeddings are disposable search indexes.
This module uses only the Python standard library and the local Ollama HTTP API.
"""

from __future__ import annotations

import hashlib
import json
import math
import os
import re
import sqlite3
import urllib.error
import urllib.request
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path, PurePosixPath
from typing import Dict, Iterable, List, Optional, Sequence, Tuple
from zoneinfo import ZoneInfo


RECALL_ROOTS = (
    "Scars/Anti-Regression",
    "Scars/Debug-Logs",
    "Scars/Stories",
    "Knowledge/Topics",
    "Knowledge/Domains",
    "Knowledge/Bible",
    "Will/Decisions",
    "Will/Projects",
    "Reflexes/Snippets",
)

UNTRUSTED_STATUSES = {"candidate", "draft", "raw", "unverified"}

SECRET_PATTERNS = (
    re.compile(
        r"(?i)\b[A-Z0-9_]*(?:API_?KEY|[A-Z0-9_]+_KEY|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL|AUTH|BEARER)[A-Z0-9_]*"
        r"\s*=\s*(?!\$\{?[A-Z_][A-Z0-9_]*\}?\b)([^\s'\"&]+|'[^']+'|\"[^\"]+\")"
    ),
    re.compile(
        r"(?i)(--?[A-Z0-9_-]*(?:api-?key|token|secret|password|credential|auth|bearer)[A-Z0-9_-]*)"
        r"(?:=|\s+)([^\s]+)"
    ),
    re.compile(r"(?i)https?://[^\s/:@]+:[^\s/@]+@"),
    re.compile(
        r"(?i)([?&](?:access_token|api_?key|token|secret|password|credential|authorization|bearer)=)[^&\s]+"
    ),
    re.compile(r"\bAIza[A-Za-z0-9_-]{30,}\b"),
    re.compile(r"\b(?:sk-ant-|sk-|ghp_|github_pat_|gsk_|nvapi-|cfoat_)[A-Za-z0-9_.-]{16,}\b"),
    re.compile(r"\bAKIA[A-Z0-9]{16}\b"),
    re.compile(r"\beyJhbGciOiJ[A-Za-z0-9_.-]{40,}\b"),
    re.compile(r"\b\d{8,10}:AA[A-Za-z0-9_-]{25,}\b"),
)


class SecretDetected(ValueError):
    """Raised without including the matched secret value."""


def _posix(relative_path: str) -> str:
    return str(PurePosixPath(str(relative_path).replace("\\", "/"))).lstrip("./")


def is_recall_source(relative_path: str) -> bool:
    relative = _posix(relative_path)
    if not relative.endswith(".md") or relative.startswith("Scars/Candidates/"):
        return False
    return any(relative == root or relative.startswith(root + "/") for root in RECALL_ROOTS)


def strip_frontmatter(text: str) -> str:
    if not text.startswith("---\n"):
        return text
    end = text.find("\n---", 4)
    return text if end == -1 else text[end + 4 :].lstrip("\n")


def parse_frontmatter(text: str) -> Dict[str, object]:
    if not text.startswith("---\n"):
        return {}
    end = text.find("\n---", 4)
    if end == -1:
        return {}
    result: Dict[str, object] = {}
    for line in text[4:end].splitlines():
        if ":" not in line or line.startswith((" ", "\t")):
            continue
        key, value = line.split(":", 1)
        key, value = key.strip(), value.strip()
        if value.startswith("[") and value.endswith("]"):
            raw_items = value[1:-1].split(",")
            result[key] = [item.strip().strip("'\"") for item in raw_items if item.strip()]
        else:
            result[key] = value.strip("'\"")
    return result


def note_title(text: str, fallback: str) -> str:
    match = re.search(r"^#\s+(.+)$", strip_frontmatter(text), re.MULTILINE)
    return match.group(1).strip() if match else fallback


def wikilinks(text: str) -> List[str]:
    found = []
    for value in re.findall(r"\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]", text):
        clean = value.strip()
        if clean and clean not in found:
            found.append(clean)
    return found[:30]


def chunk_markdown(text: str, max_chars: int = 1200, overlap: int = 150) -> List[Tuple[str, str]]:
    body = strip_frontmatter(text).strip()
    if not body:
        return []
    blocks: List[Tuple[str, str]] = []
    heading = "Note"
    buffer: List[str] = []

    def flush() -> None:
        nonlocal buffer
        content = "\n".join(buffer).strip()
        if content:
            blocks.append((heading, content))
        buffer = []

    for line in body.splitlines():
        match = re.match(r"^#{1,3}\s+(.+)$", line)
        if match:
            flush()
            heading = match.group(1).strip()
            buffer = [line]
        else:
            buffer.append(line)
    flush()

    chunks: List[Tuple[str, str]] = []
    step = max(1, max_chars - max(0, overlap))
    for block_heading, content in blocks:
        start = 0
        while start < len(content):
            end = min(len(content), start + max_chars)
            if end < len(content):
                split = content.rfind(" ", start + max_chars // 2, end)
                if split > start:
                    end = split
            chunk = content[start:end].strip()
            if chunk:
                chunks.append((block_heading, chunk[:max_chars]))
            if end >= len(content):
                break
            start = max(start + 1, end - overlap)
            if start < len(content):
                next_space = content.find(" ", start)
                if 0 <= next_space < start + 40:
                    start = next_space + 1
            elif step:
                start += step
    return chunks


def contains_secret(text: str) -> bool:
    return any(pattern.search(text) for pattern in SECRET_PATTERNS)


def redact_sensitive(text: str) -> str:
    redacted = text
    redacted = SECRET_PATTERNS[0].sub(lambda m: m.group(0).split("=", 1)[0] + "=<redacted>", redacted)
    redacted = SECRET_PATTERNS[1].sub(lambda m: m.group(1) + " <redacted>", redacted)
    redacted = SECRET_PATTERNS[2].sub(lambda m: re.sub(r"//.*@", "//<redacted>@", m.group(0)), redacted)
    redacted = SECRET_PATTERNS[3].sub(lambda m: m.group(1) + "<redacted>", redacted)
    for pattern in SECRET_PATTERNS[4:]:
        redacted = pattern.sub("<redacted>", redacted)
    return redacted


def _hash_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _cosine(left: Sequence[float], right: Sequence[float]) -> float:
    if not left or not right or len(left) != len(right):
        return 0.0
    dot = sum(a * b for a, b in zip(left, right))
    left_norm = math.sqrt(sum(value * value for value in left))
    right_norm = math.sqrt(sum(value * value for value in right))
    return dot / (left_norm * right_norm) if left_norm and right_norm else 0.0


class OllamaEmbedder:
    def __init__(
        self,
        model: str = "nomic-embed-text:latest",
        endpoint: str = "http://127.0.0.1:11434/api/embed",
        timeout: float = 30.0,
    ):
        self.model = model
        self.endpoint = endpoint
        self.timeout = timeout
        self.enabled = os.environ.get("OBSIDIAN_DISABLE_EMBEDDINGS") != "1"

    def embed(self, texts: Sequence[str]) -> List[List[float]]:
        if not self.enabled or not texts:
            raise ConnectionError("Local embeddings disabled")
        request = urllib.request.Request(
            self.endpoint,
            data=json.dumps({"model": self.model, "input": list(texts)}).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=self.timeout) as response:
                payload = json.loads(response.read().decode("utf-8"))
        except (OSError, urllib.error.URLError, json.JSONDecodeError) as error:
            raise ConnectionError("Local embedding service unavailable") from error
        vectors = payload.get("embeddings")
        if not isinstance(vectors, list) or len(vectors) != len(texts):
            raise ConnectionError("Local embedding response was invalid")
        return vectors


@dataclass
class ParsedNote:
    path: str
    sha256: str
    mtime_ns: int
    title: str
    project: str
    stack: List[str]
    status: str
    frontmatter: Dict[str, object]
    links: List[str]
    chunks: List[Tuple[str, str]]


class MemoryIndex:
    def __init__(
        self,
        vault: Path,
        db_path: Optional[Path] = None,
        embedder: Optional[object] = None,
    ):
        self.vault = Path(vault).expanduser().resolve()
        self.db_path = Path(db_path or self.vault / ".mcp/cache/brain-index.sqlite")
        self.embedder = embedder if embedder is not None else OllamaEmbedder()

    def _connect(self) -> sqlite3.Connection:
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        connection = sqlite3.connect(str(self.db_path))
        connection.row_factory = sqlite3.Row
        connection.executescript(
            """
            PRAGMA journal_mode=WAL;
            PRAGMA foreign_keys=ON;
            CREATE TABLE IF NOT EXISTS metadata (
              key TEXT PRIMARY KEY,
              value TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS documents (
              path TEXT PRIMARY KEY,
              sha256 TEXT NOT NULL,
              mtime_ns INTEGER NOT NULL,
              title TEXT NOT NULL,
              project TEXT NOT NULL,
              stack_json TEXT NOT NULL,
              status TEXT NOT NULL,
              frontmatter_json TEXT NOT NULL,
              links_json TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS chunks (
              id INTEGER PRIMARY KEY,
              path TEXT NOT NULL REFERENCES documents(path) ON DELETE CASCADE,
              heading TEXT NOT NULL,
              content TEXT NOT NULL,
              embedding_json TEXT
            );
            CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
              path UNINDEXED,
              title,
              heading,
              content,
              tokenize='porter unicode61'
            );
            CREATE INDEX IF NOT EXISTS chunks_path_idx ON chunks(path);
            """
        )
        return connection

    def _source_files(self) -> List[Path]:
        files: List[Path] = []
        for relative_root in RECALL_ROOTS:
            root = self.vault / relative_root
            if not root.is_dir():
                continue
            for candidate in root.rglob("*.md"):
                relative = candidate.relative_to(self.vault).as_posix()
                if candidate.is_file() and is_recall_source(relative):
                    files.append(candidate)
        return sorted(files)

    def _parse(self, file_path: Path, text: str) -> ParsedNote:
        relative = file_path.relative_to(self.vault).as_posix()
        fm = parse_frontmatter(text)
        stack_value = fm.get("stack", [])
        if isinstance(stack_value, str):
            stack = [part.strip() for part in stack_value.split(",") if part.strip()]
        else:
            stack = [str(item) for item in stack_value]
        return ParsedNote(
            path=relative,
            sha256=_hash_text(text),
            mtime_ns=file_path.stat().st_mtime_ns,
            title=note_title(text, file_path.stem),
            project=str(fm.get("project", "")),
            stack=stack,
            status=str(fm.get("status", "durable")),
            frontmatter=fm,
            links=wikilinks(text),
            chunks=chunk_markdown(text),
        )

    def _embed_batches(self, texts: Sequence[str], batch_size: int = 24) -> List[Optional[List[float]]]:
        if not texts or not getattr(self.embedder, "enabled", True):
            return [None] * len(texts)
        result: List[Optional[List[float]]] = []
        try:
            for start in range(0, len(texts), batch_size):
                batch = texts[start : start + batch_size]
                result.extend(self.embedder.embed(batch))
        except (ConnectionError, OSError, urllib.error.URLError):
            return [None] * len(texts)
        return result

    @staticmethod
    def _delete_document(connection: sqlite3.Connection, relative_path: str) -> None:
        ids = [row[0] for row in connection.execute("SELECT id FROM chunks WHERE path = ?", (relative_path,))]
        connection.executemany("DELETE FROM chunks_fts WHERE rowid = ?", [(item,) for item in ids])
        connection.execute("DELETE FROM documents WHERE path = ?", (relative_path,))

    def index(self) -> Dict[str, object]:
        connection = self._connect()
        existing = {
            row["path"]: row["sha256"]
            for row in connection.execute("SELECT path, sha256 FROM documents")
        }
        parsed: List[ParsedNote] = []
        seen = set()
        source_files = self._source_files()
        for file_path in source_files:
            text = file_path.read_text(encoding="utf-8", errors="replace")
            relative = file_path.relative_to(self.vault).as_posix()
            digest = _hash_text(text)
            note = self._parse(file_path, text)
            if note.status.strip().lower() in UNTRUSTED_STATUSES:
                continue
            seen.add(relative)
            if existing.get(relative) == digest:
                continue
            parsed.append(note)

        removed = sorted(set(existing) - seen)
        for relative in removed:
            self._delete_document(connection, relative)

        all_chunk_texts = [content for note in parsed for _, content in note.chunks]
        embeddings = iter(self._embed_batches(all_chunk_texts))
        embedded_count = 0
        for note in parsed:
            self._delete_document(connection, note.path)
            connection.execute(
                """INSERT INTO documents
                (path, sha256, mtime_ns, title, project, stack_json, status, frontmatter_json, links_json)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    note.path,
                    note.sha256,
                    note.mtime_ns,
                    note.title,
                    note.project,
                    json.dumps(note.stack, ensure_ascii=False),
                    note.status,
                    json.dumps(note.frontmatter, ensure_ascii=False),
                    json.dumps(note.links, ensure_ascii=False),
                ),
            )
            for heading, content in note.chunks:
                vector = next(embeddings, None)
                if vector:
                    embedded_count += 1
                cursor = connection.execute(
                    "INSERT INTO chunks(path, heading, content, embedding_json) VALUES (?, ?, ?, ?)",
                    (note.path, heading, content, json.dumps(vector) if vector else None),
                )
                connection.execute(
                    "INSERT INTO chunks_fts(rowid, path, title, heading, content) VALUES (?, ?, ?, ?, ?)",
                    (cursor.lastrowid, note.path, note.title, heading, content),
                )

        now = datetime.now(ZoneInfo("Asia/Bangkok")).isoformat(timespec="seconds")
        connection.execute(
            "INSERT OR REPLACE INTO metadata(key, value) VALUES ('last_index_at', ?)", (now,)
        )
        source_max_mtime = max((item.stat().st_mtime_ns for item in source_files), default=0)
        connection.execute(
            "INSERT OR REPLACE INTO metadata(key, value) VALUES ('source_file_count', ?)",
            (str(len(source_files)),),
        )
        connection.execute(
            "INSERT OR REPLACE INTO metadata(key, value) VALUES ('source_max_mtime_ns', ?)",
            (str(source_max_mtime),),
        )
        connection.commit()
        documents = connection.execute("SELECT COUNT(*) FROM documents").fetchone()[0]
        chunks = connection.execute("SELECT COUNT(*) FROM chunks").fetchone()[0]
        missing = connection.execute("SELECT COUNT(*) FROM chunks WHERE embedding_json IS NULL").fetchone()[0]
        connection.close()
        return {
            "documents": documents,
            "chunks": chunks,
            "updated": len(parsed),
            "removed": len(removed),
            "embedded": embedded_count,
            "missing_embeddings": missing,
            "mode": "hybrid" if missing == 0 and chunks else "lexical-fallback",
            "db": str(self.db_path),
        }

    @staticmethod
    def _fts_terms(query: str) -> str:
        terms = re.findall(r"[A-Za-z0-9_][A-Za-z0-9_-]{1,}", query.lower())
        unique = []
        for term in terms:
            if term not in unique:
                unique.append(term)
        return " OR ".join('"' + term.replace('"', '') + '"' for term in unique[:16])

    def ensure_fresh(self) -> bool:
        if not self.db_path.exists():
            self.index()
            return True
        source_files = self._source_files()
        current_count = len(source_files)
        current_max_mtime = max((item.stat().st_mtime_ns for item in source_files), default=0)
        connection = self._connect()
        metadata = dict(connection.execute("SELECT key, value FROM metadata"))
        document_count = connection.execute("SELECT COUNT(*) FROM documents").fetchone()[0]
        connection.close()
        stale = (
            document_count == 0
            or int(metadata.get("source_file_count", "-1")) != current_count
            or int(metadata.get("source_max_mtime_ns", "-1")) != current_max_mtime
        )
        if stale:
            self.index()
        return stale

    def search(
        self,
        query: str,
        project: str = "",
        stack: str = "",
        error: str = "",
        limit: int = 3,
    ) -> Dict[str, object]:
        query = " ".join(part for part in (query, project, stack, error) if part).strip()
        if not query:
            raise ValueError("query is required")
        limit = min(5, max(1, int(limit)))
        self.ensure_fresh()
        connection = self._connect()

        scores: Dict[int, Dict[str, object]] = {}
        fts = self._fts_terms(query)
        if fts:
            try:
                rows = connection.execute(
                    """SELECT rowid, path, title, heading, content, bm25(chunks_fts) AS rank
                    FROM chunks_fts WHERE chunks_fts MATCH ? ORDER BY rank LIMIT 80""",
                    (fts,),
                ).fetchall()
            except sqlite3.OperationalError:
                rows = []
            total = max(1, len(rows))
            for position, row in enumerate(rows):
                scores[row["rowid"]] = {
                    "lexical": 1.0 - (position / total),
                    "semantic": 0.0,
                    "row": row,
                }

        query_vector: Optional[List[float]] = None
        if getattr(self.embedder, "enabled", True):
            try:
                query_vector = self.embedder.embed([query])[0]
            except (ConnectionError, OSError, urllib.error.URLError, IndexError):
                query_vector = None

        if query_vector:
            for row in connection.execute(
                """SELECT c.id AS rowid, c.path, d.title, c.heading, c.content, c.embedding_json
                FROM chunks c JOIN documents d ON d.path = c.path
                WHERE c.embedding_json IS NOT NULL"""
            ):
                try:
                    similarity = max(0.0, _cosine(query_vector, json.loads(row["embedding_json"])))
                except (TypeError, ValueError, json.JSONDecodeError):
                    continue
                item = scores.setdefault(
                    row["rowid"],
                    {"lexical": 0.0, "semantic": 0.0, "row": row},
                )
                item["semantic"] = similarity

        ranked = []
        query_lower = query.lower()
        for item in scores.values():
            row = item["row"]
            document = connection.execute(
                "SELECT project, stack_json, status, links_json FROM documents WHERE path = ?",
                (row["path"],),
            ).fetchone()
            if not document:
                continue
            metadata_text = " ".join(
                (document["project"], document["stack_json"], row["path"])
            ).lower()
            metadata = 0.1 if any(
                value and value.lower() in metadata_text for value in (project, stack)
            ) else 0.0
            combined = (0.65 * float(item["semantic"])) + (0.25 * float(item["lexical"])) + metadata
            if query_lower in str(row["content"]).lower():
                combined += 0.05
            reasons = []
            if item["semantic"] >= 0.5:
                reasons.append("semantic")
            if item["lexical"] > 0:
                reasons.append("keyword")
            if metadata:
                reasons.append("metadata")
            ranked.append((combined, row, document, reasons))

        ranked.sort(key=lambda entry: (-entry[0], entry[1]["path"], entry[1]["rowid"]))
        results = []
        seen_paths = set()
        for score, row, document, reasons in ranked:
            if row["path"] in seen_paths or score <= 0:
                continue
            seen_paths.add(row["path"])
            substantive = [
                entry
                for entry in ranked
                if entry[1]["path"] == row["path"]
                and len(re.sub(r"\s+", " ", str(entry[1]["content"])).strip()) >= 120
            ]
            if substantive:
                chosen_score, row, document, reasons = substantive[0]
                score = max(score, chosen_score)
            excerpt = re.sub(r"\s+", " ", str(row["content"])).strip()[:600]
            results.append(
                {
                    "title": row["title"],
                    "path": row["path"],
                    "heading": row["heading"],
                    "status": document["status"],
                    "score": round(score, 4),
                    "matched_by": reasons or ["rank"],
                    "excerpt": excerpt,
                    "project": document["project"],
                    "stack": json.loads(document["stack_json"]),
                    "related": json.loads(document["links_json"])[:5],
                }
            )
            if len(results) >= limit:
                break
        connection.close()
        return {
            "query": query,
            "mode": "hybrid" if query_vector else "lexical-fallback",
            "count": len(results),
            "results": results,
        }

    def audit(self) -> Dict[str, object]:
        if not self.db_path.exists():
            return {"status": "missing", "db": str(self.db_path)}
        connection = self._connect()
        metadata = dict(connection.execute("SELECT key, value FROM metadata"))
        result = {
            "status": "ready",
            "db": str(self.db_path),
            "documents": connection.execute("SELECT COUNT(*) FROM documents").fetchone()[0],
            "chunks": connection.execute("SELECT COUNT(*) FROM chunks").fetchone()[0],
            "missing_embeddings": connection.execute(
                "SELECT COUNT(*) FROM chunks WHERE embedding_json IS NULL"
            ).fetchone()[0],
            "last_index_at": metadata.get("last_index_at"),
            "candidates": len(list((self.vault / "Scars/Candidates").glob("*.md")))
            if (self.vault / "Scars/Candidates").is_dir()
            else 0,
        }
        connection.close()
        last_eval_path = self.db_path.parent / "last-eval.json"
        if last_eval_path.is_file():
            try:
                result["last_evaluation"] = json.loads(last_eval_path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                result["last_evaluation"] = {"status": "invalid"}
        return result


def _slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug or "lesson"


def _yaml_scalar(value: object) -> str:
    return json.dumps(str(value), ensure_ascii=False)


def _verification_is_concrete(value: str) -> bool:
    lowered = value.strip().lower()
    return len(lowered) >= 20 and lowered not in {
        "unknown",
        "none",
        "not verified",
        "unverified",
        "todo",
    }


def capture_lesson(vault: Path, payload: Dict[str, object]) -> Dict[str, str]:
    required = ("title", "symptom", "failed_attempt", "cause", "fix", "applies_when")
    missing = [field for field in required if not str(payload.get(field, "")).strip()]
    if missing:
        raise ValueError("Missing lesson fields: " + ", ".join(missing))
    serialized = json.dumps(payload, ensure_ascii=False)
    if contains_secret(serialized):
        raise SecretDetected("Secret-like content rejected; matched value was not returned.")

    verification = str(payload.get("verification", "")).strip()
    status = "verified" if _verification_is_concrete(verification) else "candidate"
    folder = "Scars/Debug-Logs" if status == "verified" else "Scars/Candidates"
    date = datetime.now(ZoneInfo("Asia/Bangkok")).strftime("%Y-%m-%d")
    slug = _slugify(str(payload["title"]))
    relative = f"{folder}/{date}-{slug}.md"
    target = Path(vault).expanduser().resolve() / relative
    target.parent.mkdir(parents=True, exist_ok=True)

    duplicates = list((Path(vault) / "Scars").glob(f"**/*-{slug}.md"))
    if duplicates or target.exists():
        existing = duplicates[0].relative_to(Path(vault)).as_posix() if duplicates else relative
        raise FileExistsError(f"Lesson already exists: {existing}")

    stack = payload.get("stack", [])
    if isinstance(stack, str):
        stack = [part.strip() for part in stack.split(",") if part.strip()]
    links = payload.get("links", [])
    if isinstance(links, str):
        links = [links]
    frontmatter = [
        "---",
        "type: coding-lesson",
        f"status: {status}",
        f"date: {date}",
        f"project: {_yaml_scalar(payload.get('project', ''))}",
        "stack: [" + ", ".join(_yaml_scalar(item) for item in stack) + "]",
        f"source: {_yaml_scalar(payload.get('source', 'unknown'))}",
        "tags: [scar, coding-lesson]",
        "links: [" + ", ".join(_yaml_scalar(item) for item in links) + "]",
        "---",
    ]
    sections = [
        ("Symptom", payload["symptom"]),
        ("Failed attempt", payload["failed_attempt"]),
        ("Cause", payload["cause"]),
        ("Fix", payload["fix"]),
        ("Applies when", payload["applies_when"]),
        ("Verification", verification or "Not yet verified."),
        ("Sources", payload.get("source", "unknown")),
        ("Related", "\n".join(f"- [[{item}]]" for item in links) or "None recorded."),
    ]
    body = "\n".join(frontmatter) + f"\n\n# {payload['title']}\n"
    for heading, value in sections:
        body += f"\n## {heading}\n\n{value}\n"
    target.write_text(body, encoding="utf-8")
    return {"path": relative, "status": status}


def format_recall_markdown(result: Dict[str, object], max_chars: int = 3200) -> str:
    lines = [
        f"# Recalled lessons",
        f"Mode: {result.get('mode')} · Results: {result.get('count', 0)}",
        "Authority: current AGENTS.md and project instructions override recalled notes.",
    ]
    for item in result.get("results", []):
        lines.extend(
            [
                "",
                f"## {item['title']}",
                f"Source: [[{str(item['path']).removesuffix('.md')}]]",
                f"Status: {item['status']} · Match: {', '.join(item['matched_by'])}",
                str(item["excerpt"]),
            ]
        )
        if item.get("related"):
            lines.append("Related: " + ", ".join(f"[[{link}]]" for link in item["related"]))
    text = "\n".join(lines).strip()
    return text[:max_chars]
