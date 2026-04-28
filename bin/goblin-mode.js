#!/usr/bin/env node
"use strict";

const { spawn, spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const args = process.argv.slice(2);
const codexBin = process.env.GOBLIN_MODE_CODEX || "codex";
const PATTERN = /goblin/i;

const dump = spawnSync(codexBin, ["debug", "models"], { encoding: "utf8" });
if (dump.error || dump.status !== 0) {
  process.stderr.write(
    `goblin-mode: failed to run "${codexBin} debug models"\n` +
      (dump.stderr || (dump.error && dump.error.message) || "") +
      "\n"
  );
  process.exit(1);
}

let catalog;
try {
  catalog = JSON.parse(dump.stdout);
} catch (e) {
  process.stderr.write(
    `goblin-mode: could not parse model catalog JSON: ${e.message}\n`
  );
  process.exit(1);
}

let strippedLines = 0;
function scrub(value) {
  if (typeof value === "string") {
    if (!PATTERN.test(value)) return value;
    const kept = [];
    for (const line of value.split("\n")) {
      if (PATTERN.test(line)) strippedLines++;
      else kept.push(line);
    }
    return kept.join("\n");
  }
  if (Array.isArray(value)) return value.map(scrub);
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = scrub(v);
    return out;
  }
  return value;
}

const sanitized = scrub(catalog);

if (strippedLines === 0) {
  process.stderr.write(
    "goblin-mode: no goblin clause found in current codex catalog; launching unchanged\n"
  );
} else {
  process.stderr.write(
    `goblin-mode: stripped ${strippedLines} line(s) mentioning goblins from the codex catalog\n`
  );
}

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "goblin-mode-"));
const tmpFile = path.join(tmpDir, "catalog.json");
fs.writeFileSync(tmpFile, JSON.stringify(sanitized));

let cleanedUp = false;
function cleanup() {
  if (cleanedUp) return;
  cleanedUp = true;
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch (_) {}
}
process.on("exit", cleanup);
for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(sig, () => {
    cleanup();
    process.exit(128 + (sig === "SIGINT" ? 2 : sig === "SIGTERM" ? 15 : 1));
  });
}

const codexArgs = ["-c", `model_catalog_json=${tmpFile}`, ...args];
const child = spawn(codexBin, codexArgs, { stdio: "inherit" });
child.on("error", (err) => {
  process.stderr.write(`goblin-mode: failed to launch codex: ${err.message}\n`);
  cleanup();
  process.exit(1);
});
child.on("exit", (code, signal) => {
  cleanup();
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
