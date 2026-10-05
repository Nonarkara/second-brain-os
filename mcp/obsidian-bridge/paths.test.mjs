import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import {
  resolveBrainCli,
  resolveBridgeIndex,
  resolveGenerateToday,
  timeZone
} from "./paths.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));

test("repo layout resolves brain.py beside the bridge", () => {
  const brain = resolveBrainCli({ scriptDir: here, vault: "/tmp/not-the-vault", env: {} });
  assert.equal(path.basename(brain), "brain.py");
  assert.equal(path.basename(path.dirname(brain)), "obsidian-memory");
  assert.equal(fs.existsSync(brain), true);
  assert.equal(brain.includes(`${path.sep}.mcp${path.sep}`), false);
});

test("OBSIDIAN_BRAIN_CLI overrides both layouts", () => {
  assert.equal(
    resolveBrainCli({
      scriptDir: here,
      vault: "/tmp/vault",
      env: { OBSIDIAN_BRAIN_CLI: "/opt/custom/brain.py" }
    }),
    "/opt/custom/brain.py"
  );
});

test("vault .mcp copy is the fallback when the script is not in the repo tree", () => {
  const scriptDir = fs.mkdtempSync(path.join(os.tmpdir(), "bridge-"));
  const vault = fs.mkdtempSync(path.join(os.tmpdir(), "vault-"));
  const brain = path.join(vault, ".mcp/obsidian-memory/brain.py");
  fs.mkdirSync(path.dirname(brain), { recursive: true });
  fs.writeFileSync(brain, "#!/usr/bin/env python3\n");
  assert.equal(resolveBrainCli({ scriptDir, vault, env: {} }), brain);
});

test("generate-today resolves to the shipped scripts/ copy", () => {
  const script = resolveGenerateToday({ scriptDir: here, vault: "/tmp/empty-vault", env: {} });
  assert.equal(path.basename(script), "generate-today.mjs");
  assert.equal(fs.existsSync(script), true);
});

test("smoke launches the sibling bridge, not a vault copy", () => {
  assert.equal(resolveBridgeIndex({ scriptDir: here, env: {} }), path.join(here, "index.js"));
});

test("time zone falls back when the name is invalid", () => {
  assert.equal(timeZone({ OBSIDIAN_TIME_ZONE: "Not/AZone" }), "Asia/Bangkok");
  assert.equal(timeZone({ OBSIDIAN_TIME_ZONE: "UTC" }), "UTC");
  assert.equal(timeZone({}), "Asia/Bangkok");
});
