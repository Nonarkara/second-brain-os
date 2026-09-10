#!/usr/bin/env python3
"""Idempotently wire the local Obsidian bridge into supported coding clients."""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import stat
import tempfile
from datetime import datetime
from pathlib import Path
from typing import Dict, Optional, Tuple


def arguments():
    parser = argparse.ArgumentParser(description="Wire Obsidian shared memory into coding clients")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--apply", action="store_true", help="Write missing or stale connections")
    mode.add_argument("--check", action="store_true", help="Check connections without writing (default)")
    parser.add_argument("--home", default=str(Path.home()), help="Home directory, used by tests and migrations")
    parser.add_argument(
        "--vault",
        default=str(Path(__file__).resolve().parents[2]),
        help="SecondBrain vault path",
    )
    return parser.parse_args()


def backup(path: Path) -> Path:
    stamp = datetime.now().strftime("%Y%m%dT%H%M%S")
    target = path.with_name(path.name + f".pre-secondbrain-{stamp}.bak")
    shutil.copy2(path, target)
    return target


def atomic_write(path: Path, content: str, mode: Optional[int] = None) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    previous_mode = stat.S_IMODE(path.stat().st_mode) if path.exists() else mode
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=path.parent, delete=False) as handle:
        handle.write(content)
        temp_path = Path(handle.name)
    temp_path.replace(path)
    if previous_mode is not None:
        path.chmod(previous_mode)


def expected_servers(vault: Path, home: Path) -> Dict[str, Tuple[Path, str, str, dict]]:
    node = shutil.which("node") or "/opt/homebrew/bin/node"
    bridge = str(vault / ".mcp/obsidian-bridge/index.js")
    return {
        "claude-code": (
            home / ".claude.json",
            "mcpServers",
            "obsidian-bridge",
            {"type": "stdio", "command": node, "args": [bridge], "env": {"OBSIDIAN_VAULT": str(vault)}},
        ),
        "cursor": (
            home / ".cursor/mcp.json",
            "mcpServers",
            "obsidian-bridge",
            {"command": node, "args": [bridge], "env": {"OBSIDIAN_VAULT": str(vault)}},
        ),
        "vscode": (
            home / "Library/Application Support/Code/User/mcp.json",
            "servers",
            "obsidian-bridge",
            {"type": "stdio", "command": node, "args": [bridge], "env": {"OBSIDIAN_VAULT": str(vault)}},
        ),
    }


def wire_json(path: Path, section: str, name: str, expected: dict, apply: bool) -> str:
    data = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
    current = data.get(section, {}).get(name)
    if current == expected:
        return "connected"
    if not apply:
        return "missing-or-stale"
    if path.exists():
        backup(path)
    data.setdefault(section, {})[name] = expected
    atomic_write(path, json.dumps(data, ensure_ascii=False, indent=2) + "\n")
    return "wired"


def codex_block(vault: Path) -> str:
    node = shutil.which("node") or "/opt/homebrew/bin/node"
    bridge = vault / ".mcp/obsidian-bridge/index.js"
    return (
        "[mcp_servers.obsidian]\n"
        f'command = {json.dumps(node)}\n'
        f"args = [{json.dumps(str(bridge))}]\n"
        'startup_timeout_sec = 10\n'
        'tool_timeout_sec = 60\n'
        'default_tools_approval_mode = "writes"\n\n'
        "[mcp_servers.obsidian.env]\n"
        f"OBSIDIAN_VAULT = {json.dumps(str(vault))}\n"
        'OBSIDIAN_TIME_ZONE = "Asia/Bangkok"\n'
    )


def wire_codex(path: Path, vault: Path, apply: bool) -> str:
    content = path.read_text(encoding="utf-8") if path.exists() else ""
    block = codex_block(vault)
    pattern = re.compile(
        r"(?ms)^\[mcp_servers\.obsidian\]\n.*?(?=^\[(?!mcp_servers\.obsidian\.env\])|\Z)"
    )
    match = pattern.search(content)
    current = match.group(0).rstrip() if match else ""
    if current == block.rstrip():
        return "connected"
    if not apply:
        return "missing-or-stale"
    if path.exists():
        backup(path)
    updated = pattern.sub(block + "\n", content) if match else content.rstrip() + "\n\n" + block
    atomic_write(path, updated.lstrip("\n"))
    return "wired"


def ensure_text(path: Path, content: str, apply: bool, executable: bool = False) -> str:
    current = path.read_text(encoding="utf-8") if path.exists() else None
    if current == content:
        if executable and not os.access(path, os.X_OK) and apply:
            path.chmod(0o755)
            return "wired"
        return "connected"
    if not apply:
        return "missing-or-stale"
    if path.exists():
        backup(path)
    atomic_write(path, content, 0o755 if executable else 0o644)
    return "wired"


def ensure_block(path: Path, block: str, apply: bool) -> str:
    content = path.read_text(encoding="utf-8") if path.exists() else ""
    if block.strip() in content:
        return "connected"
    if not apply:
        return "missing-or-stale"
    if path.exists():
        backup(path)
    updated = content.rstrip() + "\n\n" + block.strip() + "\n"
    atomic_write(path, updated.lstrip("\n"), 0o644)
    return "wired"


def main() -> int:
    args = arguments()
    home = Path(args.home).expanduser().resolve()
    vault = Path(args.vault).expanduser().resolve()
    statuses = {}
    for client, (path, section, name, expected) in expected_servers(vault, home).items():
        statuses[client] = wire_json(path, section, name, expected, args.apply)
    statuses["codex"] = wire_codex(home / ".codex/config.toml", vault, args.apply)

    cursor_rule = (
        "---\n"
        "description: Retrieve and save shared coding lessons through Dr Non's Obsidian SecondBrain\n"
        "alwaysApply: true\n"
        "---\n\n"
        "Current AGENTS.md and project instructions override recalled notes. Before coding, debugging, or choosing architecture, call `recall_lessons` with the task plus any project, stack, or error. Retrieve at most three results and never load the whole vault. After a novel fix is verified, call `capture_lesson` with the symptom, failed attempt, cause, fix, applicability, source, and concrete verification. Unverified candidates and raw sessions must not guide work. Never store secrets. If MCP is unavailable, use the `brain` CLI.\n"
    )
    copilot_rule = (
        '---\nname: SecondBrain Shared Memory\ndescription: Retrieve and save verified coding lessons through Dr Non\'s Obsidian vault\napplyTo: "**"\n---\n\n'
        "Current AGENTS.md and project instructions override recalled notes. Before coding, debugging, or choosing architecture, use the `obsidian-bridge` MCP tool `recall_lessons` with the task plus any project, stack, or error. Retrieve at most three results and never load the whole vault. After a novel fix is verified, use `capture_lesson` with the symptom, failed attempt, cause, fix, applicability, source, and concrete verification. Unverified candidates and raw sessions must not guide work. Never store secrets. If MCP is unavailable, use the `brain` CLI.\n"
    )
    wrapper = '#!/bin/zsh\nexec python3 "$HOME/Documents/SecondBrain/.mcp/obsidian-memory/brain.py" "$@"\n'
    aider = f"read:\n  - {vault / 'Bridges/Agent-Core.md'}\n"
    statuses["cursor-rule"] = ensure_text(home / "Projects/.cursor/rules/secondbrain.mdc", cursor_rule, args.apply)
    statuses["vscode-rule"] = ensure_text(home / ".copilot/instructions/secondbrain.instructions.md", copilot_rule, args.apply)
    statuses["brain-cli"] = ensure_text(home / ".local/bin/brain", wrapper, args.apply, executable=True)
    shell_path = '# SecondBrain shared-memory CLI\nexport PATH="$HOME/.local/bin:$PATH"\n'
    statuses["shell-path"] = ensure_block(home / ".zprofile", shell_path, args.apply)
    statuses["aider"] = ensure_text(home / ".aider.conf.yml", aider, args.apply)

    print(json.dumps({"apply": args.apply, "vault": str(vault), "clients": statuses}, ensure_ascii=False))
    return 0 if all(value in {"connected", "wired"} for value in statuses.values()) else 1


if __name__ == "__main__":
    raise SystemExit(main())
