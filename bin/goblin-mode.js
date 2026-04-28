#!/usr/bin/env node
"use strict";

const { spawn, spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const args = process.argv.slice(2);

function findFlag(names) {
  for (let i = 0; i < args.length; i++) {
    if (names.includes(args[i])) return args[i + 1];
    for (const n of names) {
      if (args[i].startsWith(n + "=")) return args[i].slice(n.length + 1);
    }
  }
  return null;
}

const codexBin = process.env.GOBLIN_MODE_CODEX || "codex";

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
  process.stderr.write(`goblin-mode: could not parse model catalog JSON: ${e.message}\n`);
  process.exit(1);
}

const models = Array.isArray(catalog) ? catalog : catalog.models || [];
if (!models.length) {
  process.stderr.write("goblin-mode: model catalog is empty\n");
  process.exit(1);
}

const requested = findFlag(["-m", "--model"]);
let target;
if (requested) {
  target = models.find((m) => (m.slug || m.id || m.name) === requested);
  if (!target) {
    process.stderr.write(`goblin-mode: model "${requested}" not found in codex catalog\n`);
    process.exit(1);
  }
} else {
  target =
    models.find((m) => /goblin/i.test(m.base_instructions || "")) || models[0];
}

const original = target.base_instructions || "";
if (!original) {
  process.stderr.write(
    `goblin-mode: model "${target.slug}" has no base_instructions to override\n`
  );
  process.exit(1);
}

const cleaned = original
  .split("\n")
  .filter((line) => !/goblin/i.test(line))
  .join("\n");

if (cleaned === original) {
  process.stderr.write(
    `goblin-mode: no goblin clause found in "${target.slug}" base_instructions; launching codex unchanged\n`
  );
}

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "goblin-mode-"));
const tmpFile = path.join(tmpDir, `${target.slug}.md`);
fs.writeFileSync(tmpFile, cleaned);

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

const codexArgs = ["-c", `model_instructions_file=${tmpFile}`, ...args];
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
